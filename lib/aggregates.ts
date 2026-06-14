import { getPool, hasDatabase } from "./db";

// Aggregate / overall analytics from our owned tables. "RWA" view = non-crypto
// classes (the thesis); aggregates also expose crypto for context.

export interface DaySeriesPoint {
  day: string; // YYYY-MM-DD
  byKey: Record<string, number>; // category or venue -> notional USD
}

export interface OiPoint {
  t: number; // epoch seconds
  byKey: Record<string, number>; // category -> OI USD
}

export interface HeaderStats {
  asOf: string | null;
  totalOiUsd: number;
  rwaOiUsd: number; // non-crypto
  total24hUsd: number;
  rwa24hUsd: number;
  oiDodPct: number | null; // day-over-day % change of total OI
  volDodPct: number | null;
}

function pivot(
  rows: { k: string; bucket: string | number; v: number }[],
  bucketKey: "day" | "t",
): (DaySeriesPoint | OiPoint)[] {
  const map = new Map<string | number, Record<string, number>>();
  for (const r of rows) {
    const b = map.get(r.bucket) ?? {};
    b[r.k] = (b[r.k] ?? 0) + r.v;
    map.set(r.bucket, b);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, byKey]) =>
      bucketKey === "day"
        ? ({ day: String(bucket), byKey } as DaySeriesPoint)
        : ({ t: Number(bucket), byKey } as OiPoint),
    );
}

/** Daily notional split by asset class. */
export async function getDailyByClass(sinceDay: string): Promise<DaySeriesPoint[]> {
  if (!hasDatabase()) return [];
  const res = await getPool().query(
    `SELECT to_char(day,'YYYY-MM-DD') AS day, category, sum(notional_usd) AS notional
       FROM daily_volume
      WHERE day >= $1 AND category IS NOT NULL
      GROUP BY day, category ORDER BY day ASC`,
    [sinceDay],
  );
  return pivot(
    res.rows.map((r) => ({ k: r.category as string, bucket: r.day as string, v: Number(r.notional) })),
    "day",
  ) as DaySeriesPoint[];
}

/** Daily notional split by venue. */
export async function getDailyByVenue(sinceDay: string): Promise<DaySeriesPoint[]> {
  if (!hasDatabase()) return [];
  const res = await getPool().query(
    `SELECT to_char(day,'YYYY-MM-DD') AS day, venue, sum(notional_usd) AS notional
       FROM daily_volume
      WHERE day >= $1
      GROUP BY day, venue ORDER BY day ASC`,
    [sinceDay],
  );
  return pivot(
    res.rows.map((r) => ({ k: r.venue as string, bucket: r.day as string, v: Number(r.notional) })),
    "day",
  ) as DaySeriesPoint[];
}

/** Open interest over time by asset class (from snapshots). */
export async function getOiByClass(sinceMs: number): Promise<OiPoint[]> {
  if (!hasDatabase()) return [];
  const res = await getPool().query(
    `SELECT extract(epoch from ts)::bigint AS t, category, sum(oi_usd) AS oi
       FROM perp_snapshots
      WHERE ts >= to_timestamp($1/1000.0) AND category IS NOT NULL AND oi_usd IS NOT NULL
      GROUP BY ts, category ORDER BY ts ASC`,
    [sinceMs],
  );
  return pivot(
    res.rows.map((r) => ({ k: r.category as string, bucket: Number(r.t), v: Number(r.oi) })),
    "t",
  ) as OiPoint[];
}

/** Header strip: total + RWA OI / 24h notional now, with day-over-day change. */
export async function getHeaderStats(): Promise<HeaderStats> {
  const empty: HeaderStats = {
    asOf: null,
    totalOiUsd: 0,
    rwaOiUsd: 0,
    total24hUsd: 0,
    rwa24hUsd: 0,
    oiDodPct: null,
    volDodPct: null,
  };
  if (!hasDatabase()) return empty;
  const pool = getPool();

  const latest = await pool.query(
    `SELECT max(ts) AS ts FROM perp_snapshots`,
  );
  const latestTs = latest.rows[0]?.ts as string | null;
  if (!latestTs) return empty;

  // totals at the latest snapshot instant
  const totalsAt = async (ts: string) => {
    const r = await pool.query(
      `SELECT
         coalesce(sum(oi_usd),0) AS oi,
         coalesce(sum(oi_usd) FILTER (WHERE category <> 'crypto'),0) AS rwa_oi,
         coalesce(sum(vol24h),0) AS vol,
         coalesce(sum(vol24h) FILTER (WHERE category <> 'crypto'),0) AS rwa_vol
       FROM perp_snapshots WHERE ts = $1`,
      [ts],
    );
    const row = r.rows[0];
    return {
      oi: Number(row.oi),
      rwaOi: Number(row.rwa_oi),
      vol: Number(row.vol),
      rwaVol: Number(row.rwa_vol),
    };
  };

  const now = await totalsAt(latestTs);

  // closest snapshot ~24h before latest (for day-over-day)
  const prevTsRes = await pool.query(
    `SELECT ts FROM perp_snapshots
      WHERE ts <= $1::timestamptz - interval '24 hours'
      ORDER BY ts DESC LIMIT 1`,
    [latestTs],
  );
  const prevTs = prevTsRes.rows[0]?.ts as string | undefined;
  let oiDodPct: number | null = null;
  let volDodPct: number | null = null;
  if (prevTs) {
    const prev = await totalsAt(prevTs);
    if (prev.oi > 0) oiDodPct = (now.oi - prev.oi) / prev.oi;
    if (prev.vol > 0) volDodPct = (now.vol - prev.vol) / prev.vol;
  }

  return {
    asOf: new Date(latestTs).toISOString(),
    totalOiUsd: now.oi,
    rwaOiUsd: now.rwaOi,
    total24hUsd: now.vol,
    rwa24hUsd: now.rwaVol,
    oiDodPct,
    volDodPct,
  };
}

/**
 * Backfill category onto historical perp_snapshots rows (pre-Phase-3) using the
 * venue+symbol -> category mapping already in daily_volume. Lets OI-by-class
 * cover the full snapshot history.
 */
export async function backfillSnapshotCategory(): Promise<number> {
  if (!hasDatabase()) return 0;
  const res = await getPool().query(
    `UPDATE perp_snapshots ps
        SET category = m.category
       FROM (SELECT DISTINCT venue, symbol, category FROM daily_volume WHERE category IS NOT NULL) m
      WHERE ps.category IS NULL AND ps.venue = m.venue AND ps.symbol = m.symbol`,
  );
  return res.rowCount ?? 0;
}

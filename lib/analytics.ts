import { getPool, hasDatabase } from "./db";
import { canonicalFor } from "./canonicalAsset";
import type { AssetCategory } from "./types";

// Query layer for the Nivo analytical charts. All reads are from our owned
// tables (perp_snapshots, daily_volume). Every function degrades to an empty
// shape when the DB is unavailable so routes never crash.

const CLASSES = ["equity", "commodity", "index", "forex", "crypto"] as const;
type ClassRecord = Record<string, number>;

function zeroClasses(): ClassRecord {
  return { equity: 0, commodity: 0, index: 0, forex: 0, crypto: 0 };
}

// ── A. Treemap + E. same-asset: latest coherent snapshot slice ────────
export interface MarketRow {
  venue: string;
  symbol: string;
  category: string;
  oiUsd: number;
  vol24h: number | null;
  funding: number | null;
  markPx: number | null;
}

/** Every market at the most recent snapshot ts (one coherent slice). */
export async function getLatestMarkets(): Promise<{ asOf: string | null; markets: MarketRow[] }> {
  if (!hasDatabase()) return { asOf: null, markets: [] };
  const pool = getPool();
  const res = await pool.query(
    `SELECT venue, symbol, category, oi_usd, vol24h, funding, mark_px
       FROM perp_snapshots
      WHERE ts = (SELECT max(ts) FROM perp_snapshots)`,
  );
  const tsRes = await pool.query(`SELECT max(ts) AS ts FROM perp_snapshots`);
  const maxTs = tsRes.rows[0]?.ts as string | null;
  return {
    asOf: maxTs ? new Date(maxTs).toISOString() : null,
    markets: res.rows.map((r) => ({
      venue: r.venue as string,
      symbol: r.symbol as string,
      category: (r.category as string) ?? "crypto",
      oiUsd: r.oi_usd === null ? 0 : Number(r.oi_usd),
      vol24h: r.vol24h === null ? null : Number(r.vol24h),
      funding: r.funding === null ? null : Number(r.funding),
      markPx: r.mark_px === null ? null : Number(r.mark_px),
    })),
  };
}

// ── B. Class-share streamgraph: OI / vol per class over time ──────────
export interface ClassSharePoint {
  t: number; // epoch seconds
  equity: number;
  commodity: number;
  index: number;
  forex: number;
  crypto: number;
}

/**
 * Sum of `oi_usd` or `vol24h` by class at each snapshot ts. Every point carries
 * all five class keys (0-filled) so Nivo stream has a consistent stack. The
 * client normalizes to share via offset="expand".
 */
export async function getClassSeries(
  sinceMs: number,
  metric: "oi" | "vol",
): Promise<ClassSharePoint[]> {
  if (!hasDatabase()) return [];
  const col = metric === "vol" ? "vol24h" : "oi_usd";
  const res = await getPool().query(
    `SELECT extract(epoch from ts)::bigint AS t, category, sum(${col}) AS v
       FROM perp_snapshots
      WHERE ts >= to_timestamp($1/1000.0) AND category IS NOT NULL AND ${col} IS NOT NULL
      GROUP BY ts, category ORDER BY ts ASC`,
    [sinceMs],
  );
  const byTs = new Map<number, ClassSharePoint>();
  for (const r of res.rows) {
    const t = Number(r.t);
    const cat = r.category as string;
    const pt = byTs.get(t) ?? { t, ...zeroClasses() } as ClassSharePoint;
    if (cat in pt) (pt as unknown as ClassRecord)[cat] = Number(r.v);
    byTs.set(t, pt);
  }
  return [...byTs.values()].sort((a, b) => a.t - b.t);
}

// ── C. Calendar heatmap: daily notional per class ─────────────────────
export interface CalendarDay {
  day: string; // YYYY-MM-DD
  byClass: ClassRecord;
  total: number;
  rwa: number; // non-crypto
}

export async function getDailyCalendar(sinceDay: string): Promise<{
  from: string | null;
  to: string | null;
  days: CalendarDay[];
}> {
  if (!hasDatabase()) return { from: null, to: null, days: [] };
  const res = await getPool().query(
    `SELECT to_char(day,'YYYY-MM-DD') AS day, category, sum(notional_usd) AS v
       FROM daily_volume
      WHERE day >= $1 AND notional_usd IS NOT NULL
      GROUP BY day, category ORDER BY day ASC`,
    [sinceDay],
  );
  const byDay = new Map<string, CalendarDay>();
  for (const r of res.rows) {
    const day = r.day as string;
    const cat = (r.category as string) ?? "crypto";
    const v = Number(r.v);
    const d = byDay.get(day) ?? { day, byClass: zeroClasses(), total: 0, rwa: 0 };
    if (cat in d.byClass) d.byClass[cat] = (d.byClass[cat] ?? 0) + v;
    d.total += v;
    if (cat !== "crypto") d.rwa += v;
    byDay.set(day, d);
  }
  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  return {
    from: days[0]?.day ?? null,
    to: days[days.length - 1]?.day ?? null,
    days,
  };
}

// ── D. Venue rank bump: RWA OI rank per venue per day ─────────────────
export interface BumpPoint {
  x: string; // bucket label (YYYY-MM-DD)
  rank: number; // 1 = highest RWA OI
  oiUsd: number;
}
export interface BumpSeries {
  venue: string;
  points: BumpPoint[];
}

/**
 * Per UTC day, rank venues by total non-crypto (RWA) OI using the LAST snapshot
 * of that day. Returns one series per venue. Sparse by nature — gated to days we
 * actually snapshotted.
 */
export async function getVenueRank(sinceMs: number): Promise<{
  buckets: string[];
  series: BumpSeries[];
}> {
  if (!hasDatabase()) return { buckets: [], series: [] };
  // last snapshot ts per UTC day, then sum RWA OI per venue at that ts.
  const res = await getPool().query(
    `WITH last_per_day AS (
       SELECT max(ts) AS ts, (ts AT TIME ZONE 'UTC')::date AS day
         FROM perp_snapshots
        WHERE ts >= to_timestamp($1/1000.0)
        GROUP BY (ts AT TIME ZONE 'UTC')::date
     )
     SELECT to_char(l.day,'YYYY-MM-DD') AS day, ps.venue, sum(ps.oi_usd) AS oi
       FROM last_per_day l
       JOIN perp_snapshots ps ON ps.ts = l.ts
      WHERE ps.category <> 'crypto' AND ps.oi_usd IS NOT NULL
      GROUP BY l.day, ps.venue
      ORDER BY l.day ASC`,
    [sinceMs],
  );
  const buckets: string[] = [];
  const perDay = new Map<string, { venue: string; oi: number }[]>();
  for (const r of res.rows) {
    const day = r.day as string;
    if (!perDay.has(day)) {
      perDay.set(day, []);
      buckets.push(day);
    }
    perDay.get(day)!.push({ venue: r.venue as string, oi: Number(r.oi) });
  }
  const venues = new Set<string>();
  for (const arr of perDay.values()) for (const e of arr) venues.add(e.venue);

  const series: BumpSeries[] = [...venues].map((venue) => ({ venue, points: [] }));
  const byVenue = new Map(series.map((s) => [s.venue, s]));
  for (const day of buckets) {
    const ranked = [...perDay.get(day)!].sort((a, b) => b.oi - a.oi);
    ranked.forEach((e, i) => {
      byVenue.get(e.venue)!.points.push({ x: day, rank: i + 1, oiUsd: e.oi });
    });
  }
  return { buckets, series };
}

// ── E. Same-asset across venues ───────────────────────────────────────
export interface CanonicalAssetOption {
  key: string;
  label: string;
  category: string;
  venueCount: number;
}
export interface SameAssetVenue {
  venue: string;
  symbol: string;
  oiUsd: number;
  vol24h: number | null;
  funding: number | null;
  markPx: number | null;
}

/** Canonical assets listed on ≥2 venues at the latest snapshot (non-crypto). */
export async function getCanonicalOptions(): Promise<CanonicalAssetOption[]> {
  const { markets } = await getLatestMarkets();
  const groups = new Map<string, { label: string; category: string; venues: Set<string> }>();
  for (const m of markets) {
    if (m.category === "crypto") continue;
    const ref = canonicalFor(m.symbol, m.category as AssetCategory);
    const g = groups.get(ref.key) ?? { label: ref.label, category: ref.category, venues: new Set<string>() };
    g.venues.add(m.venue);
    groups.set(ref.key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, category: g.category, venueCount: g.venues.size }))
    .filter((o) => o.venueCount >= 2)
    .sort((a, b) => b.venueCount - a.venueCount || a.label.localeCompare(b.label));
}

/** Per-venue OI / funding / mark for one canonical asset at the latest snapshot. */
export async function getSameAsset(key: string): Promise<{
  asOf: string | null;
  label: string;
  category: string | null;
  venues: SameAssetVenue[];
}> {
  const { asOf, markets } = await getLatestMarkets();
  let label = key;
  let category: string | null = null;
  const venues: SameAssetVenue[] = [];
  for (const m of markets) {
    if (m.category === "crypto") continue;
    const ref = canonicalFor(m.symbol, m.category as AssetCategory);
    if (ref.key !== key) continue;
    label = ref.label;
    category = ref.category;
    venues.push({
      venue: m.venue,
      symbol: m.symbol,
      oiUsd: m.oiUsd,
      vol24h: m.vol24h,
      funding: m.funding,
      markPx: m.markPx,
    });
  }
  venues.sort((a, b) => b.oiUsd - a.oiUsd);
  return { asOf, label, category, venues };
}

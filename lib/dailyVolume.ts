import { aggregatePerps } from "./aggregate";
import { categoryFor } from "./assetClass";
import { ensureSchema, getPool, hasDatabase } from "./db";
import type { AssetCategory } from "./types";

// ── Daily notional volume ─────────────────────────────────────────────
// One USD-notional figure per market per UTC day. Sources, with honesty about
// exactness (see CLAUDE.md "Daily volume definition"):
//   - dYdX:   /v4/candles ... resolution=1DAY -> usdVolume          EXACT
//   - Ostium: trade events bucketed by UTC day, sum notional (1e6)  EXACT (opened notional)
//   - HL/HIP-3: 1d candle base-vol × close                          APPROX (no quote vol)
//   - going-forward rollup from perp_snapshots: trailing-24h vol
//     sampled at the last snapshot of each UTC day                  APPROX (rolling sample)
//
// Upsert precedence: an EXACT value may replace anything; an APPROX value only
// fills/updates a day that has no exact value yet. So the snapshot rollup never
// clobbers an exact seeded day.

export interface DailyVolRow {
  venue: string;
  symbol: string;
  day: string; // YYYY-MM-DD (UTC)
  notionalUsd: number;
  category: AssetCategory;
  source: string;
  isApprox: boolean;
}

const HL_INFO = "https://api.hyperliquid.xyz/info";
const DYDX_CANDLES = "https://indexer.dydx.trade/v4/candles/perpetualMarkets";
const OSTIUM_SUBGRAPH =
  "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

const dayUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Bulk upsert with exact-beats-approx precedence. */
export async function upsertDailyVolume(rows: DailyVolRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  await ensureSchema();
  const pool = getPool();
  let written = 0;
  // 7 params/row; chunk to stay well under Postgres' 65535 parameter limit.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = slice.map((r, j) => {
      const b = j * 7;
      values.push(
        r.venue,
        r.symbol,
        r.day,
        r.notionalUsd,
        r.category,
        r.source,
        r.isApprox,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    const res = await pool.query(
      `INSERT INTO daily_volume (venue, symbol, day, notional_usd, category, source, is_approx)
       VALUES ${tuples.join(",")}
       ON CONFLICT (venue, symbol, day) DO UPDATE SET
         notional_usd = EXCLUDED.notional_usd,
         category     = EXCLUDED.category,
         source       = EXCLUDED.source,
         is_approx    = EXCLUDED.is_approx,
         updated_at   = now()
       WHERE daily_volume.is_approx = true OR EXCLUDED.is_approx = false`,
      values,
    );
    written += res.rowCount ?? 0;
  }
  return written;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (t: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Seeders (historical backfill) ─────────────────────────────────────

interface HlCandle {
  t: number;
  c: string;
  v: string;
}

function hlCoin(venue: string, symbol: string): string | null {
  if (venue === "Hyperliquid") return symbol;
  if (venue === "Hyperliquid HIP-3") return `xyz:${symbol}`;
  return null;
}

/** HL/HIP-3 daily notional ≈ base-vol × close (APPROX). */
export async function seedHlDaily(
  markets: { venue: string; symbol: string; category: AssetCategory }[],
  startMs: number,
): Promise<DailyVolRow[]> {
  const rows: DailyVolRow[] = [];
  await mapLimit(markets, 6, async (m) => {
    const coin = hlCoin(m.venue, m.symbol);
    if (!coin) return;
    try {
      const res = await fetch(HL_INFO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "candleSnapshot",
          req: { coin, interval: "1d", startTime: startMs, endTime: Date.now() },
        }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const candles = (await res.json()) as HlCandle[];
      for (const k of candles) {
        const close = Number(k.c);
        const notional = Number(k.v) * close;
        if (!Number.isFinite(notional)) continue;
        rows.push({
          venue: m.venue,
          symbol: m.symbol,
          day: dayUTC(k.t),
          notionalUsd: notional,
          category: m.category,
          source: "Hyperliquid 1d candle (base×close)",
          isApprox: true,
        });
      }
    } catch {
      /* per-symbol failure is non-fatal */
    }
  });
  return rows;
}

interface DydxCandle {
  startedAt: string;
  usdVolume: string;
}

/** dYdX daily usdVolume (EXACT). */
export async function seedDydxDaily(
  markets: { symbol: string }[],
): Promise<DailyVolRow[]> {
  const rows: DailyVolRow[] = [];
  await mapLimit(markets, 6, async (m) => {
    try {
      const res = await fetch(
        `${DYDX_CANDLES}/${m.symbol}-USD?resolution=1DAY&limit=60`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const json = (await res.json()) as { candles?: DydxCandle[] };
      for (const c of json.candles ?? []) {
        const notional = Number(c.usdVolume);
        if (!Number.isFinite(notional)) continue;
        rows.push({
          venue: "dYdX",
          symbol: m.symbol,
          day: dayUTC(new Date(c.startedAt).getTime()),
          notionalUsd: notional,
          category: "crypto",
          source: "dYdX 1d candle usdVolume",
          isApprox: false,
        });
      }
    } catch {
      /* non-fatal */
    }
  });
  return rows;
}

/** Ostium daily opened notional bucketed by UTC day from trade events (EXACT). */
export async function seedOstiumDaily(startSec: number): Promise<DailyVolRow[]> {
  const buckets = new Map<string, number>(); // `${from}|${day}` -> usd
  let after = startSec;
  for (let guard = 0; guard < 200; guard++) {
    const query = `{
      trades(first: 1000, orderBy: timestamp, orderDirection: asc, where: { timestamp_gte: ${after} }) {
        timestamp
        notional
        pair { from }
      }
    }`;
    const res = await fetch(OSTIUM_SUBGRAPH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      data?: { trades?: { timestamp: string; notional: string; pair: { from: string } }[] };
    };
    const trades = json.data?.trades ?? [];
    for (const t of trades) {
      const usd = Number(t.notional) / 1e6; // notional is USD * 1e6 (verified)
      if (!Number.isFinite(usd)) continue;
      const key = `${t.pair.from}|${dayUTC(Number(t.timestamp) * 1000)}`;
      buckets.set(key, (buckets.get(key) ?? 0) + usd);
    }
    if (trades.length < 1000) break;
    after = Number(trades[trades.length - 1]!.timestamp) + 1;
  }
  const rows: DailyVolRow[] = [];
  for (const [key, usd] of buckets) {
    const [symbol, day] = key.split("|") as [string, string];
    rows.push({
      venue: "Ostium",
      symbol,
      day,
      notionalUsd: usd,
      category: categoryFor("Ostium", symbol),
      source: "Ostium trades (opened notional)",
      isApprox: false,
    });
  }
  return rows;
}

/**
 * Backfill daily_volume for all current markets over the last `daysBack` days,
 * from each venue's best source. Per-venue failures don't sink the rest.
 */
export async function seedDailyVolume(
  daysBack = 14,
): Promise<{ written: number; byVenue: Record<string, number> }> {
  if (!hasDatabase()) return { written: 0, byVenue: {} };
  const startMs = Date.now() - daysBack * 86_400_000;
  const startSec = Math.floor(startMs / 1000);

  const perps = await aggregatePerps();
  const hl = perps.markets.filter(
    (m) => m.venue === "Hyperliquid" || m.venue === "Hyperliquid HIP-3",
  );
  const dydx = perps.markets.filter((m) => m.venue === "dYdX");

  const [hlRows, dydxRows, ostiumRows] = await Promise.all([
    seedHlDaily(hl, startMs).catch(() => [] as DailyVolRow[]),
    seedDydxDaily(dydx).catch(() => [] as DailyVolRow[]),
    seedOstiumDaily(startSec).catch(() => [] as DailyVolRow[]),
  ]);

  const written =
    (await upsertDailyVolume(hlRows)) +
    (await upsertDailyVolume(dydxRows)) +
    (await upsertDailyVolume(ostiumRows));

  return {
    written,
    byVenue: {
      "Hyperliquid+HIP-3": hlRows.length,
      dYdX: dydxRows.length,
      Ostium: ostiumRows.length,
    },
  };
}

/**
 * Going-forward owned record: for each (venue, symbol, UTC day) covered by our
 * snapshots, take the trailing-24h volume sampled at the last snapshot of the
 * day. APPROX (rolling-24h sample aligned to the day boundary). Won't overwrite
 * an exact seeded value.
 */
export async function rollupDailyFromSnapshots(): Promise<number> {
  if (!hasDatabase()) return 0;
  await ensureSchema();
  const res = await getPool().query(
    `INSERT INTO daily_volume (venue, symbol, day, notional_usd, category, source, is_approx)
     SELECT venue, symbol, day, vol24h, category,
            'EWA snapshots (trailing-24h sample)', true
       FROM (
         SELECT venue, symbol, (ts AT TIME ZONE 'UTC')::date AS day, vol24h, category,
                ROW_NUMBER() OVER (
                  PARTITION BY venue, symbol, (ts AT TIME ZONE 'UTC')::date
                  ORDER BY ts DESC
                ) AS rn
           FROM perp_snapshots
          WHERE vol24h IS NOT NULL AND category IS NOT NULL
       ) last_of_day
      WHERE rn = 1
     ON CONFLICT (venue, symbol, day) DO UPDATE SET
       notional_usd = EXCLUDED.notional_usd, source = EXCLUDED.source,
       is_approx = EXCLUDED.is_approx, updated_at = now()
     WHERE daily_volume.is_approx = true OR EXCLUDED.is_approx = false`,
  );
  return res.rowCount ?? 0;
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function getDailyVolume(
  venue: string,
  symbol: string,
  sinceDay: string,
): Promise<{ day: string; notionalUsd: number; isApprox: boolean; source: string }[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const res = await getPool().query(
    // to_char avoids node-postgres parsing DATE at local midnight (TZ off-by-one).
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, notional_usd, is_approx, source
       FROM daily_volume
      WHERE venue = $1 AND symbol = $2 AND day >= $3
      ORDER BY day ASC`,
    [venue, symbol, sinceDay],
  );
  return res.rows.map((r) => ({
    day: r.day as string,
    notionalUsd: r.notional_usd === null ? 0 : Number(r.notional_usd),
    isApprox: Boolean(r.is_approx),
    source: r.source as string,
  }));
}

import { aggregatePerps, aggregateTokens } from "./aggregate";
import { rollupDailyFromSnapshots } from "./dailyVolume";
import { ensureSchema, getPool } from "./db";

export interface SnapshotResult {
  ts: string;
  perpRows: number;
  tokenRows: number;
  dailyRollupRows: number;
  skipped?: string;
  venues: { venue: string; status: string; count: number }[];
}

/**
 * Fetch all perp markets + token premiums and persist one snapshot row per
 * market/token. Uses a single multi-row INSERT per table. Shares a timestamp so
 * a snapshot is a coherent point-in-time slice.
 */
export async function takeSnapshot(): Promise<SnapshotResult> {
  await ensureSchema();
  const pool = getPool();
  const ts = new Date();

  const [perps, tokens] = await Promise.all([
    aggregatePerps(),
    aggregateTokens(),
  ]);

  // A snapshot is a coherent cross-venue OI slice. If a normally-live venue
  // failed, the totals would be partial and poison the aggregate time-series (a
  // fake dip to ~0). Skip the whole perp write rather than store a misleading
  // slice — a gap is honest; a partial total is not. A "pending" venue (no
  // public API yet, e.g. Variational) is EXPECTED to be empty and must not block
  // the snapshot.
  const downVenues = perps.venues.filter(
    (v) => v.status === "error" || (v.status === "ok" && v.count === 0),
  );
  if (downVenues.length > 0) {
    return {
      ts: ts.toISOString(),
      perpRows: 0,
      tokenRows: 0,
      dailyRollupRows: 0,
      skipped: `partial capture — venue(s) down: ${downVenues.map((v) => v.venue).join(", ")}`,
      venues: perps.venues.map((v) => ({ venue: v.venue, status: v.status, count: v.count })),
    };
  }

  // ── perp_snapshots ────────────────────────────────────────────────
  let perpRows = 0;
  if (perps.markets.length > 0) {
    const values: unknown[] = [];
    const tuples = perps.markets.map((m, i) => {
      const b = i * 8;
      values.push(
        m.venue,
        m.symbol,
        ts,
        m.oiUsd,
        m.funding,
        m.vol24hUsd,
        m.markPx,
        m.category,
      );
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
    });
    const res = await pool.query(
      `INSERT INTO perp_snapshots (venue, symbol, ts, oi_usd, funding, vol24h, mark_px, category)
       VALUES ${tuples.join(",")}`,
      values,
    );
    perpRows = res.rowCount ?? 0;
  }

  // ── token_snapshots ───────────────────────────────────────────────
  let tokenRows = 0;
  if (tokens.tokens.length > 0) {
    const values: unknown[] = [];
    const tuples = tokens.tokens.map((t, i) => {
      const b = i * 5;
      values.push(t.symbol, ts, t.tokenUsdPrice, t.realSpotPrice, t.premium);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    const res = await pool.query(
      `INSERT INTO token_snapshots (ticker, ts, token_px, ref_px, premium)
       VALUES ${tuples.join(",")}`,
      values,
    );
    tokenRows = res.rowCount ?? 0;
  }

  // Going-forward owned daily record from our snapshots (won't clobber exact
  // seeded days). Cheap SQL aggregation; non-fatal if it fails.
  let dailyRollupRows = 0;
  try {
    dailyRollupRows = await rollupDailyFromSnapshots();
  } catch {
    dailyRollupRows = 0;
  }

  return {
    ts: ts.toISOString(),
    perpRows,
    tokenRows,
    dailyRollupRows,
    venues: perps.venues.map((v) => ({
      venue: v.venue,
      status: v.status,
      count: v.count,
    })),
  };
}

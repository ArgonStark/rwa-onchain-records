import { Pool } from "pg";

// Postgres persistence (Phase 2). Owned time-series we snapshot ourselves —
// no public API back-fills RWA perp OI/funding or token premium, so this is what
// makes our historical metrics defensible. Connection via DATABASE_URL (server
// only). All callers degrade gracefully when DATABASE_URL is unset.

let pool: Pool | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — persistence layer is disabled");
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS perp_snapshots (
  id       BIGSERIAL PRIMARY KEY,
  venue    TEXT        NOT NULL,
  symbol   TEXT        NOT NULL,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  oi_usd   DOUBLE PRECISION,
  funding  DOUBLE PRECISION,
  vol24h   DOUBLE PRECISION,
  mark_px  DOUBLE PRECISION,
  category TEXT
);
-- carry asset class on each snapshot so the daily rollup + class aggregates need
-- no per-symbol lookup (added after Phase 2; migrate existing tables).
ALTER TABLE perp_snapshots ADD COLUMN IF NOT EXISTS category TEXT;
CREATE INDEX IF NOT EXISTS idx_perp_snap_lookup
  ON perp_snapshots (venue, symbol, ts DESC);

CREATE TABLE IF NOT EXISTS token_snapshots (
  id       BIGSERIAL PRIMARY KEY,
  ticker   TEXT        NOT NULL,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_px DOUBLE PRECISION,
  ref_px   DOUBLE PRECISION,
  premium  DOUBLE PRECISION,
  supply   DOUBLE PRECISION  -- circulating/total supply in token units (Phase 4)
);
-- Phase 4 migration: add supply column to pre-existing tables
ALTER TABLE token_snapshots ADD COLUMN IF NOT EXISTS supply DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS idx_token_snap_lookup
  ON token_snapshots (ticker, ts DESC);

-- Daily notional volume (Phase 3). One row per market per UTC day. is_approx
-- flags series that are not an exact midnight-to-midnight USD-notional sum (see
-- lib/dailyVolume.ts and CLAUDE.md). category stored so aggregate-by-class reads
-- need no per-symbol lookup.
CREATE TABLE IF NOT EXISTS daily_volume (
  venue        TEXT        NOT NULL,
  symbol       TEXT        NOT NULL,
  day          DATE        NOT NULL,
  notional_usd DOUBLE PRECISION,
  category     TEXT,
  source       TEXT        NOT NULL,
  is_approx    BOOLEAN     NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol, day)
);
CREATE INDEX IF NOT EXISTS idx_daily_vol_day ON daily_volume (day);
CREATE INDEX IF NOT EXISTS idx_daily_vol_lookup ON daily_volume (venue, symbol, day);
`;

let schemaReady = false;

/** Idempotent CREATE TABLE IF NOT EXISTS — no separate migration step needed. */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(SCHEMA);
  schemaReady = true;
}

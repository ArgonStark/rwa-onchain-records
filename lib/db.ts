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
  mark_px  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_perp_snap_lookup
  ON perp_snapshots (venue, symbol, ts DESC);

CREATE TABLE IF NOT EXISTS token_snapshots (
  id       BIGSERIAL PRIMARY KEY,
  ticker   TEXT        NOT NULL,
  ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_px DOUBLE PRECISION,
  ref_px   DOUBLE PRECISION,
  premium  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS idx_token_snap_lookup
  ON token_snapshots (ticker, ts DESC);
`;

let schemaReady = false;

/** Idempotent CREATE TABLE IF NOT EXISTS — no separate migration step needed. */
export async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  await getPool().query(SCHEMA);
  schemaReady = true;
}

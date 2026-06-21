// Phase 4 — On-chain issuance metrics for tokenized RWA.
//
// Primary method (no API key needed): compare circulating supply snapshots
// stored in token_snapshots (recorded every 15 min by the cron). Net issuance
// over a window = supply_now - supply_then. Accumulates naturally; first 7d
// delta appears after 7 days of snapshots, 30d after 30 days.
//
// Source:
//   Ethereum ERC-20 (PAXG, XAUT): CoinGecko circulating_supply via /coins/{id}
//   Solana SPL (xStocks): Jupiter v3 scaledUiConfig.circSupplyPrescaled

import { getPool, hasDatabase } from "../db";
import { SPOT_TOKENS } from "../../data/tokens";

export interface IssuanceToken {
  symbol: string;
  name: string;
  chain: "Ethereum" | "Solana";
  address: string;
  underlying: string;
  supplyNow: number | null;       // current circulating supply (token units)
  supplyNowUsd: number | null;    // × current price
  supply7dAgo: number | null;     // supply 7 days ago (from DB snapshot)
  supply30dAgo: number | null;    // supply 30 days ago (from DB snapshot)
  net7dUnits: number | null;      // supplyNow - supply7dAgo
  net7dUsd: number | null;
  net30dUnits: number | null;
  net30dUsd: number | null;
  /** How many days of supply history we have (determines which deltas are real). */
  historyDays: number;
  source: string;
}

export async function getIssuance(): Promise<IssuanceToken[]> {
  if (!hasDatabase()) return buildNoDb();
  const pool = getPool();

  // For each token, fetch: latest supply snapshot, ~7d-ago snapshot, ~30d-ago snapshot
  // One query per token would be fine at 7 tokens; use a single batched query.
  const tickers = SPOT_TOKENS.map((t) => t.symbol);

  const res = await pool.query(
    `SELECT
       ticker,
       -- latest supply
       (SELECT supply FROM token_snapshots s1
        WHERE s1.ticker = t.ticker AND supply IS NOT NULL
        ORDER BY ts DESC LIMIT 1) AS supply_now,
       -- latest token price (for USD conversion)
       (SELECT token_px FROM token_snapshots s2
        WHERE s2.ticker = t.ticker AND token_px IS NOT NULL
        ORDER BY ts DESC LIMIT 1) AS price_now,
       -- closest snapshot to 7d ago
       (SELECT supply FROM token_snapshots s3
        WHERE s3.ticker = t.ticker AND supply IS NOT NULL
          AND ts <= now() - interval '7 days'
        ORDER BY ts DESC LIMIT 1) AS supply_7d,
       -- closest snapshot to 30d ago
       (SELECT supply FROM token_snapshots s4
        WHERE s4.ticker = t.ticker AND supply IS NOT NULL
          AND ts <= now() - interval '30 days'
        ORDER BY ts DESC LIMIT 1) AS supply_30d,
       -- oldest supply snapshot (to compute history length)
       (SELECT ts FROM token_snapshots s5
        WHERE s5.ticker = t.ticker AND supply IS NOT NULL
        ORDER BY ts ASC LIMIT 1) AS oldest_supply_ts
     FROM unnest($1::text[]) AS t(ticker)`,
    [tickers],
  );

  const byTicker = new Map(res.rows.map((r) => [r.ticker as string, r]));

  return SPOT_TOKENS.map((t) => {
    const row = byTicker.get(t.symbol);
    const supplyNow   = row?.supply_now   != null ? Number(row.supply_now)   : null;
    const priceNow    = row?.price_now    != null ? Number(row.price_now)    : null;
    const supply7d    = row?.supply_7d    != null ? Number(row.supply_7d)    : null;
    const supply30d   = row?.supply_30d   != null ? Number(row.supply_30d)   : null;
    const oldestTs    = row?.oldest_supply_ts ? new Date(row.oldest_supply_ts as string) : null;
    const historyDays = oldestTs
      ? Math.floor((Date.now() - oldestTs.getTime()) / 86_400_000)
      : 0;

    const net7d  = supplyNow != null && supply7d  != null ? supplyNow - supply7d  : null;
    const net30d = supplyNow != null && supply30d != null ? supplyNow - supply30d : null;

    return {
      symbol:       t.symbol,
      name:         t.name,
      chain:        t.chain as "Ethereum" | "Solana",
      address:      t.address,
      underlying:   t.underlying ?? "",
      supplyNow,
      supplyNowUsd: supplyNow != null && priceNow != null ? supplyNow * priceNow : null,
      supply7dAgo:  supply7d,
      supply30dAgo: supply30d,
      net7dUnits:   net7d,
      net7dUsd:     net7d != null && priceNow != null ? net7d * priceNow : null,
      net30dUnits:  net30d,
      net30dUsd:    net30d != null && priceNow != null ? net30d * priceNow : null,
      historyDays,
      source: t.chain === "Ethereum"
        ? "CoinGecko circulating_supply snapshots (ERC-20)"
        : "Jupiter v3 circSupplyPrescaled snapshots (SPL)",
    };
  });
}

/** Fallback when DB is unavailable. */
function buildNoDb(): IssuanceToken[] {
  return SPOT_TOKENS.map((t) => ({
    symbol: t.symbol, name: t.name,
    chain: t.chain as "Ethereum" | "Solana",
    address: t.address, underlying: t.underlying ?? "",
    supplyNow: null, supplyNowUsd: null,
    supply7dAgo: null, supply30dAgo: null,
    net7dUnits: null, net7dUsd: null,
    net30dUnits: null, net30dUsd: null,
    historyDays: 0,
    source: "DB unavailable",
  }));
}

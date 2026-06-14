# EWA Onchain Records

On-chain analytics for tokenized real-world assets: gold, equities, forex, commodities —
both spot tokens and RWA perps. The thesis is ORIGINAL metrics that aggregators skip:
on-chain premium/discount vs real spot, net issuance (mint/burn) flow, unified OI/funding
across perp venues, and perp–spot basis. Not a re-served price feed.

## Stack
- Next.js App Router + TypeScript. Data fetched in API routes (server-side), never trust
  raw API calls from the browser. Tailwind for styling.
- No database in Phase 1; use an in-memory TTL cache (lib/cache.ts). Add Postgres only
  when we start storing historical series ourselves.

## Data rules
- Phase 1 = PUBLIC, no-key sources only: Hyperliquid /info, Ostium metadata+subgraph,
  dYdX indexer, DefiLlama. See docs/DATA_SOURCES.md for endpoints and exact field names.
- Before trusting any endpoint, make one real call and log the shape. If a field name or
  URL in the docs can't be confirmed live, flag it in a comment — never invent endpoints.
- Every metric must carry its source venue so the UI can attribute it.
- Keep all keys server-side in .env (Phase 2+). Nothing secret in client bundles.

## Metric definitions (lib/metrics.ts)
- premium  = tokenUsdPrice / realSpotPrice - 1          // gold & equities
- basis    = perpMarkPrice - spotTokenPrice             // where both legs exist
- skew     = longOI / (longOI + shortOI)                // 0..1, render as % long
- issuance = mints - burns over a window                // from Transfer to/from zero addr

## Conventions
- Strict TypeScript, no `any`. Shared shapes in lib/types.ts.
- Each source file exposes one async function returning normalized objects.
- Graceful degradation: if a venue is unreachable, return its rows empty + a status flag,
  don't crash the whole route.
- Equity premium only meaningful during/around market hours; gate or label off-hours.

## Verified source facts (Phase 2 — confirmed against live data, not docs)

### Ostium funding (lib/sources/ostiumFunding.ts) — read from CONTRACT, not subgraph
- The subgraph `lastFundingRate`/`curFundingLong`/`curFundingShort` are 0 on every pair.
  This is NOT a bug: Ostium currently has `maxFundingFeePerBlock = 0` on every pair, and
  `targetRate = maxFundingFeePerBlock × hill(skew)`, so the funding rate is genuinely 0
  protocol-wide right now. Confirmed identically across three sources on 2026-06-14: the
  Ormi subgraph, the PairInfos contract, and the app's own `app.ostium.com/api/pairs`
  (what the trade UI renders). The hill shape (hillPosScale/springFactor) is configured;
  the magnitude cap is switched off. `accFunding*` accumulators are non-zero but historical.
- Canonical source = PairInfos contract `getPendingAccFundingFees(uint16 pairIndex)` →
  `(accFundingLong, accFundingShort, latestFundingRate /*int64, per-block, 1e18*/, targetFundingRate)`.
  It runs the full spring/hill math on-chain at the current block. We read this so the real
  rate surfaces automatically the moment Ostium sets the cap > 0.
- Scaling/units: `funding` in PerpMarket is the **hourly fraction** (to match HL/dYdX):
  `latestFundingRate/1e18 × (10/3) × 3600`. The `10/3` is Arbitrum blocks/sec (~0.3s
  blocks) — Ostium's own SDK uses this exact constant. Positive ⇒ longs pay shorts.
- Address resolution: PairInfos via `TradingStorage(0xcCd5...66E7).registry()` →
  `registry.getContractAddress(bytes32('pairInfos'))`. Resolved 2026-06-14 =
  `0x3890243A8fc091C626ED26c087A028B46Bc9d66C` (don't hardcode; it's registry-managed).
- Needs an Arbitrum RPC (env `ARBITRUM_RPC_URL`, server-side; defaults to public arb1).
  A present `funding: 0` = the real verified rate; `null` = the RPC read failed.
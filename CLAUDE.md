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
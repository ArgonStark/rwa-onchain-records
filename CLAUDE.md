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

### Equity premium reference (xStocks) — audited NOT circular
- Jupiter price v3 returns two independent numbers per xStock: `usdPrice` (the
  on-chain DEX price of the token, ~$1.8M pools) and `stockData.price` (a real
  off-chain equity feed). Confirmed independent 2026-06-14: `stockData` carries
  the true company market cap (TSLA ~$1.5T, NVDA ~$5T — impossible to derive from
  on-chain token data), and `stockData.price` matched independent Yahoo quotes
  within ~0.1% (TSLA 406.1/406.4, NVDA 205.4/205.2, AAPL 291.5/291.1). So
  premium = token DEX price ÷ real share price − 1 is the genuine tokenization
  premium/discount, not a token-vs-itself artifact. A keyed equities API
  (Finnhub/Polygon) can be added later as an independent cross-check.

### Daily notional volume definition (lib/dailyVolume.ts, table daily_volume)
`daily_volume.notional_usd` = USD notional traded in a market over one **UTC
calendar day**. `is_approx` flags any series that is not an exact
midnight-to-midnight notional sum. Per-venue sources and why:
- **dYdX** — `/v4/candles?resolution=1DAY` `usdVolume`. EXACT (is_approx=false).
- **Ostium** — `trade` events bucketed by UTC day, `sum(notional/1e6)`. EXACT for
  the "opened-position notional" definition (Ostium has no day-data entity); same
  caveat as the 24h figure. Keep the "our owned record / no public API back-fills"
  label on Ostium series.
- **Hyperliquid + HIP-3** — 1d `candleSnapshot`, `notional ≈ base_vol × close`.
  APPROX (is_approx=true): HL candles carry only base volume, no quote volume, so
  intraday price variation isn't captured. Verified this reproduces the known
  xyz:SPCX spike (2026-06-12 ≈ $1.37B, the SpaceX listing day).
- **Going forward** — `rollupDailyFromSnapshots()` takes, per (venue,symbol,UTC
  day), the trailing-24h volume (`vol24h`) sampled at the **last snapshot of the
  day**. APPROX: a rolling-24h sample aligned to the day boundary, not an exact
  calendar-day sum. This is our owned record once snapshots span days.
- **Upsert precedence**: EXACT replaces anything; APPROX only fills/updates a day
  with no exact value — so the snapshot rollup never clobbers an exact seeded day.
- **DefiLlama cross-check is NOT available**: as of 2026 `/overview/derivatives`
  and `/summary/derivatives/*` return HTTP 402 (paid plan). We rely on each
  venue's own authoritative daily source instead; documented, not invented.

### Ostium 24h volume — aggregated from trades (no day-data entity)
- The subgraph has NO per-pair day-data entity (only `shareToAssetsPriceDaily` =
  vault LP price). Verified the full entity list 2026-06-14. We compute real 24h
  volume by aggregating `trade.notional` (USD, scaled 1e6) over the last 24h,
  paginated by timestamp. This is "24h opened-position notional" — it counts
  opens, slightly narrower than full taker volume; labelled as such. `null` =
  aggregation failed; `0` = genuinely no trades (e.g. RWA pairs over a weekend).

### Perp-spot basis (Phase 5, lib/basis.ts) — pair by a PRICE GUARD, not name
- `basis = perpMark / spotTokenPrice − 1` (the on-chain token price = the spot
  leg, per the metric def), computed only where both legs exist at the latest
  snapshot. Positive ⇒ perp richer than the token. Verified live 2026-06-19:
  Gold +0.14%, NVDA +0.07%, AAPL +0.05%, TSLA +0.04%, S&P 500 +0.01%, CRCL −0.02%
  — all sub-1%, as tokenization basis should be.
- Pairing tokens to perps by SYMBOL ALONE is unsafe because venues reuse names
  across scales/assets. Confirmed live: `SP500`/some `US500` = the S&P INDEX
  LEVEL (~7490), 10× the SPY-ETF scale (~746); `SPX` on Aster/Lighter = the
  SPX6900 MEMECOIN (~$0.36). Even the SAME symbol (`US500`) appears at BOTH
  scales across venues (Variational ~746 vs Lighter ~7490).
- So we pair a curated symbol set per token AND gate with a ±10% price-proximity
  guard (`PRICE_TOL`): a perp only pairs if its mark is within 10% of the token
  price. Real basis is sub-1%, so the guard drops every scale/asset mismatch and
  never a genuine pair. For SPYx this correctly selects Variational `US500` (746)
  and rejects the index-level and memecoin contracts.
- One dot per asset = the deepest (highest-OI) in-scale perp leg. Tokens:
  PAXG/XAUT→gold, AAPLx/NVDAx/TSLAx/CRCLx→their tickers, SPYx→S&P-500 ETF scale.
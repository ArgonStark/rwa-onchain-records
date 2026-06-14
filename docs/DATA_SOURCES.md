# EWA Onchain Records — Technical Data-Source & API Reference (2026)

## TL;DR
- **For RWA perps**, Ostium (Arbitrum) is the specialist with the broadest non-crypto coverage (71 pairs; ~91% of open interest in non-crypto assets), Hyperliquid's HIP-3 / Trade[XYZ] is the volume leader for equities/commodities (HIP-3 posted over $62B volume in May 2026), and both expose fully public, browser-callable market-data APIs. Wire Ostium, Hyperliquid and Variational first.
- **For spot tokenized assets**, tokenized gold (PAXG, XAUT) lives on Ethereum with public Etherscan/CoinGecko data; tokenized equities (Backed xStocks) live primarily on Solana (~93% market share as of Jan 19, 2026 per solana.com) with verified SPL mints, plus Ondo Global Markets and Dinari on EVM chains.
- **For aggregated metrics**, DefiLlama (free; cross-venue OI + perp volume + RWA category), CoinGlass (paid; historical OI/funding OHLC), rwa.xyz (free tier + $500/seat Pro + Enterprise API) and CoinGecko are the backbone. Most venue APIs are public for market data and need a backend proxy only to hide auth keys / rate limits, not for access.

## Key Findings
- The single most actionable RWA-perp integration is **Ostium**: a public REST metadata backend plus a Python SDK over a Goldsky subgraph, with verified Arbitrum contracts. Hyperliquid's HIP-3 namespaced markets (`xyz:TSLA`, `xyz:NVDA`, `xyz:XYZ100`) give you equities/commodities/FX/index perps through the same public `/info` endpoint you already use for crypto.
- Tokenized **gold** is mature and easy to source on-chain (Ethereum ERC-20, deep CEX + Curve liquidity). Tokenized **equities** are fragmented across issuance models (Backed/xStocks custodial-on-Solana, Ondo Reg-S, Dinari SEC-registered) but xStocks dominates liquidity.
- **Public, no-key, browser-tolerant**: Hyperliquid, dYdX v4 indexer, GMX REST, DefiLlama, Ostium metadata. **Key-required / backend-only**: CoinGlass, rwa.xyz Enterprise, CoinGecko/CMC paid tiers, GoldAPI/Metals-API, equity-price APIs.

## Details

### PART 1 — PERP / DERIVATIVES VENUES

#### Hyperliquid (incl. HIP-3 / Trade[XYZ] RWA perps)
- **REST base:** `https://api.hyperliquid.xyz/info` (POST, JSON body with a `type` field). Testnet: `https://api.hyperliquid-testnet.xyz`.
- **WebSocket:** `wss://api.hyperliquid.xyz/ws`.
- **Exposes:** mark price, oracle price, mid, funding (current + predicted via `predictedFundings`), open interest, 24h notional volume (`dayNtlVlm`), premium — via `metaAndAssetCtxs` (perps) and per-asset contexts. Candles via `candleSnapshot` and the WS `candle` channel (intervals 1m→1M). Historical funding via `fundingHistory` (coin, startTime, endTime). `perpDexs` lists all builder-deployed dexes; `perpDexLimits` for per-dex caps.
- **Auth:** NONE for public market data. Public and CORS-friendly — callable directly from a browser. Private key needed only for trading.
- **RWA perps:** YES via HIP-3 "builder-deployed perpetuals" (mainnet Oct 13, 2025). Flagship deployer **Trade[XYZ]** (operated by Hyperunit) lists the XYZ100 index, individual equity perps (TSLA, NVDA, AAPL, AMZN), commodities (gold, silver benchmarked vs COMEX front-month, oil, plus CORN/WHEAT), FX, and the **first and only S&P-DJI-licensed S&P 500 perp** (licensed March 18, 2026). HIP-3 assets are namespaced with the dex prefix, e.g. `xyz:TSLA`, `xyz:NVDA`, `xyz:XYZ100`; pass the `dex` param to `meta`/`metaAndAssetCtxs`. Per The Block (June 2026), HIP-3 posted "over $62 billion in volume in May alone and $3 billion in open interest," and Hyperliquid's share of monthly perp volume vs all CEXs hit a record 6.63%. Per CoinGecko, trade.xyz represents over 90% of HIP-3 open interest (Boluo data: ~$1.58B of ~$1.74B total in late March 2026). HIP-3 markets charge ~2x standard fees and carry quanto exposure (USD risk, USDC settlement).

#### Ostium (RWA-perps specialist — Arbitrum One)
- **REST metadata base:** `https://metadata-backend.ostium.io`. Key endpoints: `/PricePublish/latest-prices` (all feeds), `/PricePublish/latest-price?asset=EURUSD`, `/trading-hours/asset-schedule?asset=XAUUSD` (returns openingHours + `isOpenNow`), `/vault/lp-exposure` (POST, body `{"address":...}`).
- **Subgraph:** The `ostium-python-sdk` migrated from Alchemy/Satsuma to **Goldsky** (`api.goldsky.com/api/public/...`) in v3.0.1 (branch "change-alchemy-to-goldsky"). The exact project-id/slug must be read from `ostium_python_sdk/config.py` on the repo main branch — do not hardcode a guess (an older Ormi/0xGraph case study conflicts on provider). Subgraph entities: pairs (with OI caps, rollover fees, funding), open trades, open/closed/cancelled orders, full order history with PnL.
- **Python SDK:** `pip install ostium-python-sdk` (github.com/0xOstium/ostium-python-sdk). Classes: `OstiumSDK`, `SubgraphClient` (`sdk.subgraph.get_pairs()`, `get_open_trades(addr)`), `Price`, `Ostium` (trading), `Balance`, `Faucet`. Needs only an Arbitrum RPC URL for reads (free from Alchemy); private key only for trades. **Breaking change (Feb 2026):** for limit/stop orders, the `slippage` param in `openTrade` must be `0`.
- **Core contracts (Arbitrum One, verified on Arbiscan):** OstiumTrading proxy `0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411`; OstiumTradingStorage proxy `0xcCd5891083A8acD2074690F65d3024E7D13d66E7` (both EIP-1967 upgradeable proxies — index the proxy addresses, implementations change on upgrade). Settlement collateral: USDC. Contracts repo: github.com/0xOstium/smart-contracts-public (adapted from Gains Network v5).
- **Markets (May 2026):** 71 pairs across 6 asset classes — **Stocks (33):** AAPL, AMZN, GOOG, META, MSFT, NVDA, TSLA, MSTR, COIN, HOOD, ORCL, CVX, XOM, COST, RIVN, PLTR, AMD, AVGO, ARM, ASML, CAT, CRCL, GEV, GLXY, INTC, MU, NFLX, SBET, SHEL, SMCI, SNDK, TSM, BMNR; **Indices (7):** SPX, NDX, DJI, DAX, Nikkei 225, FTSE, Hang Seng; **Forex:** EUR/USD, USD/JPY, GBP/USD, AUD/USD, etc.; **Commodities:** XAU (gold), XAG (silver), copper, USOIL/WTI; plus crypto. ~91% of OI is non-crypto. 0DTE equity perps launched Aug 2025. Up to 200x on FX/gold/indices, up to 50–100x on equities. Oracles: Chainlink (crypto) + Stork (RWA). $24M Series A (Dec 2025, General Catalyst + Jump Crypto). Dune dashboard: dune.com/ostium_app/stats. Trade URL: app.ostium.com/trade.
- **Auth/CORS:** REST metadata endpoints are public (no key); simple GETs. A backend proxy is recommended for production caching but not required for access.

#### Lighter (zkLighter — Ethereum zk-rollup orderbook DEX)
- **REST base:** `https://mainnet.zklighter.elliot.ai`.
- **WebSocket:** `market_stats` channel exposes `index_price`, `mark_price`, `open_interest`, `current_funding_rate` (estimate of next), `funding_rate` (last paid), `daily_base/quote_token_volume`, daily high/low/change. Order-book channel sends snapshot + diffs every 50ms.
- **Python SDK:** `pip install git+https://github.com/elliottech/lighter-python.git` (`import lighter`; AccountApi, TransactionApi, OrderApi; Rust SDK also exists).
- **Auth:** public REST/WS for market data; auth tokens (SignerClient `create_auth_token_with_expiry`) only for account/order endpoints. Funding interval: 1 hour. Recommended colocation: AWS Tokyo `ap-northeast-1a`.
- **RWA perps:** crypto perps only confirmed; no equity/FX/commodity markets found.

#### Aster (AsterDEX — BNB Chain; Binance-fapi-compatible)
- **REST base:** `https://fapi.asterdex.com` (`/fapi/v1/depth`, `/fapi/v1/premiumIndex`, `/fapi/v1/ticker/24hr`, `/fapi/v1/exchangeInfo`, `/fapi/v1/openInterest`).
- **WebSocket:** `wss://fstream.asterdex.com` (lowercase stream names e.g. `btcusdt@ticker`; 24h connection limit; max 200 streams; 10 msgs/sec inbound).
- **Auth:** public market data needs no key; trading uses HMAC-SHA256 with `X-MBX-APIKEY`. V1 API-key creation ends March 25, 2026. Rate limits surfaced via `X-MBX-USED-WEIGHT` headers; 429/418 bans.
- **On-chain alternative:** Bitquery GraphQL indexes AsterDEX on BSC (main contract `0x1b6F2d3844C6ae7D56ceb3C3643b9060ba28FEb0`). Aster's docs menu includes "Stock contracts" and "Pre-launch contracts" — verify which equities are listed before relying on them.

#### dYdX (v4 — Cosmos appchain)
- **Indexer REST base:** `https://indexer.dydx.trade/v4`. **WebSocket:** `wss://indexer.dydx.trade/v4/ws`.
- **Endpoints:** `/perpetualMarkets` (openInterest, nextFundingRate, oraclePrice, volume24h), `/candles/perpetualMarkets/{ticker}?resolution=1MIN` (fields include `startingOpenInterest`, `usdVolume`, `baseTokenVolume`), `/historicalFunding/{ticker}`. WS channels: `v4_markets`, `v4_orderbook`, `v4_trades`, `v4_candles`. Aggregations (24h volume, OI, candles) computed by the indexer "Roundtable" service.
- **Auth:** public for market data, CORS-friendly. SDKs: `@dydxprotocol/v4-client-js`, `dydx-v4-client` (Python).
- **RWA perps:** crypto-focused; markets are governance-permissioned. No major equity/FX/commodity RWA suite confirmed.

#### GMX (v2 — Arbitrum, Avalanche, Botanix, MegaETH)
- **REST base (Arbitrum):** `https://arbitrum-api.gmxinfra.io` — `/markets/info` returns liquidity, open interest, token amounts, funding/borrowing/net rates, listing date. Avalanche: `https://avalanche-api.gmxinfra.io`; Botanix: `https://botanix-api.gmxinfra.io`.
- **Subgraph:** github.com/gmx-io/gmx-subgraph. Stats UI: stats.gmx.io.
- **Auth:** public REST, CORS-friendly. **RWA perps:** synthetic crypto perps only (BTC, ETH, SOL + long-tail crypto); no equity/FX RWA suite — GMX is crypto-focused.

#### Variational (Omni — RFQ protocol)
- 4th-largest perp DEX by open interest; $200B+ lifetime volume; ~450+ live crypto + RWA markets (peaked >1,000). Launched its first RWA markets (commodities) alongside a **$50M Series A announced May 20, 2026, led by Dragonfly with Bain Capital Crypto and Coinbase Ventures** (CoinDesk/BusinessWire), expanding into stocks/commodities/forex. RFQ model with a single vertically-integrated liquidity provider; trades settle/clear on-chain in isolated escrow contracts; zero trading fees. Uses CoinGecko API for listing metadata (FDV, OI, volume).
- **API:** a dedicated public trading API was on the 2026 roadmap ("releasing a trading API") but is **not confirmed live** at research time. Treat as forthcoming; verify at docs.variational.io before integrating.

#### Drift (Solana)
- Largest Solana perp DEX. Docs: docs.drift.trade; SDK reference: drift-labs.github.io/v2-teacher (TS + Python `driftpy`). Swift gasless-order API: `https://swift.drift.trade`. Oracles: Pyth. Funding: hourly, clamped by contract tier (B+: 0.125%, C: 0.208%, lower: 0.4167%/hr).
- **Markets:** 40+ crypto perps (up to 101x on SOL/BTC/ETH), spot, lending, and binary prediction markets (B.E.T). No equity/FX/commodity RWA perps confirmed. **Note:** suffered a security incident April 2026 and is in a relaunch — verify current API/market state before integrating.

#### Other venues
- **Synthetix** (Optimism) — synthetic index exposure via debt-pool model. **Apex, edgeX, Vertex, Paradex, Hibachi, GRVT** — additional perp DEXs (GRVT publishes RWA-perp educational content). None confirmed with the RWA breadth of Ostium / Hyperliquid in this research; verify individually if needed.

### PART 2 — RWA NETWORKS (BLOCKCHAINS)
- **Solana** — dominant for tokenized equities; per solana.com, "xStocks on Solana accounts for ~93% market share as of Jan 19, 2026." Data access: RPC + Helius (indexing/webhooks), Birdeye, Solscan, Jupiter/Raydium APIs. SPL Token-2022 with extensions.
- **Ethereum** — tokenized gold (PAXG, XAUT), treasuries (BUIDL, BENJI), Ondo. Data: standard RPC + Etherscan + The Graph subgraphs. Most mature tooling.
- **Arbitrum** — Ostium RWA perps settle here. EVM RPC + Arbiscan + subgraphs.
- **BNB Chain** — Aster perps; an Ondo GM deployment. Bitquery indexes BSC.
- **Plume** — RWA-purpose-built chain (EVM-compatible; Arbitrum Orbit stack, ArbOS v51/BoLD, custom PLUME gas token). Leading RWA network by holder count: Cointelegraph (Nov 2025) reported "279,692 RWA holders... around 50% of the total number of holders across all RWA networks." **Note a figure conflict:** CEO Chris Yin cited "280,000 users holding an aggregate $200 million of RWAs," while a later secondary source cited ~$645M assets — treat the asset-value figure as uncertain and re-verify on rwa.xyz/app.rwa.xyz/networks/plume. RPC/indexer via thirdweb; tokenization engine "Arc," data layer "Nexus." Partners: WisdomTree (14 funds), Apollo, Securitize.
- **Ondo Chain** — dedicated regulated-RWA chain, mainnet in development early-to-mid 2026.
- **Avalanche** — Dinari's "Dinari Financial Network" is a purpose-built Avalanche L1 for regulated tokenized assets.
- **Others** — Base, Polygon, Provenance (Figure credit) host RWA but with less equity/gold activity relevant here.

### PART 3 — TOKENIZED ASSET TOKENS (SPOT)

#### Tokenized Gold
- **PAXG (Pax Gold)** — issuer Paxos; Ethereum ERC-20 `0x45804880De22913dAFE09f4980848ECE6EcbAf78`; market cap ~$1.9–2.4B (CoinMarketCap rank ~#36); ~86,000 holders (Etherscan). 1 token = 1 fine troy oz, LBMA London Good Delivery, Brink's vaults; Paxos on-chain transfer fee 0.02%. Trades: Binance (PAXG/USDT most active), Kraken, Gate, LBank; on-chain via Curve/Uniswap. Trade URL pattern: `binance.com/en/trade/PAXG_USDT`. CoinGecko ID: `pax-gold`.
- **XAUT / XAU₮ (Tether Gold)** — issuer TG Commodities (Tether); Ethereum ERC-20 `0x68749665FF8D2d112Fa859AA293F07A622782F38` (also TRC-20 on Tron); market cap ~$2.0–2.6B; ~53,000–86,000 holders. 1 token = 1 troy oz, Swiss vault, zero custody fees, min direct purchase 50 XAUT. Trades: Binance (XAUT/USDT), Bitget (spot + futures), Bybit; Curve XAUt/PAXG pool `0xc48a38499a90e3b883c509ca08ec1b540cdf15ee`. **XAUT0** is the cross-chain (LayerZero) variant. CoinGecko ID: `tether-gold`.
- **Others:** Kinesis KAU, Comtech Gold, Aurus tGOLD — smaller; verify contracts before listing.

#### Tokenized Equities — xStocks (Backed Finance; Solana SPL Token-2022; verified mints)
- **TSLAx** (Tesla): `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB`
- **NVDAx** (NVIDIA): `Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh`
- **SPYx** (S&P 500 ETF): `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W`
- **CRCLx** (Circle): `XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1`
- **AAPLx** (Apple): `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp`
- Scale (Birdeye, May 2026): "more than 130 tokenized equities and ETFs... total AUM had reached $293.5 million on Solana," with cumulative volume ~$30.1B (DEX >$1.68B). Backed 1:1 by shares (Backed Assets JE; Swiss/Liechtenstein FMA framework), 8 decimals, Chainlink price feeds + CCIP, dividends auto-reinvested via rebasing. Most liquid: TSLAx, NVDAx, CRCLx, SPYx (~58% of active wallets). Trades: Solana DEXs — Raydium (primary AMM/liquidity hub), Jupiter (aggregator), Orca, Kamino (lending collateral); CEX — Kraken, Bybit, BingX, Gate, KuCoin. Not available to US/UK/CA/AU/EEA residents. **Always re-verify mints on Solscan** (clones exist). Trade URLs: `jup.ag/swap`, `app.kamino.finance`. xStocks now also multi-chain (BNB, Tron, Ethereum). For market-wide context, rwa.xyz tracks over $1B in distributed value for the tokenized-equities category (MetaMask citing rwa.xyz, April 2026); category figures vary by "distributed vs represented vs all" view.

#### Other tokenized-equity issuers
- **Ondo Global Markets** — tickers use a "+on" convention (TSLAon, AAPLon, NVDAon, SPYon, QQQon, GOOGLon...). ERC-20 representing total return; 1:1 via Alpaca custody; Chainlink feeds + LayerZero. Chains: Ethereum (launched Sept 3, 2025, 100+ assets), BNB Chain, Solana (announced Jan 21, 2026, 200+ assets); bridgeable to HyperEVM. **Example: TSLAon on Ethereum `0xf6b1117ec07684D3958caD8BEb1b302bfD21103f`** (ERC-20). Reg-S, non-US only. Ondo Perps (up to 20x on tokenized stocks/ETFs) launched ~June 9, 2026. API/OpenAPI: `docs.ondo.finance/openapi.json`; mint/redeem permissioned via the GM API, secondary transfers permissionless.
- **Dinari (dShares)** — SEC-registered transfer agent / broker-dealer; 1:1 backed on US-regulated rails; LayerZero OFT across 4 chains (+ Solana coming); Dinari Financial Network on a dedicated Avalanche L1; Flow Traders as market maker; 24/7 trading from Q1 2026. Listed SPCXD (SpaceX) as the first tokenized US equity to trade on Hyperliquid/HyperCore (June 12, 2026). DefiLlama tracks Dinari TVL/fees/volume (`defillama.com/protocol/dinari`).
- **Superstate "Opening Bell"** — native SEC-registered share issuance on-chain (SPL/ERC-20); GLXY (Galaxy) executed the first on-chain proxy vote (April 2026).

### PART 4 — AGGREGATOR / METRICS DATA SOURCES
- **DefiLlama** — FREE. Base `https://api.llama.fi`; Pro `https://pro-api.llama.fi` ($300/mo to bypass rate limits). Dashboards/endpoints: Perp Funding Rates (funding + OI + index price), Open Interest by protocol/chain, Perps Volume by protocol/chain (and normalized/wash-adjusted), RWA category (aggregate market cap, asset count, issuers by chain), Stablecoins. Tracks Hyperliquid (incl. `hyperliquid-perps`), Aster, Lighter, GMX, Dinari, Ostium. No auth on free endpoints; CORS-friendly. **Best free cross-venue OI/volume source.**
- **CoinGlass** — PAID (tiered; historical range scales with plan). V4 base `https://open-api-v4.coinglass.com`, header `CG-API-KEY`. Endpoints: `/api/futures/openInterest/ohlc-history`, `/aggregated-history`, `/exchange-list`; `/api/futures/fundingRate/ohlc-history`, `/oi-weight-ohlc-history`; liquidations; long/short ratio; options; ETF flows. WS: `wss://open-api-v4.coinglass.com/ws`. Covers 30+ exchanges incl. Hyperliquid; data back to 2019. **Best for historical OI/funding OHLC.** Coverage is mainly crypto venues — RWA-perp (Ostium/HIP-3) coverage is limited; verify before relying on it for RWA.
- **rwa.xyz** — Free tier (public platform, 3 exports/mo, basic analytics); **Pro $500/seat/mo** (all metrics, 30 exports/mo, full asset reference, fixed-income/APY); **Enterprise API** (`https://api.rwa.xyz/v4/assets`, `Authorization: Bearer`; docs.rwa.xyz). Aggregates 70+ networks; asset/issuer/token metadata, market cap by class, timeseries. Dedicated tokenized-stocks, commodities, and treasuries dashboards (some metrics login-gated). **Authoritative RWA market-structure source.**
- **CoinGecko / CoinMarketCap** — price/volume/market cap. Coin IDs: PAXG `pax-gold`, XAUT `tether-gold`; many xStocks and tokenized equities listed (e.g. CoinGecko `tesla-ondo-tokenized-stock`). CoinGecko API powers Variational's listing engine. Free + paid tiers; route through a backend proxy.
- **The Graph subgraphs** — GMX (gmx-io/gmx-subgraph), Ostium (Goldsky), dYdX. Decentralized network needs an API key; many hosted endpoints remain public.
- **Dune Analytics** — public dashboards: Ostium (`dune.com/ostium_app/stats`), Hyperliquid HIP-3 (ASXN Hyperscreener + CoinGecko-cited Dune compilations). Dune API (paid tiers) for programmatic query results.
- **Oracles** — Stork (powers Ostium RWA feeds), Chainlink (xStocks/Ondo + HIP-3 crypto). Useful as independent reference prices.

### PART 5 — ORIGINAL ON-CHAIN METRICS FEASIBILITY
- **(a) Premium/discount of tokenized gold & stocks vs real spot — feasible.** Real XAU spot: GoldAPI.io (`https://www.goldapi.io/api/XAU/USD`, header `x-access-token`, free tier, returns price/bid/ask), Metals-API, MetalpriceAPI, gold-api.com (free, also BTC), Commodities-API. Token price: CoinGecko (`pax-gold`, `tether-gold`) or on-chain DEX pool (Curve XAUt/PAXG). Premium = token_USD ÷ spot_XAU − 1. For stocks: real equity price from Finnhub / Alpha Vantage / Polygon (free tiers; CORS varies — proxy recommended) vs xStock token price from Jupiter/Birdeye. Caveat: equity markets close, so compare only during regular trading hours or expect oracle-driven gaps.
- **(b) Issuance flow / net mint-burn — feasible.** Ethereum: index ERC-20 Transfer events from/to the zero address (mint/burn) on PAXG/XAUT via RPC `eth_getLogs` or a subgraph; PAXG circulating = mints − burns (cross-check the Paxos transparency page). Solana xStocks: Token-2022 mint/burn via the SPL token program; index with Helius webhooks or `getSignaturesForAddress` on the mint. Backed/Tether publish proof-of-reserves for sanity checks.
- **(c) Holder counts / concentration — feasible.** Ethereum: Etherscan token-holder lists (PAXG ~86K, XAUT ~53–86K) or subgraph balance aggregation. Solana: Solscan/Birdeye holder lists; top-holder concentration from largest accounts (e.g., Tether's treasury holds the largest single XAUT block).
- **(d) Perp-spot basis — feasible where both legs exist.** Ostium XAU/USD perp mark (metadata-backend `latest-prices` or subgraph) vs PAXG spot (CoinGecko/Curve) → basis. Same approach for Hyperliquid `xyz:` gold/silver perp vs tokenized gold, or an equity perp (`xyz:TSLA` / Ostium TSLA) vs TSLAx spot. Note the reference mismatch: perps track the underlying via oracle, tokens track the spot share price — the spread itself is a tradeable signal.

## Recommendations
1. **Phase 1 — public, no-key, browser-callable (ship fast):** Wire Hyperliquid (`/info` + WS, including HIP-3 `xyz:` markets), Ostium (metadata-backend REST + Python SDK/subgraph), dYdX v4 indexer, GMX REST, and DefiLlama for cross-venue OI/volume. No API keys; proxy only to cache and hide rate limits.
2. **Phase 2 — keyed, backend indexer:** Add CoinGlass (historical OI/funding OHLC), rwa.xyz Enterprise API (RWA market structure), CoinGecko/CMC (token prices), GoldAPI/Metals-API (XAU spot), and an equities-price API (Finnhub/Polygon) for premium and basis computation. Keep all keys server-side.
3. **Phase 3 — original on-chain metrics:** Stand up an indexer (The Graph/Goldsky subgraphs for EVM; Helius for Solana) for net mint/burn, holder concentration, and perp-spot basis. Use the Ostium subgraph + Hyperliquid asset contexts for the perp leg.
4. **Token trade-linking:** Link each spot token to its deepest venue — xStocks → Jupiter/Kraken; PAXG/XAUT → Binance/Curve; Ondo → ondo.finance; perps → app.ostium.com or app.hyperliquid.xyz.
- **Thresholds that change the plan:** if you need sub-second ticks or full L2 history, prefer Hyperliquid/CoinGlass WS over REST polling; if Variational ships its public API, add it for the widest RWA-perp catalog; if rwa.xyz Pro/Enterprise pricing is prohibitive, fall back to DefiLlama's RWA category plus direct issuer pages (backed.fi, ondo.finance, paxos.com transparency).

## Caveats
- **Ostium subgraph URL not literally confirmed.** It is a Goldsky endpoint per the SDK's v3.0.1 "change-alchemy-to-goldsky" migration, but read the exact project-id/slug from `ostium_python_sdk/config.py`; an Ormi/0xGraph case study conflicts on provider.
- **Variational's public trading API was roadmap, not confirmed live** — confirm at docs.variational.io.
- **Drift** had an April 2026 security incident and relaunch — verify current API/market state.
- **Plume asset-value figure conflicts** ($200M per CEO vs ~$645M secondary source); holder count (~280K, ~50% of all RWA holders) is better-corroborated. Re-verify on rwa.xyz.
- **xStocks/Ondo/Dinari have jurisdictional restrictions** (non-US, KYC) and frequently changing tickers/availability; always re-verify Solana mints on Solscan (scam clones are common).
- **HIP-3 markets** carry off-hours pricing, quanto exposure (USD risk, USDC settlement), and ~2x fees; their data semantics differ from native crypto perps.
- Market-cap, holder, AUM and volume figures are point-in-time 2026 snapshots from CoinGecko/Etherscan/Birdeye/rwa.xyz and drift continuously; treat as directional, not exact.
# EWA Onchain Records — Phase 1

Live snapshot dashboard for tokenized real-world assets. On-chain perp analytics
(OI / funding / 24h vol / skew) plus spot-token premium vs real spot. Public,
no-key sources only.

```bash
npm install
npm run dev      # http://localhost:3000
```

## Architecture

- **Next.js App Router + TypeScript** (strict, no `any`). All third-party data is
  fetched server-side in API routes — the browser only calls our own `/api/*`.
- **No database** (Phase 1). A process-wide in-memory TTL cache (`lib/cache.ts`)
  gates fetches at 30s.
- Each source file (`lib/sources/*`) exposes one async function returning
  normalized objects. One venue failing never breaks the response
  (`Promise.allSettled` + per-venue status flags).

```
app/api/perps   aggregate perp venues, sort by oiUsd, 30s cache
app/api/tokens  spot-token price + premium
app/page.tsx    terminal dashboard (client; polls both routes every 30s)
lib/sources/    hyperliquid · ostium · dydx · prices
lib/metrics.ts  premium / basis / skew definitions (see CLAUDE.md)
data/tokens.ts  tracked spot tokens (contracts/mints)
```

## Endpoint status — confirmed live vs. stubbed (verified 2026-06-13/14)

| Source | Endpoint | Status |
|---|---|---|
| Hyperliquid crypto perps | `POST /info {"type":"metaAndAssetCtxs"}` | ✅ live |
| Hyperliquid HIP-3 RWA perps | `POST /info {…,"dex":"xyz"}` | ✅ live (73 mkts) |
| dYdX v4 | `GET /v4/perpetualMarkets` | ✅ live |
| Ostium | subgraph `pairs` (Ormi gateway) | ✅ live |
| CoinGecko | `simple/price` (gold tokens) | ✅ live, no key |
| gold-api.com | `price/XAU` (real XAU spot) | ✅ live, no key |
| Jupiter price v3 | `lite-api.jup.ag/price/v3` | ✅ live, no key |

**Notable / flagged:**

- **Ostium subgraph is Ormi, not Goldsky.** `DATA_SOURCES.md` guessed a Goldsky
  URL; the SDK's `config.py` on `main` actually points at
  `api.subgraph.ormilabs.com/.../ost-prod/live/gn`. Used the confirmed value.
- **Ostium OI scaling** (empirically confirmed): `lastTradePrice` is USD × 1e18;
  `longOI`/`shortOI` are **base-asset units × 1e18**, so
  `oiUsd = (longOI+shortOI)/1e18 × price`.
- **Ostium funding — flagged.** `lastFundingRate` read back `0` on every pair
  (incl. 24/7 crypto) at integration time, so its scale couldn't be verified.
  Surfaced best-effort (null when 0). `TODO` in `lib/sources/ostium.ts`.
- **Ostium 24h volume — null.** The subgraph `volume` field is cumulative, not a
  rolling 24h window. Omitted rather than mislabeled.
- **Skew** is only populated where a long/short OI split exists (**Ostium**).
  Hyperliquid `metaAndAssetCtxs` and dYdX expose only total OI → skew `null`.
- **Equity premium uses real data.** Jupiter v3 returns both the xStock token
  price and the underlying share price (`stockData.price`), so no equities-API
  key is needed. Premium is labeled off-hours outside US RTH.
- **Gold premium uses real data.** Token price (CoinGecko) ÷ XAU spot
  (gold-api.com). The CLAUDE.md "XAU spot stub" is upgraded to a live free feed.

## Phase 2+ (not built)

Keyed sources (CoinGlass, rwa.xyz, equities APIs), Postgres for historical
series, and on-chain net mint/burn issuance. Keys go in `.env` (see
`.env.example`), server-side only.

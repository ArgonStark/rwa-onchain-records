import {
  getHyperliquidPerps,
  getHyperliquidHip3Perps,
} from "./sources/hyperliquid";
import { getOstiumPerps } from "./sources/ostium";
import { getDydxPerps } from "./sources/dydx";
import { premium as premiumMetric } from "./metrics";
import {
  fetchCoinGeckoPrices,
  fetchJupiterPrices,
  fetchXauSpot,
  isUsMarketOpen,
} from "./sources/prices";
import { SPOT_TOKENS } from "../data/tokens";
import type {
  PerpsResponse,
  SpotTokenRow,
  TokensResponse,
  VenueResult,
} from "./types";

// Single source of truth for the aggregated snapshots. Both the API routes and
// the persistence writer call these, so stored history matches what the UI sees.

export async function aggregatePerps(): Promise<PerpsResponse> {
  // One failing venue must never break the response — settle all, keep the rest.
  const results = await Promise.allSettled<VenueResult>([
    getHyperliquidPerps(),
    getHyperliquidHip3Perps(),
    getOstiumPerps(),
    getDydxPerps(),
  ]);

  const venues: PerpsResponse["venues"] = [];
  const markets: PerpsResponse["markets"] = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      const v = r.value;
      venues.push({
        venue: v.venue,
        status: v.status,
        count: v.markets.length,
        error: v.error,
      });
      markets.push(...v.markets);
    } else {
      venues.push({
        venue: "unknown",
        status: "error",
        count: 0,
        error: String(r.reason),
      });
    }
  }

  markets.sort((a, b) => b.oiUsd - a.oiUsd);
  return { asOf: new Date().toISOString(), venues, markets };
}

export async function aggregateTokens(): Promise<TokensResponse> {
  const cgIds = SPOT_TOKENS.flatMap((t) => (t.coingeckoId ? [t.coingeckoId] : []));
  const solMints = SPOT_TOKENS.filter((t) => t.chain === "Solana").map(
    (t) => t.address,
  );

  const [cg, jup, xau] = await Promise.all([
    fetchCoinGeckoPrices(cgIds).catch(() => null),
    fetchJupiterPrices(solMints).catch(() => null),
    fetchXauSpot().catch(() => null),
  ]);

  const marketOpen = isUsMarketOpen();

  const tokens: SpotTokenRow[] = SPOT_TOKENS.map((t) => {
    let tokenUsdPrice: number | null = null;
    let realSpotPrice: number | null = null;
    let priceSource: string | null = null;
    let spotSource: string | null = null;
    let note: string | undefined;
    let isEquityOpen: boolean | null = null;

    if (t.coingeckoId) {
      tokenUsdPrice = cg?.get(t.coingeckoId) ?? null;
      priceSource = tokenUsdPrice !== null ? "CoinGecko" : null;
      realSpotPrice = xau;
      spotSource = xau !== null ? "gold-api.com (XAU spot)" : null;
    } else if (t.chain === "Solana") {
      // xStocks: Jupiter v3 gives the on-chain DEX token price AND a real
      // off-chain underlying equity price (audited independent — see prices.ts).
      const jp = jup?.get(t.address) ?? null;
      tokenUsdPrice = jp?.tokenUsd ?? null;
      priceSource = tokenUsdPrice !== null ? "Jupiter v3 (on-chain DEX)" : null;
      realSpotPrice = jp?.underlyingUsd ?? null;
      spotSource =
        realSpotPrice !== null ? "xStocks underlying (real equity feed)" : null;
      isEquityOpen = marketOpen;
      if (!marketOpen) {
        note = "US market closed — premium reflects off-hours oracle/last price";
      }
    }

    const premium =
      tokenUsdPrice !== null && realSpotPrice !== null && realSpotPrice > 0
        ? premiumMetric(tokenUsdPrice, realSpotPrice)
        : null;

    const status: SpotTokenRow["status"] =
      tokenUsdPrice !== null ? "ok" : "error";
    if (status === "error" && !note) note = "price source unavailable";

    return {
      ...t,
      status,
      tokenUsdPrice,
      realSpotPrice,
      premium,
      priceSource,
      spotSource,
      marketOpen: t.category === "equity" ? isEquityOpen : null,
      note,
    };
  });

  return { asOf: new Date().toISOString(), tokens };
}

import {
  getHyperliquidPerps,
  getHyperliquidHip3Perps,
} from "./sources/hyperliquid";
import { getOstiumPerps } from "./sources/ostium";
import { getDydxPerps } from "./sources/dydx";
import { getLighterPerps } from "./sources/lighter";
import { getAsterPerps } from "./sources/aster";
import { getVariationalPerps } from "./sources/variational";
import { getOndoPerps } from "./sources/ondo";
import { premium as premiumMetric } from "./metrics";
import {
  fetchCoinGeckoPrices,
  fetchCoinGeckoMarketData,
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
    getLighterPerps(),
    getAsterPerps(),
    getVariationalPerps(),
    getOndoPerps(),
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
  // Phase 4: fetch full market data (price + supply) for each gold token.
  const cgTokens = SPOT_TOKENS.filter((t) => t.coingeckoId);

  const [cg, jup, xau, ...cgMarket] = await Promise.all([
    fetchCoinGeckoPrices(cgIds).catch(() => null),
    fetchJupiterPrices(solMints).catch(() => null),
    fetchXauSpot().catch(() => null),
    ...cgTokens.map((t) =>
      fetchCoinGeckoMarketData(t.coingeckoId!).catch(() => null)
    ),
  ]);
  // Build coingeckoId -> supply map from market data results
  const cgSupply = new Map<string, number | null>();
  cgTokens.forEach((t, i) => {
    const md = cgMarket[i];
    cgSupply.set(t.coingeckoId!, md?.circulatingSupply ?? null);
  });

  // For Solana tokens where Jupiter doesn't return circSupplyPrescaled, fall
  // back to Solana RPC getTokenSupply (public, no key).
  const SOL_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
  const jupMissingSupply = SPOT_TOKENS.filter(
    (t) => t.chain === "Solana" && (jup?.get(t.address)?.circulatingSupply ?? null) === null,
  );
  const solSupplyFallback = new Map<string, number | null>();
  await Promise.all(jupMissingSupply.map(async (t) => {
    try {
      const res = await fetch(SOL_RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [t.address] }),
        cache: "no-store",
      });
      if (!res.ok) return;
      const j = (await res.json()) as { result?: { value?: { uiAmount?: number } } };
      const amt = j.result?.value?.uiAmount;
      solSupplyFallback.set(t.address, typeof amt === "number" ? amt : null);
    } catch { /* best-effort */ }
  }));

  const marketOpen = isUsMarketOpen();

  const tokens: SpotTokenRow[] = SPOT_TOKENS.map((t) => {
    let tokenUsdPrice: number | null = null;
    let realSpotPrice: number | null = null;
    let priceSource: string | null = null;
    let spotSource: string | null = null;
    let supply: number | null = null;
    let note: string | undefined;
    let isEquityOpen: boolean | null = null;

    if (t.coingeckoId) {
      tokenUsdPrice = cg?.get(t.coingeckoId) ?? null;
      priceSource = tokenUsdPrice !== null ? "CoinGecko" : null;
      realSpotPrice = xau;
      spotSource = xau !== null ? "gold-api.com (XAU spot)" : null;
      supply = cgSupply.get(t.coingeckoId) ?? null;
    } else if (t.chain === "Solana") {
      // xStocks: Jupiter v3 gives the on-chain DEX token price AND a real
      // off-chain underlying equity price (audited independent — see prices.ts).
      const jp = jup?.get(t.address) ?? null;
      tokenUsdPrice = jp?.tokenUsd ?? null;
      priceSource = tokenUsdPrice !== null ? "Jupiter v3 (on-chain DEX)" : null;
      realSpotPrice = jp?.underlyingUsd ?? null;
      spotSource =
        realSpotPrice !== null ? "xStocks underlying (real equity feed)" : null;
      supply = jp?.circulatingSupply ?? solSupplyFallback.get(t.address) ?? null;
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
      supply,
      marketOpen: t.category === "equity" ? isEquityOpen : null,
      note,
    };
  });

  return { asOf: new Date().toISOString(), tokens };
}

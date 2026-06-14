import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { SPOT_TOKENS } from "@/data/tokens";
import { premium as premiumMetric } from "@/lib/metrics";
import {
  fetchCoinGeckoPrices,
  fetchJupiterPrices,
  fetchXauSpot,
  isUsMarketOpen,
} from "@/lib/sources/prices";
import type { SpotTokenRow, TokensResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;

async function buildTokens(): Promise<TokensResponse> {
  const cgIds = SPOT_TOKENS.flatMap((t) => (t.coingeckoId ? [t.coingeckoId] : []));
  const solMints = SPOT_TOKENS.filter((t) => t.chain === "Solana").map(
    (t) => t.address,
  );

  // Fetch all price sources in parallel; any can fail without sinking the rest.
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
      // Gold tokens: token price from CoinGecko, real spot from gold-api.com.
      tokenUsdPrice = cg?.get(t.coingeckoId) ?? null;
      priceSource = tokenUsdPrice !== null ? "CoinGecko" : null;
      realSpotPrice = xau;
      spotSource = xau !== null ? "gold-api.com (XAU spot)" : null;
    } else if (t.chain === "Solana") {
      // xStocks: Jupiter v3 gives token price AND underlying share price.
      const jp = jup?.get(t.address) ?? null;
      tokenUsdPrice = jp?.tokenUsd ?? null;
      priceSource = tokenUsdPrice !== null ? "Jupiter price v3" : null;
      realSpotPrice = jp?.underlyingUsd ?? null;
      spotSource = realSpotPrice !== null ? "Jupiter v3 stockData" : null;
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

export async function GET() {
  const data = await cached("tokens", TTL_MS, buildTokens);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}

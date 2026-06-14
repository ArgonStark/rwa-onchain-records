import { classifySymbol } from "../categories";
import { skew as skewMetric } from "../metrics";
import { getOstiumFundingRates } from "./ostiumFunding";
import type { PerpMarket, VenueResult } from "../types";

// Ostium (Arbitrum One) — RWA-perps specialist. Verified live 2026-06-13.
//
// Subgraph URL was read from the SDK's ostium_python_sdk/config.py on `main`
// (NetworkConfig.mainnet().graph_url). Note: the docs guessed "Goldsky", but
// the live config actually points at Ormi Labs' public subgraph gateway — using
// the confirmed value rather than the doc's guess, per CLAUDE.md.
const SUBGRAPH_URL =
  "https://api.subgraph.ormilabs.com/api/public/67a599d5-c8d2-4cc4-9c4d-2975a97bc5d8/subgraphs/ost-prod/live/gn";

// Scaling, confirmed empirically against /PricePublish/latest-prices and known
// BTC/EUR levels on 2026-06-13:
//  - lastTradePrice is USD price * 1e18.
//  - longOI / shortOI are BASE-asset units * 1e18 (e.g. BTC ~35.5 coins),
//    so oiUsd = (longOI + shortOI)/1e18 * price.
const E18 = 1e18;

// Funding is read from the PairInfos contract (see ./ostiumFunding.ts), not the
// subgraph: the subgraph's lastFundingRate is 0 because Ostium currently has
// maxFundingFeePerBlock=0 protocol-wide. Verified across subgraph + contract +
// the app's own /api/pairs on 2026-06-14.

interface OstiumPair {
  id: string;
  from: string;
  to: string;
  longOI: string;
  shortOI: string;
  lastTradePrice: string;
}

interface SubgraphResponse {
  data?: { pairs?: OstiumPair[] };
  errors?: { message: string }[];
}

const PAIRS_QUERY = `{
  pairs(first: 200, orderBy: longOI, orderDirection: desc) {
    id
    from
    to
    longOI
    shortOI
    lastTradePrice
  }
}`;

export async function getOstiumPerps(): Promise<VenueResult> {
  const venue = "Ostium";
  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: PAIRS_QUERY }),
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Ostium subgraph ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as SubgraphResponse;
    if (json.errors?.length) {
      throw new Error(`Ostium subgraph: ${json.errors[0]!.message}`);
    }
    const pairs = json.data?.pairs ?? [];

    // Contract-derived funding (best-effort; empty map on RPC failure leaves
    // funding null without breaking the subgraph-derived OI/skew).
    const pairIds = pairs.map((p) => Number(p.id)).filter(Number.isFinite);
    let funding: Map<number, number> = new Map();
    try {
      funding = await getOstiumFundingRates(pairIds);
    } catch {
      funding = new Map();
    }

    const markets: PerpMarket[] = [];
    for (const p of pairs) {
      const markPx = Number(p.lastTradePrice) / E18;
      const longOi = Number(p.longOI) / E18;
      const shortOi = Number(p.shortOI) / E18;
      if (!Number.isFinite(markPx) || markPx <= 0) continue;

      const oiUsd = (longOi + shortOi) * markPx;
      const fundingRate = funding.get(Number(p.id)); // present 0 = real, verified

      markets.push({
        venue,
        symbol: p.from,
        category: classifySymbol(p.from),
        markPx,
        oiUsd,
        // The subgraph `volume` field is cumulative, not a 24h rolling window,
        // so we don't expose a 24h figure here. TODO: derive from day entities.
        vol24hUsd: null,
        funding: fundingRate ?? null,
        skew: skewMetric(longOi, shortOi),
        source: "Ostium subgraph (Ormi) + PairInfos funding",
      });
    }
    return { venue, status: "ok", markets };
  } catch (err) {
    return {
      venue,
      status: "error",
      markets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

import { classify } from "../classify";
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

// 24h volume: the Ostium subgraph has NO per-pair day-data entity (only
// shareToAssetsPriceDaily, which is the vault LP share price). Verified the full
// entity list 2026-06-14. We instead aggregate real opened-position notional
// from the `trade` entity over the last 24h. Scaling confirmed against a live
// BTC trade: `notional` is USD * 1e6 (collateral 1e6 USDC * leverage 1e2). This
// is "24h opened notional", labelled as such — it counts position opens, which
// differs slightly from a venue's full taker volume; attributed accordingly.
const VOL_E6 = 1e6;
const VOL_PAGE = 1000;

async function fetchOstium24hVolume(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const cutoff = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  let after = cutoff;
  // Page by ascending timestamp until a partial page (<VOL_PAGE) is returned.
  for (let guard = 0; guard < 50; guard++) {
    const query = `{
      trades(first: ${VOL_PAGE}, orderBy: timestamp, orderDirection: asc, where: { timestamp_gte: ${after} }) {
        timestamp
        notional
        pair { from }
      }
    }`;
    const res = await fetch(SUBGRAPH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      cache: "no-store",
    });
    if (!res.ok) break;
    const json = (await res.json()) as {
      data?: { trades?: { timestamp: string; notional: string; pair: { from: string } }[] };
    };
    const trades = json.data?.trades ?? [];
    for (const t of trades) {
      const usd = Number(t.notional) / VOL_E6;
      if (Number.isFinite(usd)) {
        out.set(t.pair.from, (out.get(t.pair.from) ?? 0) + usd);
      }
    }
    if (trades.length < VOL_PAGE) break;
    // Advance past the last timestamp (may slightly double/skip same-second
    // trades at the boundary; negligible for a volume estimate).
    after = Number(trades[trades.length - 1]!.timestamp) + 1;
  }
  return out;
}

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

    // Contract-derived funding + aggregated 24h volume (both best-effort: a
    // failure leaves that field null without breaking subgraph-derived OI/skew).
    const pairIds = pairs.map((p) => Number(p.id)).filter(Number.isFinite);
    const [funding, volume] = await Promise.all([
      getOstiumFundingRates(pairIds).catch(() => new Map<number, number>()),
      fetchOstium24hVolume().catch(() => new Map<string, number>()),
    ]);

    const markets: PerpMarket[] = [];
    for (const p of pairs) {
      const markPx = Number(p.lastTradePrice) / E18;
      const longOi = Number(p.longOI) / E18;
      const shortOi = Number(p.shortOI) / E18;
      if (!Number.isFinite(markPx) || markPx <= 0) continue;

      const oiUsd = (longOi + shortOi) * markPx;
      const fundingRate = funding.get(Number(p.id)); // present 0 = real, verified

      // FX pairs are stored as base/quote (from/to). USD-base pairs (USD/JPY,
      // USD/KRW, …) all have from="USD", so using `from` alone collapses every
      // one of them to "USD". Use the full pair for forex; non-FX (XAU, AAPL)
      // keep their bare base ticker.
      const baseCat = classify(p.from, "Ostium");
      const symbol = baseCat === "forex" ? `${p.from}${p.to}` : p.from;

      markets.push({
        venue,
        symbol,
        category: classify(symbol, "Ostium"),
        markPx,
        oiUsd,
        // 24h opened notional aggregated from `trade` events (no day-data entity
        // exists). null only if the aggregation query failed; 0 = no trades.
        vol24hUsd: volume.get(p.from) ?? null,
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

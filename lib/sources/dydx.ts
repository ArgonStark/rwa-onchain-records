import { classify } from "../classify";
import type { PerpMarket, VenueResult } from "../types";

// dYdX v4 indexer — verified live 2026-06-13.
//   GET /v4/perpetualMarkets
// Response: { markets: { "BTC-USD": { ticker, oraclePrice, volume24H,
//             openInterest, nextFundingRate, status, ... }, ... } }
//
// Notes:
//  - openInterest is in BASE units -> oiUsd = openInterest * oraclePrice.
//  - volume24H is already USD notional.
//  - nextFundingRate is the upcoming 1h funding rate as a fraction.
//  - No long/short split -> skew is null.
//  - dYdX has historically been crypto-only, but markets are governance-listed
//    and can change, so we run every ticker through the shared classifier rather
//    than hardcoding crypto — any RWA listing (e.g. a TSLA synthetic) is tagged
//    automatically.

const MARKETS_URL = "https://indexer.dydx.trade/v4/perpetualMarkets";

interface DydxMarket {
  ticker: string;
  status: string;
  oraclePrice: string;
  volume24H: string;
  openInterest: string;
  nextFundingRate: string;
}

interface DydxResponse {
  markets: Record<string, DydxMarket>;
}

export async function getDydxPerps(): Promise<VenueResult> {
  const venue = "dYdX";
  try {
    const res = await fetch(MARKETS_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`dYdX indexer ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as DydxResponse;

    const markets: PerpMarket[] = [];
    for (const m of Object.values(data.markets)) {
      if (m.status !== "ACTIVE") continue;
      const price = Number(m.oraclePrice);
      const oi = Number(m.openInterest);
      if (!Number.isFinite(price) || !Number.isFinite(oi)) continue;

      const funding = Number(m.nextFundingRate);
      const vol = Number(m.volume24H);

      const symbol = m.ticker.replace(/-USD$/, "");
      markets.push({
        venue,
        symbol,
        category: classify(symbol, venue),
        markPx: price,
        oiUsd: oi * price,
        vol24hUsd: Number.isFinite(vol) ? vol : null,
        funding: Number.isFinite(funding) ? funding : null,
        skew: null,
        source: "dYdX v4 indexer /perpetualMarkets",
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

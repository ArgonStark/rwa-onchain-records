import { classify } from "../classify";
import type { PerpMarket, VenueResult } from "../types";

// Ondo Perps — RWA-only perp DEX (equities, ETFs/indices, commodities; no crypto
// majors). Verified live 2026-06-26.
//
// Public, no-key REST market-data API. A single endpoint carries everything we
// normalize — mark price, USD OI, 24h USD volume, and funding — so we make one
// call rather than fan out across open_interest/volume/mark_prices/funding_rates:
//   GET https://api.ondoperps.xyz/v1/perps/contracts
//   -> { success, result: [{
//        market:"AAPL-USD.P", baseCurrency:"AAPL", disabled, isClosed,
//        lastPrice, usdVolume /*24h*/, openInterestUsd, fundingRate,
//        nextFundingRateTimestamp, tags:["Stock"|"Commodity"|"ETF"|"Index"], ... }] }
//
// Confirmed units / scaling (live 2026-06-26):
//  - lastPrice, openInterestUsd, usdVolume are USD. (The sibling `openInterest` /
//    `baseVolume` are base-unit sizes; we take the *Usd fields directly.)
//  - fundingRate is the HOURLY fraction. Both contracts.nextFundingRateTimestamp
//    and funding_rates.intervalEnds land on the next top-of-hour, so the funding
//    interval is 1h — no scaling needed. 0.0000063/hr lines up with HL (~8.4e-6/hr).
//    Positive ⇒ longs pay shorts (peer convention).
//  - NOTE: every market currently reports the same fundingRate (0.0000063) and a
//    0 premiumIndex on every per-minute measurement — i.e. only the baseline
//    interest-rate term is live and the premium is flat 0 right now. Verified, not
//    a bug (mirrors the "magnitude switched off" situation documented for Ostium).
//  - No long/short OI split is exposed → skew = null.
//  - All symbols classify cleanly via the shared classify() on baseCurrency. Ondo
//    tags ETFs (QQQ/SPY) as "ETF"; we fold those into "index" like the rest of the
//    app. US500/US100 quote at INDEX LEVEL (~7300/~29000), not ETF scale — the
//    basis price-guard handles that downstream. markPx prefers lastPrice and
//    falls back to indexPrice (oracle); pre-launch markets (QQQ/SPY today) have
//    both 0 and are skipped.

const CONTRACTS_URL = "https://api.ondoperps.xyz/v1/perps/contracts";
const VENUE = "Ondo";

interface OndoContract {
  market: string;
  baseCurrency: string;
  disabled: boolean;
  isClosed: boolean;
  lastPrice: string;
  indexPrice: string;
  usdVolume: string;
  openInterestUsd: string;
  fundingRate: string;
}

interface OndoContractsResp {
  success: boolean;
  result?: OndoContract[];
}

export async function getOndoPerps(): Promise<VenueResult> {
  try {
    const res = await fetch(CONTRACTS_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Ondo /v1/perps/contracts ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as OndoContractsResp;
    if (!data.success || !data.result) {
      throw new Error("Ondo /v1/perps/contracts: success=false or missing result");
    }

    const markets: PerpMarket[] = [];
    for (const c of data.result) {
      if (c.disabled) continue;
      // Prefer last traded price; fall back to the oracle index when a live
      // market has no recent trade (lastPrice 0). Both 0 ⇒ inactive, skip.
      const last = Number(c.lastPrice);
      const idx = Number(c.indexPrice);
      const markPx = Number.isFinite(last) && last > 0 ? last : idx;
      if (!Number.isFinite(markPx) || markPx <= 0) continue;

      const oiUsd = Number(c.openInterestUsd);
      const vol = Number(c.usdVolume);
      const rate = Number(c.fundingRate);

      markets.push({
        venue: VENUE,
        symbol: c.baseCurrency,
        category: classify(c.baseCurrency, VENUE),
        markPx,
        oiUsd: Number.isFinite(oiUsd) ? oiUsd : 0,
        vol24hUsd: Number.isFinite(vol) ? vol : null,
        funding: Number.isFinite(rate) ? rate : null,
        skew: null,
        source: "Ondo /v1/perps/contracts (public)",
      });
    }
    return { venue: VENUE, status: "ok", markets };
  } catch (err) {
    return {
      venue: VENUE,
      status: "error",
      markets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

import { classify } from "../classify";
import type { PerpMarket, VenueResult } from "../types";

// Lighter (zkLighter — Ethereum zk-rollup orderbook DEX). Verified live 2026-06-16.
//
// REST base: https://mainnet.zklighter.elliot.ai
//   GET /api/v1/orderBookDetails -> { order_book_details: [{ symbol, market_id,
//        market_type, status, last_trade_price, open_interest,
//        daily_quote_token_volume, daily_base_token_volume, ... }] }
//   GET /api/v1/funding-rates    -> { funding_rates: [{ market_id, exchange,
//        symbol, rate }] }  (one row per market PER exchange — we keep exchange="lighter")
//
// Confirmed units (no 1eN scaling — fields are plain human numbers):
//  - last_trade_price is USD (BTC ~65712.5, XAU ~4325.89, AAPL ~298.228).
//  - open_interest is in BASE units -> oiUsd = open_interest * last_trade_price.
//    Sanity 2026-06-16: BTC 1708.36 * 65712 ≈ $112M; XAU 3067.4 * 4325.89 ≈ $13.3M.
//  - daily_quote_token_volume is already USD notional 24h (BTC ~$696M).
//  - funding-rates `rate` is the hourly funding fraction (interval = 1h per docs;
//    BTC ~9.6e-5, RWA ~3.2e-5 — same scale as HL/dYdX). Positive ⇒ longs pay.
//  - No long/short split in REST -> skew is null.
//
// Lighter NOW lists a broad RWA suite (the earlier research note that it was
// crypto-only is stale): equities (AAPL, NVDA, GME, plus Korea SKHYNIX/HYUNDAI/
// SAMSUNG, space/AI names SPCX/RKLB/CRWV), commodities (XAU, XAG, PAXG,
// BRENTOIL, NATGAS), indices (US100, US500, IWM, H100), FX (EURUSD, NZDUSD…).
// Each symbol is tagged via the shared classifier.

const BASE = "https://mainnet.zklighter.elliot.ai";
const VENUE = "Lighter";

interface OrderBookDetail {
  symbol: string;
  market_id: number;
  market_type: string; // "perp" | "spot"
  status: string; // "active" | "inactive"
  last_trade_price: number;
  open_interest: number;
  daily_quote_token_volume: number;
}

interface FundingRate {
  market_id: number;
  exchange: string; // we keep "lighter"
  symbol: string;
  rate: number;
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Lighter ${path} ${res.status} ${res.statusText}`);
  return res.json();
}

/** market_id -> Lighter's own hourly funding fraction. */
async function fetchFunding(): Promise<Map<number, number>> {
  const data = (await fetchJson("/api/v1/funding-rates")) as {
    funding_rates?: FundingRate[];
  };
  const out = new Map<number, number>();
  for (const f of data.funding_rates ?? []) {
    if (f.exchange !== "lighter") continue; // the feed also carries CEX rates
    const rate = Number(f.rate);
    if (Number.isFinite(rate)) out.set(f.market_id, rate);
  }
  return out;
}

export async function getLighterPerps(): Promise<VenueResult> {
  try {
    const [details, funding] = await Promise.all([
      fetchJson("/api/v1/orderBookDetails") as Promise<{
        order_book_details?: OrderBookDetail[];
      }>,
      // Funding is best-effort: a failure leaves funding null, not the whole venue.
      fetchFunding().catch(() => new Map<number, number>()),
    ]);

    const markets: PerpMarket[] = [];
    for (const d of details.order_book_details ?? []) {
      if (d.market_type !== "perp" || d.status !== "active") continue;
      const markPx = Number(d.last_trade_price);
      const oiBase = Number(d.open_interest);
      if (!Number.isFinite(markPx) || markPx <= 0) continue; // inactive/no-trade

      const vol = Number(d.daily_quote_token_volume);
      const fundingRate = funding.get(d.market_id);

      markets.push({
        venue: VENUE,
        symbol: d.symbol,
        category: classify(d.symbol, VENUE),
        markPx,
        oiUsd: Number.isFinite(oiBase) ? oiBase * markPx : 0,
        vol24hUsd: Number.isFinite(vol) ? vol : null,
        funding: fundingRate ?? null, // null = not in feed; real value otherwise
        skew: null, // REST exposes no long/short split
        source: "Lighter /api/v1/orderBookDetails + funding-rates",
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

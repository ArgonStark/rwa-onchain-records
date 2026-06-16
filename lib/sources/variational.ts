import { classify } from "../classify";
import { skew as skewMetric } from "../metrics";
import type { PerpMarket, VenueResult } from "../types";

// Variational (Omni — RFQ perp protocol). Verified live 2026-06-16.
//
// Public, no-key read-only market-data API (the *trading* API is still private):
//   GET https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats
//   -> { total_volume_24h, open_interest, num_markets,
//        listings: [{ ticker, name, mark_price, volume_24h,
//          open_interest: { long_open_interest, short_open_interest },
//          funding_rate, funding_interval_s, ... }] }
//   Rate limits: 10 req / 10s per IP, 1000 req/min global.
//
// Confirmed units / scaling (sanity-checked against the data + peer venues):
//  - mark_price is USD. volume_24h is USD notional 24h.
//  - long/short_open_interest are USD notional (BTC long ~$90.8M — would be
//    absurd as BTC base units). oiUsd = long + short = trader-side OI. NOTE: the
//    top-level `open_interest` ($1.0B) is ≈ 2× Σ(long+short) ($500.6M) because
//    this is an RFQ venue where the single LP mirrors every trade — the headline
//    counts both legs. We report the trader-side notional (long+short).
//  - skew = long / (long + short) — Variational is the one venue here that
//    exposes a long/short split.
//  - funding_rate is the per-`funding_interval_s` rate expressed in PERCENT (the
//    docs say "fraction ×100 = %", but only the percent reading reconciles with
//    reality: BTC 0.0233 → hourly (0.0233/100)/8 = 2.9e-5, in line with HL
//    8.4e-6 / Lighter 9.6e-5; the fraction reading gives 2.9e-3, ~100× peers).
//    funding (hourly fraction) = (funding_rate / 100) / (funding_interval_s/3600).
//    Doc/live discrepancy flagged here per CLAUDE.md.

const STATS_URL =
  "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats";
const VENUE = "Variational";

interface VarListing {
  ticker: string;
  name: string;
  mark_price: string;
  volume_24h: string;
  open_interest: {
    long_open_interest: string;
    short_open_interest: string;
  };
  funding_rate: string;
  funding_interval_s: number;
}

interface VarStats {
  listings?: VarListing[];
}

export async function getVariationalPerps(): Promise<VenueResult> {
  try {
    const res = await fetch(STATS_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Variational /metadata/stats ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as VarStats;

    const markets: PerpMarket[] = [];
    for (const l of data.listings ?? []) {
      const markPx = Number(l.mark_price);
      if (!Number.isFinite(markPx) || markPx <= 0) continue;

      const longOi = Number(l.open_interest.long_open_interest);
      const shortOi = Number(l.open_interest.short_open_interest);
      const oiUsd =
        Number.isFinite(longOi) && Number.isFinite(shortOi) ? longOi + shortOi : 0;

      const vol = Number(l.volume_24h);
      const rate = Number(l.funding_rate);
      const intervalH = l.funding_interval_s / 3600;
      const funding =
        Number.isFinite(rate) && intervalH > 0 ? rate / 100 / intervalH : null;

      markets.push({
        venue: VENUE,
        symbol: l.ticker,
        category: classify(l.ticker, VENUE),
        markPx,
        oiUsd,
        vol24hUsd: Number.isFinite(vol) ? vol : null,
        funding,
        skew:
          Number.isFinite(longOi) && Number.isFinite(shortOi)
            ? skewMetric(longOi, shortOi)
            : null,
        source: "Variational /metadata/stats (public read-only)",
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

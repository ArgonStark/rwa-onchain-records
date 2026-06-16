import { classify } from "../classify";
import type { AssetCategory, PerpMarket, VenueResult } from "../types";

// Aster (AsterDEX — BNB Chain; Binance-fapi-compatible). Verified live 2026-06-16.
//
// REST base: https://fapi.asterdex.com (public market data, no key)
//   GET /fapi/v1/exchangeInfo  -> { symbols: [{ symbol, baseAsset, contractType,
//        status, symbolType, underlyingSubType, ... }] }   (490 markets)
//   GET /fapi/v1/premiumIndex  -> [{ symbol, markPrice, lastFundingRate, ... }]
//   GET /fapi/v1/ticker/24hr   -> [{ symbol, quoteVolume, lastPrice, ... }]
//   GET /fapi/v1/openInterest?symbol=X -> { openInterest }   (PER-SYMBOL only)
//
// Confirmed units / scaling:
//  - markPrice (premiumIndex) is USD. openInterest is in BASE units ->
//    oiUsd = openInterest * markPrice. Sanity 2026-06-16: BTC 5440.33 * 65939
//    ≈ $358.7M.
//  - quoteVolume (ticker/24hr) is already USD notional 24h (BTC ~$737M).
//  - lastFundingRate is the funding fraction over an 8-HOUR interval (confirmed:
//    fundingTime stamps are 8h apart). We normalize to the project's HOURLY
//    convention -> funding = lastFundingRate / 8. Positive ⇒ longs pay.
//  - No long/short split -> skew is null.
//
// RWA detection: Aster authoritatively tags contracts via `symbolType` (1 =
// stock/RWA) and `underlyingSubType` (STOCK / ETF / Commodities / Semiconductor).
// We trust that venue metadata: Commodities -> commodity; otherwise run the
// shared classifier (which routes ETFs->index and known stocks->equity), and if
// the classifier still says crypto but Aster flags symbolType==1, force equity
// (the venue says it's a stock we just don't have in our set yet — not invented).

const BASE = "https://fapi.asterdex.com";
const VENUE = "Aster";
// Fetch per-symbol OI for every RWA contract + any crypto with >= this 24h USD
// volume. Skips the dead long-tail so we don't hammer the per-symbol endpoint.
const MIN_CRYPTO_VOL_USD = 1_000_000;
const OI_CONCURRENCY = 10;

interface AsterSymbol {
  symbol: string; // e.g. "AAPLUSDT"
  baseAsset: string; // e.g. "AAPL"
  contractType: string;
  status: string;
  symbolType: number; // 1 = stock/RWA
  underlyingSubType?: string[];
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Aster ${path} ${res.status} ${res.statusText}`);
  return res.json();
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function asterCategory(s: AsterSymbol): AssetCategory {
  const sub = new Set(s.underlyingSubType ?? []);
  if (sub.has("Commodities")) return "commodity";
  const c = classify(s.baseAsset, VENUE);
  // Venue metadata says it's a stock/RWA but it isn't in our equity set yet.
  if (c === "crypto" && s.symbolType === 1) return "equity";
  return c;
}

export async function getAsterPerps(): Promise<VenueResult> {
  try {
    const [info, premium, ticker] = await Promise.all([
      getJson("/fapi/v1/exchangeInfo") as Promise<{ symbols: AsterSymbol[] }>,
      getJson("/fapi/v1/premiumIndex") as Promise<
        { symbol: string; markPrice: string; lastFundingRate: string }[]
      >,
      getJson("/fapi/v1/ticker/24hr") as Promise<
        { symbol: string; quoteVolume: string }[]
      >,
    ]);

    const markBy = new Map(premium.map((p) => [p.symbol, p]));
    const volBy = new Map(ticker.map((t) => [t.symbol, Number(t.quoteVolume)]));

    const tradable = info.symbols.filter(
      (s) => s.contractType === "PERPETUAL" && s.status === "TRADING",
    );

    // Decide which markets to value with OI: all RWA + liquid crypto.
    const withClass = tradable.map((s) => ({ s, category: asterCategory(s) }));
    const targets = withClass.filter(
      ({ s, category }) =>
        category !== "crypto" || (volBy.get(s.symbol) ?? 0) >= MIN_CRYPTO_VOL_USD,
    );

    const oiResults = await mapLimit(targets, OI_CONCURRENCY, async ({ s }) => {
      try {
        const r = (await getJson(`/fapi/v1/openInterest?symbol=${s.symbol}`)) as {
          openInterest?: string;
        };
        const oi = Number(r.openInterest);
        return Number.isFinite(oi) ? oi : null;
      } catch {
        return null; // per-symbol failure: skip this market rather than fake OI
      }
    });

    const markets: PerpMarket[] = [];
    targets.forEach(({ s, category }, idx) => {
      const oiBase = oiResults[idx];
      const pm = markBy.get(s.symbol);
      const markPx = pm ? Number(pm.markPrice) : NaN;
      if (oiBase == null || !Number.isFinite(markPx) || markPx <= 0) return;

      const fr = pm ? Number(pm.lastFundingRate) : NaN;
      const vol = volBy.get(s.symbol);

      markets.push({
        venue: VENUE,
        symbol: s.baseAsset,
        category,
        markPx,
        oiUsd: oiBase * markPx,
        vol24hUsd: vol !== undefined && Number.isFinite(vol) ? vol : null,
        // 8h funding fraction normalized to hourly to match HL/dYdX/Lighter.
        funding: Number.isFinite(fr) ? fr / 8 : null,
        skew: null,
        source: "Aster fapi exchangeInfo + premiumIndex + ticker/24hr + openInterest",
      });
    });

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

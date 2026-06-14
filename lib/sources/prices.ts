// Spot-price sources for token premium. All public, no-key — verified live
// 2026-06-13. Each returns a partial map keyed by id/mint; callers tolerate gaps.

interface CoinGeckoPrice {
  usd: number;
}

/** CoinGecko simple price by id (gold tokens). Returns id -> USD. */
export async function fetchCoinGeckoPrices(
  ids: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(
    ids.join(","),
  )}&vs_currencies=usd`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const json = (await res.json()) as Record<string, CoinGeckoPrice>;
  for (const [id, v] of Object.entries(json)) {
    if (typeof v?.usd === "number") out.set(id, v.usd);
  }
  return out;
}

/** Real XAU spot (USD/troy oz) from gold-api.com (free, no key). */
export async function fetchXauSpot(): Promise<number> {
  const res = await fetch("https://api.gold-api.com/price/XAU", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`gold-api ${res.status}`);
  const json = (await res.json()) as { price?: number };
  if (typeof json.price !== "number") throw new Error("gold-api: no price");
  return json.price;
}

export interface JupiterPrice {
  /** xStock token price in USD — on-chain DEX-derived (Jupiter routing). */
  tokenUsd: number;
  /** Underlying equity price in USD (real off-chain share price; see audit). */
  underlyingUsd: number | null;
}

interface JupV3Entry {
  usdPrice?: number;
  stockData?: { price?: number };
}

/**
 * Jupiter price v3 (lite endpoint). Returns mint -> { tokenUsd, underlyingUsd }.
 *
 * AUDIT (2026-06-14): confirmed `usdPrice` and `stockData.price` are INDEPENDENT
 * sources, so the premium (tokenUsd / underlyingUsd - 1) is NOT circular:
 *  - `usdPrice` is the on-chain DEX price of the xStock token (tiny ~$1.8M pool).
 *  - `stockData` is a real off-chain equity feed: it carries the true company
 *    market cap (TSLA ~$1.5T, NVDA ~$5T) which cannot come from on-chain token
 *    data, and `stockData.price` matched independent Yahoo quotes within ~0.1%
 *    (TSLA 406.1 vs 406.4, NVDA 205.4 vs 205.2, AAPL 291.5 vs 291.1).
 * So premium = on-chain token price vs real underlying share price — the genuine
 * tokenization premium/discount. A dedicated equities API (Finnhub/Polygon, key
 * server-side) could be swapped in as an independent cross-check later.
 */
export async function fetchJupiterPrices(
  mints: string[],
): Promise<Map<string, JupiterPrice>> {
  const out = new Map<string, JupiterPrice>();
  if (mints.length === 0) return out;
  const url = `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Jupiter price v3 ${res.status}`);
  const json = (await res.json()) as Record<string, JupV3Entry>;
  for (const [mint, v] of Object.entries(json)) {
    if (typeof v?.usdPrice !== "number") continue;
    const underlying = v.stockData?.price;
    out.set(mint, {
      tokenUsd: v.usdPrice,
      underlyingUsd: typeof underlying === "number" ? underlying : null,
    });
  }
  return out;
}

/**
 * Rough US equity regular-trading-hours check (Mon–Fri, 09:30–16:00 ET).
 * ET ~= UTC-4 (EDT) in June. Used only to LABEL equity premium, not to gate it.
 */
export function isUsMarketOpen(now: Date = new Date()): boolean {
  // Shift UTC to approximate ET (EDT, June). Good enough for a label.
  const et = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const day = et.getUTCDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = et.getUTCHours() * 60 + et.getUTCMinutes();
  return mins >= 9 * 60 + 30 && mins <= 16 * 60;
}

import { classifySymbol, stripPrefix } from "../categories";
import type { PerpMarket, VenueResult } from "../types";

// Hyperliquid /info — verified live 2026-06-13.
//   POST {"type":"metaAndAssetCtxs"}            -> crypto perps
//   POST {"type":"metaAndAssetCtxs","dex":"xyz"} -> HIP-3 RWA perps (Trade[XYZ])
//
// Response shape (confirmed):
//   [ { universe: [{ name, szDecimals, maxLeverage, ... }] },
//     [ { funding, openInterest, dayNtlVlm, premium, oraclePx, markPx, midPx, ... } ] ]
// universe[i] aligns positionally with ctxs[i].
//
// Notes:
//  - openInterest is in BASE units -> oiUsd = openInterest * markPx.
//  - dayNtlVlm is already USD notional volume.
//  - funding is the (hourly) funding rate as a fraction.
//  - This endpoint has NO long/short split, so skew is null here.

const INFO_URL = "https://api.hyperliquid.xyz/info";

interface HlAsset {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  isDelisted?: boolean;
}

interface HlAssetCtx {
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
  markPx: string;
  oraclePx: string;
  prevDayPx: string;
}

type MetaAndCtxs = [{ universe: HlAsset[] }, HlAssetCtx[]];

async function fetchMetaAndCtxs(dex?: string): Promise<MetaAndCtxs> {
  const body = dex
    ? { type: "metaAndAssetCtxs", dex }
    : { type: "metaAndAssetCtxs" };
  const res = await fetch(INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid /info ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as MetaAndCtxs;
}

function normalize(
  data: MetaAndCtxs,
  venue: string,
  source: string,
  forceCategory: "crypto" | null,
): PerpMarket[] {
  const [{ universe }, ctxs] = data;
  const out: PerpMarket[] = [];

  for (let i = 0; i < universe.length; i++) {
    const asset = universe[i];
    const ctx = ctxs[i];
    if (!asset || !ctx || asset.isDelisted) continue;

    const markPx = Number(ctx.markPx);
    const oi = Number(ctx.openInterest);
    if (!Number.isFinite(markPx) || !Number.isFinite(oi)) continue;

    const funding = Number(ctx.funding);
    const vol = Number(ctx.dayNtlVlm);

    out.push({
      venue,
      symbol: stripPrefix(asset.name),
      category: forceCategory ?? classifySymbol(asset.name),
      markPx,
      oiUsd: oi * markPx,
      vol24hUsd: Number.isFinite(vol) ? vol : null,
      funding: Number.isFinite(funding) ? funding : null,
      skew: null, // metaAndAssetCtxs exposes no long/short split
      source,
    });
  }
  return out;
}

/** Crypto perps from Hyperliquid's main book. */
export async function getHyperliquidPerps(): Promise<VenueResult> {
  const venue = "Hyperliquid";
  try {
    const data = await fetchMetaAndCtxs();
    return {
      venue,
      status: "ok",
      markets: normalize(data, venue, "Hyperliquid /info metaAndAssetCtxs", "crypto"),
    };
  } catch (err) {
    return {
      venue,
      status: "error",
      markets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** HIP-3 RWA perps (equities/commodities/FX/index) from the Trade[XYZ] dex. */
export async function getHyperliquidHip3Perps(): Promise<VenueResult> {
  const venue = "Hyperliquid HIP-3";
  try {
    const data = await fetchMetaAndCtxs("xyz");
    return {
      venue,
      status: "ok",
      markets: normalize(
        data,
        venue,
        'Hyperliquid /info metaAndAssetCtxs dex="xyz"',
        null,
      ),
    };
  } catch (err) {
    return {
      venue,
      status: "error",
      markets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

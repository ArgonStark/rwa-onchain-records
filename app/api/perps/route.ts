import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import {
  getHyperliquidPerps,
  getHyperliquidHip3Perps,
} from "@/lib/sources/hyperliquid";
import { getOstiumPerps } from "@/lib/sources/ostium";
import { getDydxPerps } from "@/lib/sources/dydx";
import type { PerpsResponse, VenueResult } from "@/lib/types";

export const dynamic = "force-dynamic"; // always evaluate; our own TTL cache gates fetches

const TTL_MS = 30_000;

async function buildPerps(): Promise<PerpsResponse> {
  // One failing venue must never break the response — settle all, keep the rest.
  const results = await Promise.allSettled<VenueResult>([
    getHyperliquidPerps(),
    getHyperliquidHip3Perps(),
    getOstiumPerps(),
    getDydxPerps(),
  ]);

  const venues: PerpsResponse["venues"] = [];
  const markets: PerpsResponse["markets"] = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      const v = r.value;
      venues.push({
        venue: v.venue,
        status: v.status,
        count: v.markets.length,
        error: v.error,
      });
      markets.push(...v.markets);
    } else {
      venues.push({
        venue: "unknown",
        status: "error",
        count: 0,
        error: String(r.reason),
      });
    }
  }

  markets.sort((a, b) => b.oiUsd - a.oiUsd);

  return { asOf: new Date().toISOString(), venues, markets };
}

export async function GET() {
  const data = await cached("perps", TTL_MS, buildPerps);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}

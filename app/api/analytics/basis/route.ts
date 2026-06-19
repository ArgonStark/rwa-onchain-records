import { NextResponse } from "next/server";
import { getBasis } from "@/lib/basis";

export const dynamic = "force-dynamic";

// F — perp-spot basis lollipop source (Phase 5, live). basis = perp mark ÷ spot
// token − 1, only where both legs exist and pass the price-proximity guard. The
// client renders { asset, basisPct, perpVenue, spotVenue } as lollipops; an
// empty set carries a status string and the scaffold shows it.
export async function GET() {
  const data = await getBasis().catch((e) => ({
    status: e instanceof Error ? `basis error: ${e.message}` : "basis error",
    asOf: null,
    tolerancePct: 0.1,
    items: [],
  }));
  return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=30" } });
}

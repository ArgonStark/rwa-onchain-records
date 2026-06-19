import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// F — perp-spot basis lollipop source. SCAFFOLD: Phase 5 computes basis
// (perp mark − spot token, as a %). Until then this returns an empty set with a
// pending status — we never fake values. Data contract the client renders:
//   { asset: string; basisPct: number; perpVenue: string; spotVenue: string }
export async function GET() {
  return NextResponse.json(
    {
      status: "pending: basis not yet computed (Phase 5)",
      items: [] as {
        asset: string;
        basisPct: number;
        perpVenue: string;
        spotVenue: string;
      }[],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

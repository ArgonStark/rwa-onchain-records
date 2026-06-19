import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getVenueRank } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// D — venue rank bump source. Daily RWA-OI rank per venue. days controls span.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(90, Math.max(2, Number(url.searchParams.get("days")) || 30));
  const sinceMs = Date.now() - days * 86_400_000;
  const { buckets, series } = await getVenueRank(sinceMs).catch(() => ({ buckets: [], series: [] }));
  return NextResponse.json(
    { hasDatabase: hasDatabase(), buckets, series },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

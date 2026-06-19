import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getLatestMarkets } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// A — OI / 24h-volume treemap source. Latest coherent snapshot slice; the client
// builds the venue → class → market hierarchy and toggles the value metric.
export async function GET() {
  const { asOf, markets } = await getLatestMarkets().catch(() => ({ asOf: null, markets: [] }));
  return NextResponse.json(
    { hasDatabase: hasDatabase(), asOf, markets },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

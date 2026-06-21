import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getLeaderboard } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const { asOf, venues } = await getLeaderboard().catch(() => ({ asOf: null, venues: [] }));
  return NextResponse.json(
    { hasDatabase: hasDatabase(), asOf, venues },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

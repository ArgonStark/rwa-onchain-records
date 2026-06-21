import { NextResponse } from "next/server";
import { getIssuance } from "@/lib/sources/issuance";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await getIssuance().catch(() => []);
  return NextResponse.json(
    { tokens },
    { headers: { "Cache-Control": "public, max-age=60" } },
  );
}

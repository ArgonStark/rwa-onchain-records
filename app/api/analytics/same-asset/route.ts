import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getCanonicalOptions, getSameAsset } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// E — same-asset-across-venues source. No `asset` param → return the list of
// canonical assets listed on ≥2 venues. With `asset=<key>` → per-venue OI /
// funding / mark for that canonical underlying at the latest snapshot.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = url.searchParams.get("asset");
  if (!asset) {
    const options = await getCanonicalOptions().catch(() => []);
    return NextResponse.json(
      { hasDatabase: hasDatabase(), options },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  const data = await getSameAsset(asset).catch(() => ({
    asOf: null,
    label: asset,
    category: null,
    venues: [],
  }));
  return NextResponse.json(
    { hasDatabase: hasDatabase(), ...data },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

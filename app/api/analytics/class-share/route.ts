import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getClassSeries } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// B — asset-class share streamgraph source. metric=oi|vol, days controls span.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const metric = url.searchParams.get("metric") === "vol" ? "vol" : "oi";
  const days = Math.min(60, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const sinceMs = Date.now() - days * 86_400_000;
  const points = await getClassSeries(sinceMs, metric).catch(() => []);
  return NextResponse.json(
    { hasDatabase: hasDatabase(), metric, days, points },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

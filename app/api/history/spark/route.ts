import { NextResponse } from "next/server";
import { getSparkSeries, parseWindow, windowMs } from "@/lib/history";

export const dynamic = "force-dynamic";

// GET /api/history/spark?window=  -> { "venue|symbol": [oiUsd, ...] } for inline
// sparklines. One query for all markets.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = parseWindow(url.searchParams.get("window"));
  const since = Date.now() - windowMs(window);
  const series = await getSparkSeries(since);
  return NextResponse.json(
    { window, series },
    { headers: { "Cache-Control": "public, max-age=30" } },
  );
}

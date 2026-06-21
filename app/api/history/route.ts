import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getDailyVolume } from "@/lib/dailyVolume";
import {
  getHlCandles,
  getPerpSeries,
  getTokenSeries,
  parseWindow,
  windowMs,
} from "@/lib/history";

export const dynamic = "force-dynamic";

// GET /api/history?venue=&symbol=&window=   -> perp series (snapshots + HL candles)
// GET /api/history?token=&window=           -> token premium series (snapshots)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const window = parseWindow(url.searchParams.get("window"));
  const since = Date.now() - windowMs(window);
  const token = url.searchParams.get("token");

  if (token) {
    const series = await getTokenSeries(token, since);
    return NextResponse.json({
      kind: "token",
      token,
      window,
      hasDatabase: hasDatabase(),
      snapshots: series,
      sources: { snapshots: "RWA snapshots (Postgres)" },
    });
  }

  const venue = url.searchParams.get("venue");
  const symbol = url.searchParams.get("symbol");
  if (!venue || !symbol) {
    return NextResponse.json(
      { error: "provide venue+symbol (perp) or token" },
      { status: 400 },
    );
  }

  // Daily volume bars always span >= 14 days so the bar chart is meaningful even
  // at intraday OI/price zoom; OI/price use the selected window.
  const sinceDay = new Date(Math.min(since, Date.now() - 14 * 86_400_000))
    .toISOString()
    .slice(0, 10);

  // Own snapshots for every venue; HL candles add real depth for crypto/HIP-3.
  const [snapshots, candles, dailyVolume] = await Promise.all([
    getPerpSeries(venue, symbol, since),
    getHlCandles(venue, symbol, window, since).catch(() => null),
    getDailyVolume(venue, symbol, sinceDay).catch(() => []),
  ]);

  const dailyApprox = dailyVolume.some((d) => d.isApprox);

  return NextResponse.json({
    kind: "perp",
    venue,
    symbol,
    window,
    hasDatabase: hasDatabase(),
    snapshots,
    candles,
    dailyVolume,
    sources: {
      snapshots: "RWA snapshots (Postgres)",
      candles: candles ? "Hyperliquid candleSnapshot" : null,
      dailyVolume: dailyVolume[0]?.source ?? null,
      dailyVolumeApprox: dailyApprox,
    },
  });
}

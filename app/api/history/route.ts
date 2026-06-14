import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
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
      sources: { snapshots: "EWA snapshots (Postgres)" },
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

  // Own snapshots for every venue; HL candles add real depth for crypto/HIP-3.
  const [snapshots, candles] = await Promise.all([
    getPerpSeries(venue, symbol, since),
    getHlCandles(venue, symbol, window, since).catch(() => null),
  ]);

  return NextResponse.json({
    kind: "perp",
    venue,
    symbol,
    window,
    hasDatabase: hasDatabase(),
    snapshots,
    candles,
    sources: {
      snapshots: "EWA snapshots (Postgres)",
      candles: candles ? "Hyperliquid candleSnapshot" : null,
    },
  });
}

import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import {
  getDailyByClass,
  getDailyByVenue,
  getHeaderStats,
  getOiByClass,
} from "@/lib/aggregates";

export const dynamic = "force-dynamic";

// Aggregate dashboard data in one call. volDays controls the daily-volume span,
// oiWindow the OI-by-class span.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const volDays = Math.min(60, Math.max(7, Number(url.searchParams.get("volDays")) || 30));
  const oiHours = Math.min(720, Math.max(6, Number(url.searchParams.get("oiHours")) || 168));
  const sinceDay = new Date(Date.now() - volDays * 86_400_000).toISOString().slice(0, 10);
  const sinceOiMs = Date.now() - oiHours * 3_600_000;

  const [byClass, byVenue, oiByClass, header] = await Promise.all([
    getDailyByClass(sinceDay).catch(() => []),
    getDailyByVenue(sinceDay).catch(() => []),
    getOiByClass(sinceOiMs).catch(() => []),
    getHeaderStats().catch(() => null),
  ]);

  return NextResponse.json({
    hasDatabase: hasDatabase(),
    header,
    dailyByClass: byClass,
    dailyByVenue: byVenue,
    oiByClass,
    sources: {
      dailyVolume: "RWA daily_volume (dYdX/Ostium exact, HL/HIP-3 ≈base×close)",
      oi: "RWA perp_snapshots",
    },
  });
}

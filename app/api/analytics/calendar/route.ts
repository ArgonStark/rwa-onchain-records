import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { getDailyCalendar } from "@/lib/analytics";

export const dynamic = "force-dynamic";

// C — calendar heatmap source. Daily notional per class from daily_volume; the
// client selects which class (default total RWA). days defaults to a full year
// so the calendar shows everything we have.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(400, Math.max(30, Number(url.searchParams.get("days")) || 365));
  const sinceDay = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { from, to, days: rows } = await getDailyCalendar(sinceDay).catch(() => ({
    from: null,
    to: null,
    days: [],
  }));
  return NextResponse.json(
    { hasDatabase: hasDatabase(), from, to, days: rows },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}

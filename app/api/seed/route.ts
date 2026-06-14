import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { seedDailyVolume } from "@/lib/dailyVolume";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Backfill daily_volume from each venue's best source. Protect with
// SNAPSHOT_TOKEN where set (same gate as /api/snapshot).
function authorized(req: Request): boolean {
  const token = process.env.SNAPSHOT_TOKEN;
  if (!token) return true;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export async function POST(req: Request) {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL not set — persistence disabled" },
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const daysBack = Math.min(60, Math.max(1, Number(url.searchParams.get("days")) || 14));
  try {
    const result = await seedDailyVolume(daysBack);
    return NextResponse.json({ daysBack, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

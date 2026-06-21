import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { takeSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Snapshot trigger called by Vercel Cron (GET) or manually (POST).
// Auth: checks SNAPSHOT_TOKEN first; also accepts Vercel's auto-injected
// CRON_SECRET (set automatically for cron-invoked routes on Vercel).
// Both are omitted in local dev (no token configured → open).
function authorized(req: Request): boolean {
  const token   = process.env.SNAPSHOT_TOKEN;
  const cronSec = process.env.CRON_SECRET;
  if (!token && !cronSec) return true; // local dev
  const auth = req.headers.get("authorization") ?? "";
  if (token   && auth === `Bearer ${token}`)   return true;
  if (cronSec && auth === `Bearer ${cronSec}`) return true;
  return false;
}

async function runSnapshot() {
  if (!hasDatabase()) {
    return NextResponse.json(
      { error: "DATABASE_URL not set — persistence disabled" },
      { status: 503 },
    );
  }
  try {
    const result = await takeSnapshot();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

// GET — invoked by Vercel Cron (every 15 min, see vercel.json)
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSnapshot();
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return runSnapshot();
}

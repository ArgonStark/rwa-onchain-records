import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db";
import { takeSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Snapshot trigger for an external cron (or the local interval writer). Protect
// with SNAPSHOT_TOKEN in any deployed environment; unprotected only when no
// token is configured (local dev).
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

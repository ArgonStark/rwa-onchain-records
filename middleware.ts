import { NextRequest, NextResponse } from "next/server";

// Lightweight IP-based rate limiting for API routes.
// Each Edge worker maintains its own counter — effective per-region in production.
// For strict multi-region limits, swap to @upstash/ratelimit + Upstash Redis.
//
// Limits:
//   /api/snapshot  — 10 req/min  (cron fires at most 4×/min; protect manual calls)
//   /api/seed      — 5 req/min   (heavy: scans 14d of candles across 3 venues)
//   /api/issuance  — 5 req/min   (slow: paginated Ethereum log scan, 1h cache)
//   all other /api — 120 req/min (generous for the UI's 30s auto-refresh)

interface Bucket { count: number; reset: number }
const counters = new Map<string, Bucket>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = counters.get(key);
  if (!b || b.reset < now) {
    counters.set(key, { count: 1, reset: now + windowMs });
    return true; // allowed
  }
  if (b.count >= max) return false; // blocked
  b.count++;
  return true;
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/")) return NextResponse.next();

  const ip = getIp(req);
  const MINUTE = 60_000;

  let max = 120;
  if (path.startsWith("/api/snapshot")) max = 10;
  else if (path.startsWith("/api/seed"))   max = 5;
  else if (path.startsWith("/api/issuance")) max = 5;

  const allowed = rateLimit(`${ip}:${path.split("/")[2]}`, max, MINUTE);
  if (!allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": "60", "Content-Type": "text/plain" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

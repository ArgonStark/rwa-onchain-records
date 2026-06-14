import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { aggregateTokens } from "@/lib/aggregate";

export const dynamic = "force-dynamic";

const TTL_MS = 30_000;

export async function GET() {
  const data = await cached("tokens", TTL_MS, aggregateTokens);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}

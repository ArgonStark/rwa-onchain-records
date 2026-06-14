import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { aggregatePerps } from "@/lib/aggregate";

export const dynamic = "force-dynamic"; // always evaluate; our own TTL cache gates fetches

const TTL_MS = 30_000;

export async function GET() {
  const data = await cached("perps", TTL_MS, aggregatePerps);
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=30" },
  });
}

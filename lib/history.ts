import { getPool, hasDatabase, ensureSchema } from "./db";

// Time-series reads. Our own snapshots are the defensible record for ALL venues
// (especially RWA, which no public API back-fills). For Hyperliquid crypto/HIP-3
// we additionally serve real candle history (price + volume) for depth.

export interface PerpPoint {
  ts: number; // epoch ms
  oiUsd: number | null;
  vol24h: number | null;
  funding: number | null;
  markPx: number | null;
}

export interface TokenPoint {
  ts: number;
  tokenPx: number | null;
  refPx: number | null;
  premium: number | null;
}

export interface CandlePoint {
  ts: number;
  close: number;
  volUsd: number;
}

export type Window = "1h" | "6h" | "24h" | "7d" | "30d";

const WINDOW_MS: Record<Window, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};

export function parseWindow(w: string | null): Window {
  return w && w in WINDOW_MS ? (w as Window) : "24h";
}

export function windowMs(w: Window): number {
  return WINDOW_MS[w];
}

/** Our snapshot series for one perp market. */
export async function getPerpSeries(
  venue: string,
  symbol: string,
  sinceMs: number,
): Promise<PerpPoint[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const res = await getPool().query(
    `SELECT ts, oi_usd, funding, vol24h, mark_px
       FROM perp_snapshots
      WHERE venue = $1 AND symbol = $2 AND ts >= to_timestamp($3 / 1000.0)
      ORDER BY ts ASC`,
    [venue, symbol, sinceMs],
  );
  return res.rows.map((r) => ({
    ts: new Date(r.ts as string).getTime(),
    oiUsd: r.oi_usd === null ? null : Number(r.oi_usd),
    vol24h: r.vol24h === null ? null : Number(r.vol24h),
    funding: r.funding === null ? null : Number(r.funding),
    markPx: r.mark_px === null ? null : Number(r.mark_px),
  }));
}

/** Our snapshot series for one spot token. */
export async function getTokenSeries(
  ticker: string,
  sinceMs: number,
): Promise<TokenPoint[]> {
  if (!hasDatabase()) return [];
  await ensureSchema();
  const res = await getPool().query(
    `SELECT ts, token_px, ref_px, premium
       FROM token_snapshots
      WHERE ticker = $1 AND ts >= to_timestamp($2 / 1000.0)
      ORDER BY ts ASC`,
    [ticker, sinceMs],
  );
  return res.rows.map((r) => ({
    ts: new Date(r.ts as string).getTime(),
    tokenPx: r.token_px === null ? null : Number(r.token_px),
    refPx: r.ref_px === null ? null : Number(r.ref_px),
    premium: r.premium === null ? null : Number(r.premium),
  }));
}

/**
 * Recent OI series for EVERY market in one query, keyed by "venue|symbol", for
 * inline sparklines. Capped to a window so payload stays small as history grows.
 */
export async function getSparkSeries(
  sinceMs: number,
): Promise<Record<string, number[]>> {
  if (!hasDatabase()) return {};
  await ensureSchema();
  const res = await getPool().query(
    `SELECT venue, symbol, oi_usd
       FROM perp_snapshots
      WHERE ts >= to_timestamp($1 / 1000.0)
      ORDER BY ts ASC`,
    [sinceMs],
  );
  const out: Record<string, number[]> = {};
  for (const r of res.rows) {
    if (r.oi_usd === null) continue;
    const key = `${r.venue}|${r.symbol}`;
    (out[key] ??= []).push(Number(r.oi_usd));
  }
  return out;
}

// ── Hyperliquid candles (real depth for crypto + HIP-3) ───────────────
const HL_INFO = "https://api.hyperliquid.xyz/info";

// HL candle name: crypto uses the bare symbol; HIP-3 uses the dex-prefixed name.
function hlCoin(venue: string, symbol: string): string | null {
  if (venue === "Hyperliquid") return symbol;
  if (venue === "Hyperliquid HIP-3") return `xyz:${symbol}`;
  return null; // Ostium / dYdX: snapshots only
}

function hlInterval(w: Window): string {
  if (w === "1h") return "5m";
  if (w === "6h") return "15m";
  if (w === "24h") return "1h";
  if (w === "7d") return "4h";
  return "1d";
}

interface HlCandle {
  t: number;
  c: string;
  v: string;
}

/** Real HL candle history. close + USD volume (base vol × close). */
export async function getHlCandles(
  venue: string,
  symbol: string,
  w: Window,
  sinceMs: number,
): Promise<CandlePoint[] | null> {
  const coin = hlCoin(venue, symbol);
  if (!coin) return null;
  const res = await fetch(HL_INFO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "candleSnapshot",
      req: { coin, interval: hlInterval(w), startTime: sinceMs, endTime: Date.now() },
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const candles = (await res.json()) as HlCandle[];
  return candles.map((k) => {
    const close = Number(k.c);
    return { ts: k.t, close, volUsd: Number(k.v) * close };
  });
}

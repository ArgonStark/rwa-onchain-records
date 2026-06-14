// Shared shapes for EWA Onchain Records. Strict TS, no `any`.

export type AssetCategory =
  | "crypto"
  | "equity"
  | "commodity"
  | "forex"
  | "index";

export type SourceStatus = "ok" | "error";

/**
 * One normalized perp market. Every source adapter returns these.
 * Each metric carries `venue` (and `source`) so the UI can attribute it.
 */
export interface PerpMarket {
  venue: string; // human label, e.g. "Hyperliquid", "Hyperliquid HIP-3", "Ostium", "dYdX"
  symbol: string; // underlying ticker, e.g. "BTC", "TSLA", "XAU"
  category: AssetCategory;
  markPx: number; // USD mark/last price
  oiUsd: number; // open interest in USD notional
  vol24hUsd: number | null; // 24h notional volume in USD (null if the venue doesn't expose it)
  funding: number | null; // current funding rate as a fraction (null if unavailable/unverified)
  skew: number | null; // longOI / (longOI + shortOI), 0..1 (null if no long/short split)
  source: string; // endpoint-level attribution
}

/** Per-venue fetch outcome — lets the route degrade gracefully. */
export interface VenueResult {
  venue: string;
  status: SourceStatus;
  markets: PerpMarket[];
  error?: string;
}

export interface VenueStatusSummary {
  venue: string;
  status: SourceStatus;
  count: number;
  error?: string;
}

export interface PerpsResponse {
  asOf: string; // ISO timestamp
  venues: VenueStatusSummary[];
  markets: PerpMarket[]; // aggregated, sorted by oiUsd desc
}

/** A spot tokenized asset we track (static config in data/tokens.ts). */
export interface SpotToken {
  symbol: string; // token ticker, e.g. "PAXG", "TSLAx"
  name: string;
  category: AssetCategory;
  chain: string; // "Ethereum" | "Solana" | ...
  address: string; // ERC-20 contract or SPL mint
  coingeckoId?: string; // for gold tokens
  underlying: string; // real asset symbol for premium, e.g. "XAU", "TSLA"
  tradeVenue: string; // deepest venue label
  tradeUrl: string; // link the UI row points at
}

/** A spot token enriched with live price + premium. */
export interface SpotTokenRow extends SpotToken {
  status: SourceStatus;
  tokenUsdPrice: number | null;
  realSpotPrice: number | null;
  premium: number | null; // tokenUsdPrice / realSpotPrice - 1
  priceSource: string | null; // attribution for tokenUsdPrice
  spotSource: string | null; // attribution for realSpotPrice
  marketOpen: boolean | null; // for equities: meaningful only around market hours
  note?: string;
}

export interface TokensResponse {
  asOf: string;
  tokens: SpotTokenRow[];
}

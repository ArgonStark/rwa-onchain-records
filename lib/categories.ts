import type { AssetCategory } from "./types";

// Symbol -> asset class classifier for mixed venues (Hyperliquid HIP-3, Ostium).
// Native crypto venues (Hyperliquid main perps, dYdX) pass category directly.
// Sets are best-effort from docs/DATA_SOURCES.md; unknown alpha tickers default
// to "equity" (the dominant HIP-3 / Ostium non-crypto class).

const COMMODITY = new Set([
  "GOLD", "XAU", "SILVER", "XAG", "COPPER", "HG", "OIL", "USOIL", "WTI", "CL",
  "BRENT", "BRENTOIL", "NATGAS", "NG", "CORN", "WHEAT", "SOYBEAN", "ALUMINIUM",
  "ALUMINUM", "PLATINUM", "XPT", "PALLADIUM", "XPD", "COCOA", "COFFEE", "SUGAR",
]);

const FOREX = new Set([
  "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "USD", "CNH", "CNY", "MXN",
  "SGD", "HKD", "DXY",
]);

const INDEX = new Set([
  "XYZ100", "SPX", "SPX500", "SP500", "SPY", "NDX", "NAS100", "QQQ", "DJI",
  "US30", "DAX", "DAX40", "NIKKEI", "NIKKEI225", "N225", "FTSE", "FTSE100",
  "HANGSENG", "HSI", "H100", "RUT", "EWJ", "EWT", "EWY", "EWZ", "DRAM", "CBRS",
]);

const CRYPTO = new Set([
  "BTC", "ETH", "SOL", "XRP", "DOGE", "BNB", "AVAX", "LTC", "ADA", "MATIC",
  "ARB", "OP", "LINK", "ATOM", "DOT", "TON", "TRX", "SUI", "APT", "NEAR",
  "DYDX", "APE", "PEPE", "WIF", "BONK", "HYPE",
]);

/**
 * Classify an underlying ticker. Strips any venue prefix (e.g. "xyz:TSLA").
 */
export function classifySymbol(raw: string): AssetCategory {
  const sym = raw.includes(":") ? raw.split(":")[1]! : raw;
  const up = sym.toUpperCase();
  if (COMMODITY.has(up)) return "commodity";
  if (FOREX.has(up)) return "forex";
  if (INDEX.has(up)) return "index";
  if (CRYPTO.has(up)) return "crypto";
  return "equity";
}

/** Strip a venue/dex prefix like "xyz:" from a symbol for display. */
export function stripPrefix(raw: string): string {
  return raw.includes(":") ? raw.split(":")[1]! : raw;
}

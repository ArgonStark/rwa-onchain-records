import { classifySymbol } from "./categories";
import type { AssetCategory } from "./types";

// Asset class for a (venue, symbol). Hyperliquid's main book and dYdX are
// crypto-only; HIP-3 and Ostium are mixed, so classify by symbol there.
export function categoryFor(venue: string, symbol: string): AssetCategory {
  if (venue === "Hyperliquid" || venue === "dYdX") return "crypto";
  return classifySymbol(symbol);
}

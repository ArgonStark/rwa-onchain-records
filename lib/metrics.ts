// Original metric definitions (see CLAUDE.md). Pure functions, no I/O.

/** premium = tokenUsdPrice / realSpotPrice - 1   (gold & equities) */
export function premium(tokenUsdPrice: number, realSpotPrice: number): number {
  return tokenUsdPrice / realSpotPrice - 1;
}

/** basis = perpMarkPrice - spotTokenPrice   (where both legs exist) */
export function basis(perpMarkPrice: number, spotTokenPrice: number): number {
  return perpMarkPrice - spotTokenPrice;
}

/** skew = longOI / (longOI + shortOI)   (0..1, render as % long) */
export function skew(longOi: number, shortOi: number): number | null {
  const total = longOi + shortOi;
  if (total <= 0) return null;
  return longOi / total;
}

// issuance = mints - burns over a window (from Transfer to/from zero addr).
// Deferred to Phase 3 (needs an on-chain indexer).

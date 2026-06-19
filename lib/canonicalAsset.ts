import type { AssetCategory } from "./types";

// CANONICAL-ASSET map — group venue-specific symbols for the SAME underlying so
// we can compare one asset across venues (data nobody aggregates). Venues name
// the same thing differently: gold is XAU on Ostium/Lighter/Aster/Variational,
// GOLD on HIP-3, PAXG as the tokenized variant; WTI is CL/WTI/USOIL; etc.
// Equities + indices + forex use a uniform ticker across venues (NVDA is NVDA
// everywhere), so those group by their own normalized symbol.
//
// Alias members verified against live snapshot symbols across venues 2026-06-19.

export interface CanonicalRef {
  key: string; // stable id, e.g. "gold", "NVDA"
  label: string; // display name
  category: AssetCategory;
}

const ALIAS_GROUPS: { key: string; label: string; category: AssetCategory; symbols: string[] }[] = [
  { key: "gold", label: "Gold", category: "commodity", symbols: ["XAU", "GOLD", "PAXG"] },
  { key: "silver", label: "Silver", category: "commodity", symbols: ["XAG", "SILVER"] },
  { key: "platinum", label: "Platinum", category: "commodity", symbols: ["XPT", "PLATINUM"] },
  { key: "palladium", label: "Palladium", category: "commodity", symbols: ["XPD", "PALLADIUM"] },
  { key: "copper", label: "Copper", category: "commodity", symbols: ["XCU", "COPPER", "HG"] },
  { key: "wti", label: "Crude Oil (WTI)", category: "commodity", symbols: ["CL", "WTI", "USOIL"] },
  { key: "brent", label: "Crude Oil (Brent)", category: "commodity", symbols: ["BRENT", "BRENTOIL", "BZ"] },
  { key: "natgas", label: "Natural Gas", category: "commodity", symbols: ["NATGAS", "NG", "NATURALGAS", "UNG"] },
];

const SYMBOL_TO_REF = new Map<string, CanonicalRef>();
for (const g of ALIAS_GROUPS) {
  for (const s of g.symbols) {
    SYMBOL_TO_REF.set(s, { key: g.key, label: g.label, category: g.category });
  }
}

/**
 * Resolve a (symbol, category) to its canonical asset. Commodities collapse via
 * the alias table; everything else groups by its own uppercased symbol. Category
 * comes from the already-classified snapshot row, so per-venue ambiguity (e.g.
 * dYdX "SPX" = SPX6900 crypto) is handled upstream — callers filter crypto out.
 */
export function canonicalFor(symbol: string, category: AssetCategory): CanonicalRef {
  const up = symbol.toUpperCase();
  const alias = SYMBOL_TO_REF.get(up);
  if (alias) return alias;
  return { key: up, label: up, category };
}

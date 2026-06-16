import type { AssetCategory } from "./types";

// ── Shared asset-class classifier ─────────────────────────────────────
// Every perp source runs its symbols through classify(). Venues name the same
// asset differently (XAU vs GOLD, US500 vs SPX vs SPY, AAPLUSDT vs AAPL), so we
// normalize first, then match against base rulesets, then per-venue overrides.
//
// Sets below are seeded from REAL tickers verified live on the integrated venues
// (Ostium, Hyperliquid HIP-3, Lighter, Aster) — not guessed. Anything unmatched
// defaults to "crypto" (the dominant class on every venue) and is logged once so
// genuinely-new RWA tickers surface for us to add, rather than being faked.

// Spot/forex currency codes — used to detect 6-letter FX pairs (EURUSD, USDJPY…).
const CURRENCY = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "CNH", "CNY", "MXN",
  "SGD", "HKD", "KRW", "SEK", "NOK", "TRY", "ZAR", "INR", "BRL",
]);

const COMMODITY = new Set([
  // metals
  "XAU", "GOLD", "PAXG", "XAG", "SILVER", "XCU", "COPPER", "HG", "XPT",
  "PLATINUM", "XPD", "PALLADIUM",
  // energy
  "CL", "WTI", "USOIL", "OIL", "BRENT", "BRENTOIL", "BZ", "NATGAS", "NG",
  "NATURALGAS", "GASOLINE", "TTF", "UNG", "URANIUM",
  // ags
  "WHEAT", "CORN", "SOYBEAN", "SOYBEANS", "COCOA", "COFFEE", "SUGAR",
  "ALUMINIUM", "ALUMINUM", "NICKEL", "ZINC", "COTTON",
]);

const INDEX = new Set([
  // US
  "SPX", "SPX500", "SP500", "SPY", "US500", "ES", "NDX", "NAS100", "NQ", "QQQ",
  "US100", "DJI", "US30", "YM", "RUT", "IWM", "RTY", "VIX",
  // intl
  "DAX", "DAX40", "GER40", "NIKKEI", "NIKKEI225", "N225", "JP225", "FTSE",
  "FTSE100", "UK100", "HANGSENG", "HSI", "HK50",
  // sector/thematic + bond ETFs (index-like exposure; no dedicated bond class)
  "SOXL", "SOXX", "SMH", "URA", "URNM", "REMX", "BOTZ", "ROBO", "XLE",
  "EWY", "EWT", "EWJ", "EWZ", "HYG", "TLT", "DXY",
  // intl indices
  "KR200", "KR2550", "KOSPI", "KOSPI200", "NIFTY", "NIFTY50", "IBOV",
  "IBOVESPA", "NIK",
  // venue-specific baskets (HIP-3 / Lighter)
  "XYZ100", "DRAM", "H100", "MAGS",
]);

const EQUITY = new Set([
  // US large/mega cap + verified Aster/Lighter STOCK contracts
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA", "NFLX",
  "AMD", "INTC", "MU", "MRVL", "AVGO", "QCOM", "AMAT", "ASML", "TSM", "ARM",
  "DELL", "WDC", "SNDK", "CRDO", "COHR", "AAOI", "AXTI", "LITE", "QNTX",
  "COIN", "MSTR", "HOOD", "CRCL", "PLTR", "CRWD", "CRWV", "NBIS", "IREN",
  "RKLB", "SPCX", "SPACEX", "ASTS", "RIVER", "RIVN", "BMNR", "ONDS", "FLNC",
  "BABA", "PDD", "TENCENT", "XIAOMI", "FUTU", "NIO", "BE", "HIMS", "DKNG",
  "CRM", "NOW", "COST", "HD", "DIS", "CSCO", "UBER", "WMT", "JPM", "V", "BX",
  "BRKB", "BRK", "LLY", "NVO", "EBAY", "NOK", "PAYP", "PYPL", "POPMART", "CAR",
  "GME", "IBM", "ORCL", "TTWO", "BBX", "BIRD", "MINIMAX", "ANTHROPIC", "OPENAI",
  // more verified Ostium/HIP-3 single-name equities
  "SHEL", "XOM", "SMCI", "MP", "GEV", "GLXY", "SBET", "NIO", "ZM", "KIOXIA",
  "SOFTBANK", "USAR",
  // Korea (Lighter uses a USD suffix; Aster uses bare)
  "SKHYNIX", "SKHX", "SKHYNIXUSD", "SAMSUNG", "SMSN", "SAMSUNGUSD",
  "HYUNDAI", "HYUNDAIUSD", "HANMI",
]);

// Per-venue overrides for genuinely ambiguous tickers (same string, different
// asset on different venues). Checked before the base rulesets.
const VENUE_OVERRIDES: Record<string, Record<string, AssetCategory>> = {
  // Tickers that collide with crypto names but are equities on these RWA venues.
  Ostium: {
    CVX: "equity", // Chevron (collides with Convex crypto)
    BB: "equity", // BlackBerry
    CAT: "equity", // Caterpillar
  },
  "Hyperliquid HIP-3": {
    BB: "equity",
    CBRS: "index", // CBRS trades as a basket/index on HIP-3
  },
  Aster: {
    CBRS: "equity", // Aster tags CBRS as a STOCK contract (authoritative subType)
  },
  dYdX: {
    // dYdX's "SPX" is the SPX6900 memecoin (~$0.38), NOT the S&P 500 index —
    // verified against live mark price 2026-06-16.
    SPX: "crypto",
  },
  Variational: {
    SPX: "crypto", // also SPX6900 (~$0.39), not the S&P index
  },
};

// Symbols that fell through to the default. Logged once each so we can review
// whether any are actually RWA we should add to a set above.
const seenUnclassified = new Set<string>();

/** Normalize a raw venue symbol to a bare ticker for matching. */
export function normalizeSymbol(raw: string): string {
  let s = raw.includes(":") ? raw.split(":")[1]! : raw; // strip "xyz:" dex prefix
  s = s.toUpperCase();
  // Strip a trailing perp quote suffix (Aster: AAPLUSDT, BTCUSDT) — but NOT when
  // the whole thing is itself an FX pair (USDJPY) or the base ends in a currency.
  for (const q of ["USDT", "USDC", "USD1", "PERP"]) {
    if (s.length > q.length + 1 && s.endsWith(q)) {
      const base = s.slice(0, -q.length);
      // keep FX pairs intact (e.g. don't turn EURUSD into EUR via "USD")
      if (!(q === "USD1") && isFxPair(s)) break;
      s = base;
      break;
    }
  }
  return s;
}

function isFxPair(s: string): boolean {
  if (s.length !== 6) return false;
  return CURRENCY.has(s.slice(0, 3)) && CURRENCY.has(s.slice(3));
}

/**
 * Classify an underlying ticker into an asset class.
 * @param raw    venue symbol (may carry a dex prefix or quote suffix)
 * @param venue  optional venue label, for per-venue ambiguity overrides
 */
export function classify(raw: string, venue?: string): AssetCategory {
  const sym = normalizeSymbol(raw);

  const override = venue ? VENUE_OVERRIDES[venue]?.[sym] : undefined;
  if (override) return override;

  if (isFxPair(sym)) return "forex";
  if (CURRENCY.has(sym)) return "forex"; // bare DXY-style codes
  if (COMMODITY.has(sym)) return "commodity";
  if (INDEX.has(sym)) return "index";
  if (EQUITY.has(sym)) return "equity";

  if (!seenUnclassified.has(sym)) {
    seenUnclassified.add(sym);
    console.warn(`[classify] "${sym}"${venue ? ` (${venue})` : ""} -> crypto (default; add to a set if this is RWA)`);
  }
  return "crypto";
}

/** Strip a venue/dex prefix like "xyz:" from a symbol for display. */
export function stripPrefix(raw: string): string {
  return raw.includes(":") ? raw.split(":")[1]! : raw;
}

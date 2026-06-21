import { getPool, hasDatabase, ensureSchema } from "./db";
import { getLatestMarkets } from "./analytics";

// Phase 5 — perp-spot basis. basis = perp mark ÷ spot TOKEN price − 1, computed
// where BOTH legs exist (a tokenized spot in token_snapshots + a same-underlying
// perp in perp_snapshots). Positive ⇒ perp richer than the on-chain token.
//
// Pairing is curated per token (verified against live symbols 2026-06-19) AND
// gated by a price-proximity guard: a perp only pairs with a token if its mark
// is within PRICE_TOL of the token price. This is essential, not cosmetic —
// venues reuse names across scales/assets:
//   • "SP500"/some "US500" = the S&P INDEX LEVEL (~7490), 10× the SPY ETF (~746)
//   • "SPX" on Aster/Lighter = the SPX6900 MEMECOIN (~$0.36), not the S&P at all
// Real tokenization basis is sub-1%, so a 10% guard rejects every scale/asset
// mismatch while never dropping a genuine pair.

const PRICE_TOL = 0.1;

interface BasisAsset {
  key: string;
  label: string;
  tokens: string[]; // token_snapshots tickers, in preference order
  perpSymbols: string[]; // candidate perp symbols (uppercased), filtered by price guard
}

const BASIS_ASSETS: BasisAsset[] = [
  { key: "gold", label: "Gold", tokens: ["PAXG", "XAUT"], perpSymbols: ["XAU", "GOLD", "PAXG"] },
  { key: "AAPL", label: "AAPL", tokens: ["AAPLx"], perpSymbols: ["AAPL"] },
  { key: "NVDA", label: "NVDA", tokens: ["NVDAx"], perpSymbols: ["NVDA"] },
  { key: "TSLA", label: "TSLA", tokens: ["TSLAx"], perpSymbols: ["TSLA"] },
  { key: "CRCL", label: "CRCL", tokens: ["CRCLx"], perpSymbols: ["CRCL"] },
  // S&P 500: the SPYx token (~$746 ETF scale). Candidate symbols span the family;
  // the price guard keeps only the ETF-scale contracts and drops index-level / memecoin.
  { key: "sp500", label: "S&P 500", tokens: ["SPYx"], perpSymbols: ["SPY", "US500", "SP500", "SPX500", "SPX"] },
];

export interface BasisItem {
  asset: string;
  basisPct: number; // perpMark / spotToken - 1
  perpVenue: string;
  spotVenue: string; // the spot-token leg (ticker)
  perpMark: number;
  spotPx: number;
  perpSymbol: string;
}
export interface BasisResult {
  status: string;
  asOf: string | null;
  tolerancePct: number;
  items: BasisItem[];
}

export async function getBasis(): Promise<BasisResult> {
  if (!hasDatabase()) {
    return { status: "database unavailable", asOf: null, tolerancePct: PRICE_TOL, items: [] };
  }
  await ensureSchema();

  // latest spot-token slice: ticker -> on-chain token price
  const tokRes = await getPool().query(
    `SELECT ticker, token_px FROM token_snapshots
      WHERE ts = (SELECT max(ts) FROM token_snapshots) AND token_px IS NOT NULL`,
  );
  const tokenPx = new Map<string, number>();
  for (const r of tokRes.rows) tokenPx.set(r.ticker as string, Number(r.token_px));

  const { asOf, markets } = await getLatestMarkets();

  const items: BasisItem[] = [];
  for (const a of BASIS_ASSETS) {
    // spot leg: first configured token that has a live price
    const spotTicker = a.tokens.find((t) => (tokenPx.get(t) ?? 0) > 0);
    if (!spotTicker) continue;
    const spotPx = tokenPx.get(spotTicker)!;

    // candidate perps: name in the set AND mark within the price guard
    const symSet = new Set(a.perpSymbols);
    const candidates = markets.filter(
      (m) =>
        m.markPx !== null &&
        m.markPx > 0 &&
        symSet.has(m.symbol.toUpperCase()) &&
        Math.abs(m.markPx / spotPx - 1) <= PRICE_TOL,
    );
    if (candidates.length === 0) continue;

    // one dot per asset: pair against the deepest (highest-OI) perp leg
    const perp = candidates.reduce((best, m) => (m.oiUsd > best.oiUsd ? m : best), candidates[0]!);
    items.push({
      asset: a.label,
      basisPct: perp.markPx! / spotPx - 1,
      perpVenue: perp.venue,
      spotVenue: spotTicker,
      perpMark: perp.markPx!,
      spotPx,
      perpSymbol: perp.symbol,
    });
  }

  items.sort((x, y) => y.basisPct - x.basisPct);
  return {
    status: items.length ? "ok" : "no in-scale perp/spot pairs at the latest snapshot",
    asOf,
    tolerancePct: PRICE_TOL,
    items,
  };
}

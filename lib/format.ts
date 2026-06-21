// One shared USD formatter for every chart axis, legend, and tooltip.
// Trailing decimal zeros are stripped: $800M not $800.00M, $1.6B not $1.60B.
function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

export function compactUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a === 0) return "$0";
  if (a >= 1e9) return `${sign}$${trimZeros((a / 1e9).toFixed(2))}B`;
  if (a >= 1e6) return `${sign}$${trimZeros((a / 1e6).toFixed(2))}M`;
  if (a >= 1e3) return `${sign}$${trimZeros((a / 1e3).toFixed(2))}K`;
  if (a >= 1) return `${sign}$${a.toFixed(2)}`;
  return `${sign}$${a.toFixed(4)}`;
}

// Precise price for tooltips/legends (keeps cents; axis stays compact).
export function priceUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

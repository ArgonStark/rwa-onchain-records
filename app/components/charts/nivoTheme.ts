import type { PartialTheme } from "@nivo/theming";
import { compactUsd } from "@/lib/format";

// Shared Nivo theme — matches the professional dark palette in globals.css.
// Concrete hex values because Nivo SVG can't read CSS variables.
export { compactUsd } from "@/lib/format";

// Palette constants — kept in sync with globals.css @theme
const INK    = "#0F172A"; // --color-bg
const PANEL  = "#1E293B"; // --color-panel
const LINE   = "#334155"; // --color-line
const FG     = "#F1F5F9"; // --color-fg
const MUTED  = "#94A3B8"; // --color-muted

export const INK_BG    = INK;
export const PANEL_BG  = PANEL;
export const LINE_COLOR = LINE;
export const BONE_TEXT = FG;
export const MUTED_TEXT = MUTED;

export const nivoTheme: PartialTheme = {
  background: "transparent",
  text: {
    fontSize: 11,
    fill: FG,
    fontFamily: "'Inter', system-ui, sans-serif",
    outlineWidth: 0,
  },
  axis: {
    domain: { line: { stroke: LINE, strokeWidth: 1 } },
    ticks: {
      line: { stroke: LINE, strokeWidth: 1 },
      text: { fontSize: 10, fill: MUTED },
    },
    legend: { text: { fontSize: 11, fill: MUTED } },
  },
  grid: { line: { stroke: LINE, strokeWidth: 1, strokeOpacity: 0.4 } },
  legends: { text: { fontSize: 10, fill: MUTED } },
  labels: { text: { fontSize: 10, fill: FG } },
  tooltip: {
    container: {
      background: PANEL,
      color: FG,
      fontSize: 11,
      borderRadius: 8,
      border: `1px solid ${LINE}`,
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      padding: "8px 12px",
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    },
  },
  crosshair: { line: { stroke: MUTED, strokeWidth: 1, strokeOpacity: 0.5 } },
};

// Asset-class colors — updated to match the new design system.
export const CLASS_COLOR: Record<string, string> = {
  equity:    "#34D399", // emerald-400
  commodity: "#FBBF24", // amber-400
  index:     "#A78BFA", // violet-400
  forex:     "#38BDF8", // sky-400
  crypto:    "#64748B", // slate-500
};

export const VENUE_COLOR: Record<string, string> = {
  Hyperliquid:          "#64748B",
  "Hyperliquid HIP-3":  "#FBBF24",
  Ostium:               "#A78BFA",
  dYdX:                 "#38BDF8",
  Lighter:              "#2DD4BF",
  Aster:                "#FB7185",
  Variational:          "#F97316",
};

export const CLASS_ORDER = ["equity", "commodity", "index", "forex", "crypto"];

export function classColor(c: string): string {
  return CLASS_COLOR[c] ?? FG;
}
export function venueColor(v: string): string {
  return VENUE_COLOR[v] ?? FG;
}

export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export function signedPct(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}

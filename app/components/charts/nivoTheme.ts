import type { PartialTheme } from "@nivo/theming";
import { compactUsd } from "@/lib/format";

// Shared Nivo theme for every analytical chart. Matches the dashboard palette
// (ink bg, bone text, low-alpha grid). One source of truth so the Nivo charts
// read as part of the same surface as the lightweight-charts detail panels.
//
// Value labels + tooltips ALWAYS go through compactUsd ($X.XXB/$X.XXM) — no Nivo
// chart renders a raw integer. Re-exported here so chart files import it from one
// place alongside the theme.
export { compactUsd } from "@/lib/format";

// Concrete hex (Nivo SVG text/fills can't read CSS vars) — kept in sync with
// app/globals.css.
const INK = "#07090a"; // --color-bg
const PANEL = "#0d1113"; // --color-panel
const LINE = "#1c2326"; // --color-line
const BONE = "#c9d4cf"; // --color-fg
const MUTED = "#6b7a74"; // --color-muted

export const INK_BG = INK;
export const PANEL_BG = PANEL;
export const LINE_COLOR = LINE;
export const BONE_TEXT = BONE;
export const MUTED_TEXT = MUTED;

export const nivoTheme: PartialTheme = {
  background: "transparent",
  text: { fontSize: 11, fill: BONE, fontFamily: "inherit", outlineWidth: 0 },
  axis: {
    domain: { line: { stroke: LINE, strokeWidth: 1 } },
    ticks: {
      line: { stroke: LINE, strokeWidth: 1 },
      text: { fontSize: 10, fill: MUTED },
    },
    legend: { text: { fontSize: 11, fill: MUTED } },
  },
  grid: { line: { stroke: LINE, strokeWidth: 1, strokeOpacity: 0.35 } },
  legends: { text: { fontSize: 10, fill: MUTED } },
  labels: { text: { fontSize: 10, fill: BONE } },
  tooltip: {
    container: {
      background: PANEL,
      color: BONE,
      fontSize: 11,
      borderRadius: 0,
      border: `1px solid ${LINE}`,
      boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
      padding: "6px 8px",
    },
  },
  crosshair: { line: { stroke: BONE, strokeWidth: 1, strokeOpacity: 0.35 } },
};

// Asset-class colors — equity=green, commodity=amber, index=purple, forex=cyan,
// crypto=neutral. Identical to AggregatePanel so the whole dashboard agrees.
export const CLASS_COLOR: Record<string, string> = {
  equity: "#46e39b",
  commodity: "#f5b13d",
  index: "#a78bfa",
  forex: "#38bdf8",
  crypto: "#8b9690",
};

export const VENUE_COLOR: Record<string, string> = {
  Hyperliquid: "#8b9690",
  "Hyperliquid HIP-3": "#f5b13d",
  Ostium: "#a78bfa",
  dYdX: "#38bdf8",
  Lighter: "#2dd4bf",
  Aster: "#fb7185",
  Variational: "#94a3b8",
};

export const CLASS_ORDER = ["equity", "commodity", "index", "forex", "crypto"];

export function classColor(c: string): string {
  return CLASS_COLOR[c] ?? BONE;
}
export function venueColor(v: string): string {
  return VENUE_COLOR[v] ?? BONE;
}

/** Reduced-motion-safe animate flag — pass `animate={!reducedMotion()}`. */
export function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

// compactUsd handles >= $1; a few charts (funding %, basis %) need a percent
// label. Kept here so charts share one signed-percent formatter too.
export function signedPct(n: number, digits = 3): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;
}

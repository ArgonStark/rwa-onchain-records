"use client";

import { type MouseEvent as RMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartCard, CardToggle, CardEmpty, ChartLegend } from "./ChartCard";
import {
  classColor,
  compactUsd,
  reducedMotion,
  CLASS_COLOR,
  CLASS_ORDER,
} from "./nivoTheme";

// ── Data shapes ───────────────────────────────────────────────────────
interface MarketRow {
  venue: string;
  symbol: string;
  category: string;
  oiUsd: number;
  vol24h: number | null;
}
interface Resp {
  hasDatabase: boolean;
  asOf: string | null;
  markets: MarketRow[];
}

type Kind = "root" | "venue" | "class" | "leaf" | "group";
interface Node {
  id: string;
  label: string;
  kind: Kind;
  value: number;
  color: string; // class color (class/leaf) or container surface (venue/group)
  venue?: string;
  klass?: string;
  classTotal?: number; // for leaf tooltips: % of class
  venueTotal?: number; // for leaf tooltips: % of venue
  count?: number; // group: number of folded venues
  children?: Node[];
}

// ── Palette (kept in sync with globals.css @theme) ────────────────────
const INK = "#0F172A"; // bg
const SURFACE = "#263348"; // container fill
const LINE = "#334155";
const LINE_STRONG = "#475569";
const BONE = "#F1F5F9";
const MUTED = "#94A3B8";

// ── Layout constants ──────────────────────────────────────────────────
const CAP_PER_GROUP = 10; // top markets per venue→class, rest → "+N more"
const SMALL_SHARE = 0.06; // a venue under this share of the chart is "small"
const VENUE_HEAD = 22; // reserved header strip for a venue container
const CLASS_HEAD = 15; // reserved header strip for a class container
const GAP = 1.5; // visual gap between tiles (bg shows through)
const RADIUS = 3;

// leaf label tiers (min tile px to show each)
const T2_W = 52, T2_H = 34; // symbol + value
const T1_W = 34, T1_H = 17; // symbol only

interface Rect { x: number; y: number; w: number; h: number; }
interface Cell extends Rect { node: Node; }

// ── Relative luminance → pick ink/bone text for contrast on any tile ──
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const c = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(c(0)) + 0.7152 * lin(c(2)) + 0.0722 * lin(c(4));
}
function inkOrBone(hex: string): string {
  return luminance(hex) > 0.34 ? INK : BONE;
}

// ── Squarified treemap (typed, dependency-free) ───────────────────────
function worstRatio(areas: number[], side: number): number {
  let sum = 0, max = -Infinity, min = Infinity;
  for (const a of areas) { sum += a; if (a > max) max = a; if (a < min) min = a; }
  const s2 = sum * sum, side2 = side * side;
  return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

function squarify(children: Node[], rect: Rect): Cell[] {
  const out: Cell[] = [];
  const total = children.reduce((s, c) => s + c.value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out;
  const scale = (rect.w * rect.h) / total;
  const items = children
    .map((node) => ({ area: Math.max(node.value * scale, 0), node }))
    .sort((a, b) => b.area - a.area);

  let r = { ...rect };
  let i = 0;
  while (i < items.length) {
    const side = Math.min(r.w, r.h);
    const row: { area: number; node: Node }[] = [];
    let best = Infinity;
    while (i < items.length) {
      const next = [...row.map((x) => x.area), items[i]!.area];
      const w = worstRatio(next, side);
      if (row.length && w > best) break;
      row.push(items[i]!);
      best = w;
      i++;
    }
    const rowArea = row.reduce((s, x) => s + x.area, 0);
    if (r.w >= r.h) {
      const dw = rowArea / r.h;
      let y = r.y;
      for (const x of row) {
        const h = x.area / dw;
        out.push({ x: r.x, y, w: dw, h, node: x.node });
        y += h;
      }
      r = { x: r.x + dw, y: r.y, w: r.w - dw, h: r.h };
    } else {
      const dh = rowArea / r.w;
      let x0 = r.x;
      for (const x of row) {
        const w = x.area / dh;
        out.push({ x: x0, y: r.y, w, h: dh, node: x.node });
        x0 += w;
      }
      r = { x: r.x, y: r.y + dh, w: r.w, h: r.h - dh };
    }
  }
  return out;
}

const venueHeaderVisible = (w: number, h: number) => h > 48 && w > 64;
const classHeaderVisible = (w: number, h: number) => h > 40 && w > 52;

// Recursively lay out the tree, reserving header strips so children never
// render under a parent label. Parents are pushed before children, so leaves
// paint on top.
function computeCells(root: Node, W: number, H: number): Cell[] {
  const cells: Cell[] = [];
  const recurse = (node: Node, r: Rect) => {
    if (!node.children?.length) return;
    let headH = 0, padX = 0, padB = 0;
    if (node.kind === "venue") {
      headH = venueHeaderVisible(r.w, r.h) ? VENUE_HEAD : 2;
      padX = 4; padB = 4;
    } else if (node.kind === "class") {
      headH = classHeaderVisible(r.w, r.h) ? CLASS_HEAD : 0;
      padX = 2; padB = 2;
    }
    const inner: Rect = { x: r.x + padX, y: r.y + headH, w: r.w - 2 * padX, h: r.h - headH - padB };
    if (inner.w <= 1 || inner.h <= 1) return;
    for (const c of squarify(node.children, inner)) {
      cells.push(c);
      recurse(c.node, c);
    }
  };
  recurse(root, { x: 0, y: 0, w: W, h: H });
  return cells;
}

// ── Build venue → class → market tree (data/nesting unchanged) ────────
function buildVenues(markets: MarketRow[], metric: "oi" | "vol", rwaOnly: boolean): Node[] {
  const val = (m: MarketRow) => (metric === "vol" ? m.vol24h ?? 0 : m.oiUsd);
  const rows = markets.filter((m) => (rwaOnly ? m.category !== "crypto" : true) && val(m) > 0);

  const byVenue = new Map<string, Map<string, MarketRow[]>>();
  for (const m of rows) {
    let byClass = byVenue.get(m.venue);
    if (!byClass) { byClass = new Map(); byVenue.set(m.venue, byClass); }
    const arr = byClass.get(m.category) ?? [];
    if (arr.length === 0) byClass.set(m.category, arr);
    arr.push(m);
  }

  const venues: Node[] = [];
  for (const [venue, byClass] of byVenue) {
    const venueTotal = [...byClass.values()].flat().reduce((s, m) => s + val(m), 0);
    const classNodes: Node[] = [];
    // order classes by our canonical class order for stable color reading
    const classes = [...byClass.entries()].sort(
      (a, b) => CLASS_ORDER.indexOf(a[0]) - CLASS_ORDER.indexOf(b[0]),
    );
    for (const [klass, ms] of classes) {
      const bySym = new Map<string, number>();
      for (const m of ms) bySym.set(m.symbol, (bySym.get(m.symbol) ?? 0) + val(m));
      const sorted = [...bySym.entries()].map(([symbol, v]) => ({ symbol, v })).sort((a, b) => b.v - a.v);
      const classTotal = sorted.reduce((s, x) => s + x.v, 0);
      const top = sorted.slice(0, CAP_PER_GROUP);
      const rest = sorted.slice(CAP_PER_GROUP);
      const leaves: Node[] = top.map((s) => ({
        id: `${venue}/${klass}/${s.symbol}`,
        label: s.symbol,
        kind: "leaf" as const,
        value: s.v,
        color: classColor(klass),
        venue, klass, classTotal, venueTotal,
      }));
      if (rest.length) {
        leaves.push({
          id: `${venue}/${klass}/others`,
          label: `+${rest.length} more`,
          kind: "leaf",
          value: rest.reduce((s, r) => s + r.v, 0),
          color: classColor(klass),
          venue, klass, classTotal, venueTotal,
        });
      }
      if (leaves.length) {
        classNodes.push({
          id: `${venue}/${klass}`,
          label: klass,
          kind: "class",
          value: classTotal,
          color: classColor(klass),
          venue, klass,
          children: leaves,
        });
      }
    }
    if (classNodes.length) {
      venues.push({ id: venue, label: venue, kind: "venue", value: venueTotal, color: SURFACE, venue, children: classNodes });
    }
  }
  return venues.sort((a, b) => b.value - a.value);
}

// Apply the focus/drill state and small-venue grouping to get the render root.
function rootFor(venues: Node[], focus: string | null): { root: Node; crumb: string | null } {
  const base = (children: Node[]): Node => ({ id: "root", label: "all", kind: "root", value: 0, color: "transparent", children });

  if (focus && focus !== "__small__") {
    const v = venues.find((x) => x.id === focus);
    return { root: base(v?.children ?? []), crumb: v?.label ?? focus };
  }

  const grand = venues.reduce((s, v) => s + v.value, 0) || 1;
  const big: Node[] = [], small: Node[] = [];
  for (const v of venues) (v.value / grand < SMALL_SHARE ? small : big).push(v);

  if (focus === "__small__") {
    return { root: base(small.length ? small : venues), crumb: `${small.length} smaller venues` };
  }

  // root view: big venues + a single "+N venues" summary tile (drill-in)
  if (small.length >= 2 && big.length >= 1) {
    const groupVal = small.reduce((s, v) => s + v.value, 0);
    const group: Node = {
      id: "__small__", label: `+${small.length} venues`, kind: "group",
      value: groupVal, color: SURFACE, count: small.length,
    };
    return { root: base([...big, group]), crumb: null };
  }
  return { root: base(venues), crumb: null };
}

// truncate a symbol to fit a tile width, with ellipsis
function fit(text: string, w: number, px: number): string {
  const max = Math.floor((w - 8) / (px * 0.62));
  if (max >= text.length) return text;
  if (max <= 1) return "";
  return text.slice(0, max - 1) + "…";
}

interface TipState { x: number; y: number; node: Node; }

export function OiTreemap() {
  const [data, setData] = useState<Resp | null>(null);
  const [metric, setMetric] = useState<"oi" | "vol">("oi");
  const [rwaOnly, setRwaOnly] = useState(true);
  const [focus, setFocus] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/treemap")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Callback ref: attach the observer exactly when the measured box mounts
  // (it only mounts after data arrives, so a mount-time effect would miss it).
  const setBox = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
  }, []);

  const venues = useMemo(
    () => (data ? buildVenues(data.markets, metric, rwaOnly) : []),
    [data, metric, rwaOnly],
  );
  // reset drill-in when the filters change the venue set
  useEffect(() => { setFocus(null); }, [metric, rwaOnly]);

  const { root, crumb } = useMemo(() => rootFor(venues, focus), [venues, focus]);
  const cells = useMemo(
    () => (size.w > 0 && size.h > 0 ? computeCells(root, size.w, size.h) : []),
    [root, size.w, size.h],
  );
  const hasData = (root.children?.length ?? 0) > 0;
  const motion = !reducedMotion();
  const trans = motion ? "opacity 150ms, filter 150ms, stroke 150ms" : undefined;

  const valLabel = metric === "oi" ? "OI" : "24h vol";

  const onEnter = (e: RMouseEvent, n: Node) => {
    if (n.kind === "leaf" || n.kind === "group") {
      setHovered(n.id);
      setTip({ x: e.clientX, y: e.clientY, node: n });
    }
  };

  return (
    <ChartCard
      title="OI / VOLUME TREEMAP"
      badge={`${metric === "oi" ? "open interest" : "24h volume"} · venue → class → market`}
      desc="Every tracked market sized by value, nested by venue then asset class. Tiles colored by class; click a venue (or the “+N venues” tile) to zoom in."
      right={
        <>
          <CardToggle on={metric === "oi"} onClick={() => setMetric("oi")}>OI</CardToggle>
          <CardToggle on={metric === "vol"} onClick={() => setMetric("vol")}>24h vol</CardToggle>
          <CardToggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>RWA only</CardToggle>
        </>
      }
      caption={`top ${CAP_PER_GROUP} markets per venue+class shown; the rest folded into “+N more”. ${
        data?.asOf ? `as of ${new Date(data.asOf).toLocaleString("en-US", { hour12: false })}` : ""
      }`}
      source="source: RWA perp_snapshots (latest slice)"
    >
      <ChartLegend
        items={CLASS_ORDER.filter((c) => !(rwaOnly && c === "crypto")).map((c) => ({
          label: c,
          color: CLASS_COLOR[c] ?? MUTED,
        }))}
      />

      {/* breadcrumb when drilled in */}
      <div className="mb-1 flex items-center gap-1.5 text-[11px]" aria-live="polite">
        <button
          type="button"
          onClick={() => setFocus(null)}
          className={`cursor-pointer ${focus ? "text-[var(--color-accent)] hover:underline" : "text-[var(--color-subtle)] cursor-default"}`}
          disabled={!focus}
        >
          all venues
        </button>
        {crumb && (
          <>
            <span className="text-[var(--color-subtle)]">›</span>
            <span className="font-medium text-[var(--color-fg)]">{crumb}</span>
          </>
        )}
      </div>

      {!data ? (
        <CardEmpty msg="loading…" />
      ) : !hasData ? (
        <CardEmpty msg={metric === "vol" ? "no 24h volume reported for this filter" : "no markets for this filter"} />
      ) : (
        <div
          ref={setBox}
          className="relative h-[260px] w-full sm:h-[380px] md:h-[420px]"
          onMouseLeave={() => { setHovered(null); setTip(null); }}
          role="figure"
          aria-label={`Treemap of ${valLabel} by venue and asset class`}
        >
          {size.w > 0 && (
            <svg width={size.w} height={size.h} className="block">
              {cells.map((c) => {
                const n = c.node;
                const x = c.x + GAP, y = c.y + GAP;
                const w = Math.max(0, c.w - 2 * GAP), h = Math.max(0, c.h - 2 * GAP);
                if (w <= 0 || h <= 0) return null;
                const isHover = hovered === n.id;

                // ── venue container ─────────────────────────────────
                if (n.kind === "venue") {
                  const showHead = venueHeaderVisible(c.w, c.h);
                  return (
                    <g key={n.id}>
                      <rect x={x} y={y} width={w} height={h} rx={RADIUS} fill={SURFACE} stroke={LINE} strokeWidth={1} />
                      {showHead && (
                        <>
                          <line x1={x} y1={y + VENUE_HEAD - 4} x2={x + w} y2={y + VENUE_HEAD - 4} stroke={LINE_STRONG} strokeWidth={1} />
                          <text
                            x={x + 7} y={y + 14}
                            fill={BONE} fontSize={10} fontWeight={600}
                            style={{ letterSpacing: "0.04em", cursor: "pointer", textTransform: "uppercase" }}
                            onClick={() => setFocus(n.id)}
                          >
                            {fit(n.label.toUpperCase(), w - 40, 10)}
                          </text>
                          <text x={x + w - 7} y={y + 14} textAnchor="end" fill={MUTED} fontSize={9} fontFamily="'JetBrains Mono', monospace">
                            {compactUsd(n.value)}
                          </text>
                        </>
                      )}
                    </g>
                  );
                }

                // ── class container ─────────────────────────────────
                if (n.kind === "class") {
                  const showHead = classHeaderVisible(c.w, c.h);
                  if (!showHead) return null; // leaves carry the color; header would clip
                  return (
                    <g key={n.id}>
                      <rect x={x} y={y + 2} width={3} height={CLASS_HEAD - 4} rx={1.5} fill={n.color} />
                      <text x={x + 9} y={y + CLASS_HEAD - 5} fill={MUTED} fontSize={9.5} style={{ textTransform: "capitalize" }}>
                        {fit(n.label, w - 12, 9.5)}
                      </text>
                    </g>
                  );
                }

                // ── "+N venues" group summary tile (drill-in) ───────
                if (n.kind === "group") {
                  return (
                    <g
                      key={n.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => setFocus("__small__")}
                      onMouseEnter={(e) => onEnter(e, n)}
                      onMouseMove={(e) => isHover && setTip({ x: e.clientX, y: e.clientY, node: n })}
                      onMouseLeave={() => { setHovered(null); setTip(null); }}
                    >
                      <rect
                        x={x} y={y} width={w} height={h} rx={RADIUS}
                        fill={SURFACE} stroke={isHover ? LINE_STRONG : LINE}
                        strokeWidth={isHover ? 1.5 : 1}
                        strokeDasharray="3 3"
                        style={{ transition: trans }}
                      />
                      {w > 60 && h > 30 && (
                        <>
                          <text x={x + w / 2} y={y + h / 2 - 3} textAnchor="middle" fill={BONE} fontSize={12} fontWeight={600}>
                            +{n.count} venues
                          </text>
                          <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fill={MUTED} fontSize={10} fontFamily="'JetBrains Mono', monospace">
                            {compactUsd(n.value)} · zoom in
                          </text>
                        </>
                      )}
                    </g>
                  );
                }

                // ── leaf market tile ────────────────────────────────
                const txt = inkOrBone(n.color);
                const big = w >= T2_W && h >= T2_H;
                const med = w >= T1_W && h >= T1_H;
                const sym = med ? fit(n.label, w, big ? 12 : 11) : "";
                return (
                  <g
                    key={n.id}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => onEnter(e, n)}
                    onMouseMove={(e) => isHover && setTip({ x: e.clientX, y: e.clientY, node: n })}
                    onMouseLeave={() => { setHovered(null); setTip(null); }}
                    onClick={(e) => onEnter(e, n)}
                  >
                    <rect
                      x={x} y={y} width={w} height={h} rx={RADIUS}
                      fill={n.color}
                      fillOpacity={isHover ? 1 : 0.86}
                      stroke={isHover ? BONE : "transparent"}
                      strokeWidth={isHover ? 1.5 : 0}
                      style={{ transition: trans, filter: isHover ? "brightness(1.12)" : undefined }}
                    />
                    {big ? (
                      <>
                        <text x={x + 6} y={y + 15} fill={txt} fontSize={12} fontWeight={600}>{sym}</text>
                        <text x={x + 6} y={y + 29} fill={txt} fillOpacity={0.72} fontSize={10} fontFamily="'JetBrains Mono', monospace">
                          {compactUsd(n.value)}
                        </text>
                      </>
                    ) : med ? (
                      <text x={x + 5} y={y + h / 2 + 4} fill={txt} fontSize={11} fontWeight={600}>{sym}</text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          )}

          {/* hover/tap tooltip */}
          {tip && (
            <div
              className="pointer-events-none fixed z-50 rounded-md border px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{
                left: tip.x + 12, top: tip.y + 12,
                background: "#1E293B", borderColor: LINE, color: BONE,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              }}
            >
              {tip.node.kind === "group" ? (
                <>
                  <div className="font-semibold">+{tip.node.count} smaller venues</div>
                  <div style={{ color: MUTED }}>{valLabel}: {compactUsd(tip.node.value)} · click to zoom</div>
                </>
              ) : (
                <>
                  <div className="font-semibold">{tip.node.label}</div>
                  <div style={{ color: MUTED }}>{tip.node.venue} · {tip.node.klass}</div>
                  <div>{valLabel}: {compactUsd(tip.node.value)}</div>
                  {tip.node.classTotal ? (
                    <div style={{ color: MUTED }}>
                      {((tip.node.value / tip.node.classTotal) * 100).toFixed(1)}% of {tip.node.klass}
                      {tip.node.venueTotal
                        ? ` · ${((tip.node.value / tip.node.venueTotal) * 100).toFixed(1)}% of ${tip.node.venue}`
                        : ""}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          )}

          {/* screen-reader data table (treemaps are not natively accessible) */}
          <table className="sr-only">
            <caption>{valLabel} by venue, asset class and market</caption>
            <thead><tr><th>Venue</th><th>Class</th><th>Market</th><th>{valLabel} (USD)</th></tr></thead>
            <tbody>
              {venues.flatMap((v) =>
                (v.children ?? []).flatMap((cl) =>
                  (cl.children ?? []).map((lf) => (
                    <tr key={lf.id}><td>{v.label}</td><td>{cl.label}</td><td>{lf.label}</td><td>{compactUsd(lf.value)}</td></tr>
                  )),
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

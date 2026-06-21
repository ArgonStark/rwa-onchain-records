"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesType,
  type Time,
  type LogicalRange,
} from "lightweight-charts";
import { compactUsd } from "@/lib/format";

// Professional dark palette (canvas needs concrete colors — mirrors globals.css @theme).
const THEME = {
  bg:        "#0F172A", // --color-bg
  text:      "#F1F5F9", // --color-fg
  muted:     "#94A3B8", // --color-muted
  grid:      "rgba(51,65,85,0.4)", // --color-line with alpha
  crosshair: "#475569", // --color-line-strong
  label:     "#1E293B", // --color-panel (crosshair label bg)
};

// #rrggbb -> rgba() with alpha, for area-fill gradients derived from a line color.
function rgba(hex: string, a: number): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export interface ChartSeries {
  id: string;
  label: string;
  type: "line" | "histogram";
  // time = epoch SECONDS (UTC), ascending, unique.
  data: { time: number; value: number }[];
  color: string;
  pane: number; // 0 = top
  overlay?: boolean; // histogram on its own overlay scale (volume under price)
  area?: boolean; // single-metric line -> render as area with a gradient fill
  format: (n: number) => string;
  approx?: boolean;
}

interface Props {
  series: ChartSeries[];
  // Changing fitKey (window/symbol) resets the view. Same fitKey with new data
  // does an incremental series.update() so zoom/pan is preserved.
  fitKey: string;
  // Time-axis style: HH:MM for intraday ranges, MMM DD for multi-day. One format
  // per axis — never mixed.
  timeAxis: "intraday" | "daily";
  // Explicit window {from,to} in epoch SECONDS. When set, the chart opens on
  // exactly this range (instead of fitContent), so a short-history series renders
  // an empty gap on the left rather than rescaling to its own extent.
  timeRange?: { from: number; to: number };
  // Shared bar backbone (epoch SECONDS, ascending) used instead of the internal
  // grid. Sibling charts that pass the SAME domain get identical logical bar
  // indices, so logical-range + crosshair sync line up exactly.
  domain?: number[];
  // Charts sharing a syncId mirror each other's visible logical range and
  // crosshair (the official lightweight-charts cross-chart sync pattern).
  syncId?: string;
  // false → static chart: no pan/zoom/scroll, edges fixed. Default true.
  interactive?: boolean;
  paneStretch?: number[];
  height?: number;
  showLegend?: boolean;
}

// One member per chart in a sync group. Siblings drive each other's logical range
// (pan/zoom) and crosshair (vertical line) through these.
interface SyncMember {
  applyLogicalRange: (r: LogicalRange) => void;
  syncCrosshairToTime: (t: number) => void;
  clearCrosshair: () => void;
}
const syncGroups = new Map<string, Set<SyncMember>>();

// Value at the data point nearest-at-or-before t. Returns null when t falls
// OUTSIDE the real data span (with a small tolerance) — so a synced crosshair
// over a region a series doesn't cover (e.g. OI before we started recording)
// shows nothing rather than a misleading clamped edge value.
function nearestValue(
  data: { time: number; value: number }[],
  t: number,
): number | null {
  if (data.length === 0) return null;
  const first = data[0]!.time;
  const last = data[data.length - 1]!.time;
  // tolerance = one median-ish gap so the boundary point still registers
  const tol = data.length > 1 ? (last - first) / (data.length - 1) : 86400;
  if (t < first - tol || t > last + tol) return null;
  if (t <= first) return data[0]!.value;
  if (t >= last) return data[data.length - 1]!.value;
  let lo = 0;
  let hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (data[mid]!.time <= t) lo = mid;
    else hi = mid - 1;
  }
  return data[lo]!.value;
}

const fmtIntraday = (t: number): string =>
  new Date(t * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
const fmtDaily = (t: number): string =>
  new Date(t * 1000).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export function InteractiveChart({
  series,
  fitKey,
  timeAxis,
  timeRange,
  domain,
  syncId,
  interactive = true,
  paneStretch,
  height = 320,
  showLegend = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const lastFitKey = useRef<string>("");
  const specRef = useRef<ChartSeries[]>(series);
  specRef.current = series;
  const timeAxisRef = useRef(timeAxis);
  timeAxisRef.current = timeAxis;
  const timeRangeRef = useRef(timeRange);
  timeRangeRef.current = timeRange;
  const domainRef = useRef(domain);
  domainRef.current = domain;
  // True while WE are programmatically driving the crosshair from a sibling, so
  // the resulting crosshairMove doesn't render a second tooltip or echo back.
  const fromSync = useRef(false);

  // Build chart once (rebuilt only if syncId / interactivity changes).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const chart = createChart(el, {
      layout: {
        background: { color: THEME.bg },
        textColor: THEME.muted,
        fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace",
        fontSize: 10,
        attributionLogo: false,
        panes: { separatorColor: THEME.grid, separatorHoverColor: THEME.crosshair },
      },
      // One shared $ formatter for every price scale (price, volume, OI).
      localization: {
        priceFormatter: compactUsd,
        timeFormatter: (t: Time) =>
          new Date((t as number) * 1000).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "UTC",
          }),
      },
      // Cleaner look: drop vertical grid lines, keep faint horizontals only.
      grid: {
        vertLines: { visible: false },
        horzLines: { color: THEME.grid },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: THEME.crosshair, width: 1, style: LineStyle.Solid, labelBackgroundColor: THEME.label },
        horzLine: { color: THEME.crosshair, width: 1, style: LineStyle.Dotted, labelBackgroundColor: THEME.label },
      },
      rightPriceScale: {
        borderVisible: false,
        entireTextOnly: true,
        scaleMargins: { top: 0.14, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: interactive ? 4 : 0,
        fixLeftEdge: !interactive,
        fixRightEdge: !interactive,
        lockVisibleTimeRangeOnResize: true,
        // Deduplicate day-mode tick labels: multiple snapshots on the same
        // calendar day each trigger a tick, so we suppress repeat labels by
        // tracking the last label rendered left-to-right within one pass.
        tickMarkFormatter: (() => {
          let lastLabel = "";
          return (t: Time) => {
            if (timeAxisRef.current === "intraday") {
              lastLabel = "";
              return fmtIntraday(t as number);
            }
            const label = fmtDaily(t as number);
            if (label === lastLabel) return "";
            lastLabel = label;
            return label;
          };
        })(),
      },
      handleScroll: interactive
        ? { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false }
        : false,
      handleScale: interactive
        ? { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
        : false,
      kineticScroll: { touch: interactive && !reduce, mouse: false },
      autoSize: true,
    });
    chartRef.current = chart;

    // DIY tooltip (LWC ships none). Lists every series value at time t.
    const renderTooltip = (t: number, x: number, y: number) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      const when = new Date(t * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      });
      const rows = specRef.current
        .map((s) => {
          const v = nearestValue(s.data, t);
          if (v === null) return "";
          return `<div style="display:flex;justify-content:space-between;gap:12px">
            <span style="color:${s.color}">${s.label}${s.approx ? " ≈" : ""}</span>
            <span style="color:${THEME.text}">${s.format(v)}</span></div>`;
        })
        .join("");
      if (!rows) {
        tip.style.display = "none";
        return;
      }
      tip.innerHTML = `<div style="color:${THEME.muted};margin-bottom:3px">${when} UTC</div>${rows}`;
      tip.style.display = "block";
      const cw = el.clientWidth;
      tip.style.left = `${Math.max(4, Math.min(x + 14, cw - 160))}px`;
      tip.style.top = `${Math.max(4, y)}px`;
    };
    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };

    const ts = chart.timeScale();

    // This chart's hooks for siblings (official cross-chart sync pattern). The
    // crosshair line is mirrored; the text tooltip is NOT — it shows only on the
    // chart the user is actually hovering, so there's never a second tooltip.
    const selfMember: SyncMember = {
      applyLogicalRange: (r) => ts.setVisibleLogicalRange(r),
      syncCrosshairToTime: (t) => {
        const first = specRef.current[0];
        const api = first ? seriesRef.current.get(first.id) : undefined;
        const v = first ? nearestValue(first.data, t) : null;
        fromSync.current = true;
        if (api && v !== null) {
          try {
            chart.setCrosshairPosition(v, t as Time, api);
          } catch {
            /* time outside this chart's bars — ignore */
          }
        } else {
          chart.clearCrosshairPosition();
        }
        fromSync.current = false;
      },
      clearCrosshair: () => {
        fromSync.current = true;
        chart.clearCrosshairPosition();
        hideTooltip();
        fromSync.current = false;
      },
    };

    if (syncId) {
      let group = syncGroups.get(syncId);
      if (!group) {
        group = new Set();
        syncGroups.set(syncId, group);
      }
      group.add(selfMember);
    }
    const siblings = () =>
      syncId ? [...(syncGroups.get(syncId) ?? [])].filter((m) => m !== selfMember) : [];

    chart.subscribeCrosshairMove((param) => {
      if (fromSync.current) return; // programmatic (sibling-driven) — ignore
      if (!param.point || param.time === undefined) {
        hideTooltip();
        for (const m of siblings()) m.clearCrosshair();
        return;
      }
      const t = param.time as number;
      renderTooltip(t, param.point.x, param.point.y - 10);
      for (const m of siblings()) m.syncCrosshairToTime(t);
    });

    // Logical-range sync: programmatic setVisibleLogicalRange does NOT re-emit
    // this event, so no feedback-loop guard is needed (per the official sample).
    if (syncId) {
      ts.subscribeVisibleLogicalRangeChange((range) => {
        if (!range) return;
        for (const m of siblings()) m.applyLogicalRange(range);
      });
    }

    return () => {
      if (syncId) {
        const group = syncGroups.get(syncId);
        group?.delete(selfMember);
        if (group && group.size === 0) syncGroups.delete(syncId);
      }
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      lastFitKey.current = "";
    };
  }, [syncId, interactive]);

  // Create/update series + data.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove series no longer present (toggles class<->venue, RWA-only filter).
    const ids = new Set(series.map((s) => s.id));
    for (const [id, api] of seriesRef.current) {
      if (!ids.has(id)) {
        chart.removeSeries(api);
        seriesRef.current.delete(id);
      }
    }

    for (const s of series) {
      let api = seriesRef.current.get(s.id);
      if (!api) {
        if (s.type === "histogram") {
          api = chart.addSeries(
            HistogramSeries,
            {
              color: s.color,
              priceFormat: { type: "custom", formatter: compactUsd, minMove: 1 },
              priceScaleId: s.overlay ? `${s.id}-ov` : undefined,
              lastValueVisible: false,
              priceLineVisible: false,
            },
            s.pane,
          );
          if (s.overlay) {
            api.priceScale().applyOptions({ scaleMargins: { top: 0.74, bottom: 0 } });
          }
        } else if (s.area) {
          // Single-metric line as an area with a subtle top→bottom gradient.
          api = chart.addSeries(
            AreaSeries,
            {
              lineColor: s.color,
              lineWidth: 2,
              topColor: rgba(s.color, 0.26),
              bottomColor: rgba(s.color, 0.02),
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 3,
              crosshairMarkerBorderColor: s.color,
              crosshairMarkerBackgroundColor: THEME.bg,
            },
            s.pane,
          );
        } else {
          api = chart.addSeries(
            LineSeries,
            {
              color: s.color,
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 3,
              crosshairMarkerBorderColor: s.color,
              crosshairMarkerBackgroundColor: THEME.bg,
            },
            s.pane,
          );
        }
        seriesRef.current.set(s.id, api);
      }
    }

    // LWC needs strictly-ascending unique times (seconds). Each series is laid on
    // a shared backbone of WHITESPACE bars (the `domain` prop, else an even grid
    // over `timeRange`) so (a) every synced chart has identical logical bar
    // indices and (b) a short-history series gap-fills to the window edge instead
    // of rescaling to its own extent.
    const GRID = 64;
    const data = (s: ChartSeries) => {
      const tr = timeRangeRef.current;
      const dom = domainRef.current;
      const merged = new Map<number, number | undefined>();
      if (dom && dom.length) {
        for (const t of dom) merged.set(t, undefined);
      } else if (tr) {
        const step = (tr.to - tr.from) / GRID;
        for (let i = 0; i <= GRID; i++) merged.set(Math.round(tr.from + i * step), undefined);
      }
      for (const d of s.data) {
        const t = d.time;
        if (tr && (t <= tr.from || t >= tr.to)) continue; // clip to window
        merged.set(t, d.value); // real value overrides a backbone slot
      }
      return [...merged.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([time, value]) =>
          value === undefined
            ? { time: time as UTCTimestamp }
            : { time: time as UTCTimestamp, value },
        );
    };

    if (fitKey !== lastFitKey.current) {
      for (const s of series) seriesRef.current.get(s.id)?.setData(data(s));
      const tr = timeRangeRef.current;
      if (tr) {
        chart.timeScale().setVisibleRange({ from: tr.from as Time, to: tr.to as Time });
      } else {
        chart.timeScale().fitContent();
      }
      lastFitKey.current = fitKey;
    } else {
      // Live tick: update only the latest point so zoom/pan is preserved.
      for (const s of series) {
        const api = seriesRef.current.get(s.id);
        if (!api || s.data.length === 0) continue;
        const last = s.data[s.data.length - 1]!;
        try {
          api.update({ time: last.time as UTCTimestamp, value: last.value });
        } catch {
          api.setData(data(s));
        }
      }
    }

    if (paneStretch) {
      const panes = chart.panes();
      paneStretch.forEach((f, i) => panes[i]?.setStretchFactor(f));
    }

    // Built-in legend (latest values) replaces the on-axis value tags.
    if (legendRef.current) {
      legendRef.current.innerHTML = showLegend
        ? series
            .map((s) => {
              const last = s.data[s.data.length - 1]?.value;
              const v = last === undefined ? "" : s.format(last);
              return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px">
                <span style="width:8px;height:8px;border-radius:9999px;background:${s.color};display:inline-block"></span>
                <span style="color:${THEME.muted}">${s.label}${s.approx ? " ≈" : ""}</span>
                <span style="color:${THEME.text}">${v}</span></span>`;
            })
            .join("")
        : "";
    }
  }, [series, fitKey, paneStretch, showLegend]);

  return (
    <div className="relative w-full" style={{ height }}>
      {showLegend && (
        <div
          ref={legendRef}
          className="pointer-events-none absolute left-1 top-1 z-10 flex flex-wrap text-[10px] tabular-nums"
        />
      )}
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]/95 px-3 py-2 font-mono text-[10px] tabular-nums shadow-xl backdrop-blur-sm"
        style={{ display: "none" }}
      />
    </div>
  );
}

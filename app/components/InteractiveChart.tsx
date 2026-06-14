"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import { compactUsd } from "@/lib/format";

// Terminal palette (canvas needs concrete colors, not CSS vars — mirrors globals.css).
const THEME = {
  bg: "#07090a",
  text: "#c9d4cf",
  muted: "#6b7a74",
  grid: "rgba(28,35,38,0.35)",
  label: "#11171a",
};

export interface ChartSeries {
  id: string;
  label: string;
  type: "line" | "histogram";
  // time = epoch SECONDS (UTC), ascending, unique.
  data: { time: number; value: number }[];
  color: string;
  pane: number; // 0 = top
  overlay?: boolean; // histogram on its own overlay scale (volume under price)
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
  // Explicit window {from,to} in epoch SECONDS. When set, the chart shows exactly
  // this range on a fitKey change (instead of fitContent), so series with shorter
  // history render an empty gap on the left rather than rescaling to their own
  // extent. Essential for keeping two stacked charts on one shared domain.
  timeRange?: { from: number; to: number };
  // Charts sharing a syncId mirror each other's visible time range (pan/zoom on
  // one moves the other), keeping separate charts locked to one timeline.
  syncId?: string;
  paneStretch?: number[];
  height?: number;
  showLegend?: boolean;
}

// Module-level registry so sibling charts mirror each other's time range AND
// crosshair (hovering one chart shows the matching position on the other).
type RangeSetter = (r: { from: number; to: number }) => void;
interface SyncMember {
  setRange: RangeSetter;
  setCrosshair: (time: number) => void;
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
  syncId,
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
  // Suppress range-change propagation until this time — covers async emission
  // from any PROGRAMMATIC setVisibleRange (initial fit + sibling mirror) so only
  // genuine user pan/zoom propagates. Without this, a short-history sibling
  // ping-pongs the shared window down to its own extent.
  const suppressUntil = useRef(0);
  const setRange = useRef<RangeSetter | null>(null);
  const crosshairFromSibling = useRef(false); // guard against crosshair echo

  // Build chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const chart = createChart(el, {
      layout: {
        background: { color: THEME.bg },
        textColor: THEME.muted,
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 10,
        attributionLogo: false,
        panes: { separatorColor: THEME.grid, separatorHoverColor: THEME.grid },
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
      grid: {
        vertLines: { color: THEME.grid },
        horzLines: { color: THEME.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.muted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: THEME.label },
        horzLine: { color: THEME.muted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: THEME.label },
      },
      rightPriceScale: { borderColor: THEME.grid, entireTextOnly: true },
      timeScale: {
        borderColor: THEME.grid,
        timeVisible: true,
        secondsVisible: false,
        // Consistent ticks: HH:MM intraday vs MMM DD multi-day (reads the ref so
        // a range change re-renders with the right style).
        tickMarkFormatter: (t: Time) =>
          (timeAxisRef.current === "intraday" ? fmtIntraday : fmtDaily)(t as number),
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: !reduce, mouse: false },
      autoSize: true,
    });
    chartRef.current = chart;

    // Render this chart's DIY tooltip at a given time/x. Reused for direct hover
    // and for sibling-driven (synced) crosshair. x is the canvas x in px.
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
          return `<div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:${s.color}">${s.label}${s.approx ? " ≈" : ""}</span>
            <span style="color:${THEME.text}">${s.format(v)}</span></div>`;
        })
        .join("");
      if (!rows) {
        tip.style.display = "none";
        return;
      }
      tip.innerHTML = `<div style="color:${THEME.muted};margin-bottom:2px">${when} UTC</div>${rows}`;
      tip.style.display = "block";
      const cw = el.clientWidth;
      tip.style.left = `${Math.max(4, Math.min(x + 14, cw - 150))}px`;
      tip.style.top = `${Math.max(4, y)}px`;
    };
    const hideTooltip = () => {
      if (tooltipRef.current) tooltipRef.current.style.display = "none";
    };

    const ts = chart.timeScale();

    // Programmatic range setter (initial fit + sibling mirror). Suppresses the
    // resulting event so it doesn't re-propagate.
    const applyRange: RangeSetter = (r) => {
      suppressUntil.current = Date.now() + 120;
      try {
        ts.setVisibleRange({ from: r.from as Time, to: r.to as Time });
      } catch {
        /* range outside data — LWC clamps; ignore */
      }
    };
    setRange.current = applyRange;

    // This chart's membership in the sync group: how siblings drive its range
    // and crosshair. setCrosshair mirrors a hovered time as a vertical line +
    // tooltip on this chart (the two stacked charts highlight together).
    const selfMember: SyncMember = {
      setRange: applyRange,
      setCrosshair: (t) => {
        crosshairFromSibling.current = true;
        const first = specRef.current[0];
        const api = first ? seriesRef.current.get(first.id) : undefined;
        const v = first ? nearestValue(first.data, t) : null;
        if (api && v !== null) {
          try {
            chart.setCrosshairPosition(v, t as Time, api);
          } catch {
            /* ignore */
          }
        }
        const x = ts.timeToCoordinate(t as Time);
        if (x !== null) renderTooltip(t, x, 8);
        crosshairFromSibling.current = false;
      },
      clearCrosshair: () => {
        crosshairFromSibling.current = true;
        chart.clearCrosshairPosition();
        hideTooltip();
        crosshairFromSibling.current = false;
      },
    };

    // DIY tooltip in subscribeCrosshairMove (LWC ships none). Also broadcasts the
    // hovered time to synced siblings so all stacked charts highlight together.
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time === undefined) {
        hideTooltip();
        if (syncId && !crosshairFromSibling.current) {
          for (const m of syncGroups.get(syncId) ?? []) if (m !== selfMember) m.clearCrosshair();
        }
        return;
      }
      const t = param.time as number;
      renderTooltip(t, param.point.x, param.point.y - 10);
      if (syncId && !crosshairFromSibling.current) {
        for (const m of syncGroups.get(syncId) ?? []) if (m !== selfMember) m.setCrosshair(t);
      }
    });

    // Time-range sync: a real user pan/zoom on one chart mirrors to siblings
    // sharing the syncId (by TIME, so different data domains stay aligned).
    if (syncId) {
      let group = syncGroups.get(syncId);
      if (!group) {
        group = new Set();
        syncGroups.set(syncId, group);
      }
      group.add(selfMember);

      ts.subscribeVisibleTimeRangeChange((range) => {
        if (!range || Date.now() < suppressUntil.current) return;
        const r = { from: range.from as number, to: range.to as number };
        for (const m of syncGroups.get(syncId) ?? []) {
          if (m !== selfMember) m.setRange(r);
        }
      });
    }

    return () => {
      if (syncId) {
        const group = syncGroups.get(syncId);
        group?.delete(selfMember);
        if (group && group.size === 0) syncGroups.delete(syncId);
      }
      setRange.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      lastFitKey.current = "";
    };
  }, [syncId]);

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
            api.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
          }
        } else {
          api = chart.addSeries(
            LineSeries,
            { color: s.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false },
            s.pane,
          );
        }
        seriesRef.current.set(s.id, api);
      }
    }

    // LWC needs strictly-ascending unique times (seconds). When a timeRange is
    // set we clip real points to [from,to] and merge a regular WHITESPACE grid
    // spanning the whole window (points with no value). The grid gives every
    // chart an identical time domain AND enough tick anchors for a clean axis,
    // so a series with little history (e.g. OI) renders an empty gap to the
    // window edge with correct day/time labels — not rescaled to its own extent.
    const GRID = 64;
    const data = (s: ChartSeries) => {
      const tr = timeRangeRef.current;
      const merged = new Map<number, number | undefined>();
      if (tr) {
        const step = (tr.to - tr.from) / GRID;
        for (let i = 0; i <= GRID; i++) merged.set(Math.round(tr.from + i * step), undefined);
      }
      for (const d of s.data) {
        const t = d.time;
        if (tr && (t <= tr.from || t >= tr.to)) continue; // clip to window
        merged.set(t, d.value); // real value overrides a grid slot
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
      suppressUntil.current = Date.now() + 150;
      if (tr) {
        // Whitespace grid (added in data()) makes from/to valid bar times, so
        // setVisibleRange snaps to the exact shared window and every synced chart
        // lands on the identical [from,to] domain.
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
        className="pointer-events-none absolute z-10 hidden border border-[var(--color-line)] bg-[var(--color-bg)]/95 px-2 py-1 text-[10px] tabular-nums"
        style={{ display: "none" }}
      />
    </div>
  );
}

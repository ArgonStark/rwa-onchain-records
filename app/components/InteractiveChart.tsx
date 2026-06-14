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
} from "lightweight-charts";

// Terminal palette (canvas needs concrete colors, not CSS vars — mirrors globals.css).
const THEME = {
  bg: "#07090a",
  text: "#c9d4cf",
  muted: "#6b7a74",
  grid: "rgba(28,35,38,0.6)",
  green: "#46e39b",
  amber: "#f5b13d",
  dimVol: "rgba(107,122,116,0.45)",
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
  // Changing fitKey (window/symbol) does a full setData + fitContent. Same fitKey
  // with new data does an incremental series.update() so zoom/pan is preserved.
  fitKey: string;
  paneStretch?: number[];
  height?: number;
}

function nearestValue(
  data: { time: number; value: number }[],
  t: number,
): number | null {
  if (data.length === 0) return null;
  // binary search for last point with time <= t
  let lo = 0;
  let hi = data.length - 1;
  if (t <= data[0]!.time) return data[0]!.value;
  if (t >= data[hi]!.time) return data[hi]!.value;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (data[mid]!.time <= t) lo = mid;
    else hi = mid - 1;
  }
  return data[lo]!.value;
}

export function InteractiveChart({
  series,
  fitKey,
  paneStretch,
  height = 320,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());
  const lastFitKey = useRef<string>("");
  // latest series specs for the crosshair handler (avoids stale closures)
  const specRef = useRef<ChartSeries[]>(series);
  specRef.current = series;

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
      },
      grid: {
        vertLines: { color: THEME.grid },
        horzLines: { color: THEME.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: THEME.muted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#1c2326" },
        horzLine: { color: THEME.muted, width: 1, style: LineStyle.Dotted, labelBackgroundColor: "#1c2326" },
      },
      rightPriceScale: { borderColor: THEME.grid },
      timeScale: { borderColor: THEME.grid, timeVisible: true, secondsVisible: false },
      // pan/zoom: scroll + drag desktop, pinch + (kinetic unless reduced-motion) touch
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: !reduce, mouse: false },
      autoSize: true,
    });
    chartRef.current = chart;

    // DIY tooltip in subscribeCrosshairMove (LWC ships none).
    chart.subscribeCrosshairMove((param) => {
      const tip = tooltipRef.current;
      if (!tip) return;
      if (!param.point || param.time === undefined) {
        tip.style.display = "none";
        return;
      }
      const t = param.time as number;
      const when = new Date(t * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const rows = specRef.current
        .map((s) => {
          const api = seriesRef.current.get(s.id);
          const exact = api ? (param.seriesData.get(api) as { value?: number } | undefined) : undefined;
          const v = exact?.value ?? nearestValue(s.data, t);
          if (v === null || v === undefined) return "";
          return `<div style="display:flex;justify-content:space-between;gap:10px">
            <span style="color:${s.color}">${s.label}${s.approx ? " ≈" : ""}</span>
            <span style="color:${THEME.text}">${s.format(v)}</span></div>`;
        })
        .join("");
      tip.innerHTML = `<div style="color:${THEME.muted};margin-bottom:2px">${when}</div>${rows}`;
      tip.style.display = "block";
      const cw = el.clientWidth;
      const left = Math.min(param.point.x + 14, cw - 150);
      tip.style.left = `${Math.max(4, left)}px`;
      tip.style.top = `${Math.max(4, param.point.y - 10)}px`;
    });

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current.clear();
      lastFitKey.current = "";
    };
  }, []);

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
              priceFormat: { type: "volume" },
              priceScaleId: s.overlay ? `${s.id}-ov` : undefined,
            },
            s.pane,
          );
          if (s.overlay) {
            api.priceScale().applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
          }
        } else {
          api = chart.addSeries(
            LineSeries,
            { color: s.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: true },
            s.pane,
          );
        }
        seriesRef.current.set(s.id, api);
      }
    }

    const data = (s: ChartSeries) =>
      s.data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value }));

    if (fitKey !== lastFitKey.current) {
      // Range/symbol changed: full redraw + fit.
      for (const s of series) seriesRef.current.get(s.id)?.setData(data(s));
      chart.timeScale().fitContent();
      lastFitKey.current = fitKey;
    } else {
      // Live tick: update only the latest point (update() requires time >= the
      // series' last time), so zoom/pan is preserved. A new last time appends; a
      // repeated last time replaces. Larger gaps are reconciled on the next fit.
      for (const s of series) {
        const api = seriesRef.current.get(s.id);
        if (!api || s.data.length === 0) continue;
        const last = s.data[s.data.length - 1]!;
        try {
          api.update({ time: last.time as UTCTimestamp, value: last.value });
        } catch {
          // out-of-order/shrunk series — full redraw is safe, loses zoom rarely
          api.setData(data(s));
        }
      }
    }

    // relative pane sizes
    if (paneStretch) {
      const panes = chart.panes();
      paneStretch.forEach((f, i) => panes[i]?.setStretchFactor(f));
    }
  }, [series, fitKey, paneStretch]);

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden border border-[var(--color-line)] bg-[var(--color-bg)]/95 px-2 py-1 text-[10px] tabular-nums"
        style={{ display: "none" }}
      />
    </div>
  );
}

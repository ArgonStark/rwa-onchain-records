"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveChart, type ChartSeries } from "./InteractiveChart";
import { compactUsd, priceUsd } from "@/lib/format";

interface PerpPoint {
  ts: number;
  oiUsd: number | null;
  markPx: number | null;
}
interface CandlePoint {
  ts: number;
  close: number;
  volUsd: number;
}
interface DailyVol {
  day: string;
  notionalUsd: number;
  isApprox: boolean;
}
interface HistoryResp {
  venue: string;
  symbol: string;
  snapshots: PerpPoint[];
  candles: CandlePoint[] | null;
  dailyVolume: DailyVol[];
  sources: {
    snapshots: string;
    candles: string | null;
    dailyVolume: string | null;
    dailyVolumeApprox: boolean;
  };
}

const WINDOWS = ["24h", "7d", "30d"] as const;
const WINDOW_MS: Record<(typeof WINDOWS)[number], number> = {
  "24h": 86_400_000,
  "7d": 604_800_000,
  "30d": 2_592_000_000,
};
const REFRESH_MS = 30_000;

const dayToSec = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 1000;

export function DetailChart({
  venue,
  symbol,
  onClose,
}: {
  venue: string;
  symbol: string;
  onClose: () => void;
}) {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]>("7d");
  const [data, setData] = useState<HistoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const isOstium = venue === "Ostium";

  const fetchData = useCallback(
    (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      return fetch(
        `/api/history?venue=${encodeURIComponent(venue)}&symbol=${encodeURIComponent(symbol)}&window=${window}`,
      )
        .then((r) => r.json() as Promise<HistoryResp>)
        .then((d) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    },
    [venue, symbol, window],
  );

  useEffect(() => {
    void fetchData(true);
    const id = setInterval(() => void fetchData(false), REFRESH_MS); // live: same window -> series.update()
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // Two SEPARATE charts — price+volume on top, open interest below — kept on one
  // timeline by lightweight-charts' official cross-chart sync (shared logical
  // range + crosshair). See InteractiveChart syncId/domain.
  const priceVolSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    const out: ChartSeries[] = [];
    const priceData =
      data.candles && data.candles.length > 1
        ? data.candles.map((c) => ({ time: Math.floor(c.ts / 1000), value: c.close }))
        : data.snapshots
            .filter((p) => p.markPx !== null)
            .map((p) => ({ time: Math.floor(p.ts / 1000), value: p.markPx as number }));
    if (priceData.length) {
      out.push({
        id: "price",
        label: "Mark",
        type: "line",
        area: true,
        data: priceData,
        color: "#f5b13d",
        pane: 0,
        format: priceUsd,
        approx: !data.candles || data.candles.length <= 1,
      });
    }
    if (data.dailyVolume.length) {
      out.push({
        id: "vol",
        label: "Daily vol",
        type: "histogram",
        data: data.dailyVolume.map((d) => ({ time: dayToSec(d.day), value: d.notionalUsd })),
        color: "rgba(107,122,116,0.5)",
        pane: 0,
        overlay: true,
        format: compactUsd,
        approx: data.sources.dailyVolumeApprox,
      });
    }
    return out;
  }, [data]);

  // OI only when we have a line to draw (>1 point); a single point would render a
  // lone dot, so caption it as "building" instead.
  const oiSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    const oiData = data.snapshots
      .filter((p) => p.oiUsd !== null)
      .map((p) => ({ time: Math.floor(p.ts / 1000), value: p.oiUsd as number }));
    if (oiData.length <= 1) return [];
    return [
      {
        id: "oi",
        label: "Open interest",
        type: "line",
        area: true,
        data: oiData,
        color: "#46e39b",
        pane: 0,
        format: compactUsd,
      },
    ];
  }, [data]);

  const hasPriceVol = priceVolSeries.length > 0;
  const hasOi = oiSeries.length > 0;
  const timeAxis = window === "24h" ? "intraday" : "daily";

  // Lock both charts to the exact window.
  const timeRange = useMemo(() => {
    const to = Math.floor(Date.now() / 1000);
    return { from: to - Math.floor(WINDOW_MS[window] / 1000), to };
  }, [window]);

  // Shared bar backbone for BOTH charts: an even grid over the window plus every
  // real data point from either chart. Identical bars ⇒ identical logical indices
  // ⇒ the official logical-range + crosshair sync lines them up exactly.
  const domain = useMemo(() => {
    const { from, to } = timeRange;
    const times = new Set<number>();
    const GRID = 80;
    const step = (to - from) / GRID;
    for (let i = 0; i <= GRID; i++) times.add(Math.round(from + i * step));
    for (const s of [...priceVolSeries, ...oiSeries]) {
      for (const d of s.data) if (d.time > from && d.time < to) times.add(d.time);
    }
    return [...times].sort((a, b) => a - b);
  }, [priceVolSeries, oiSeries, timeRange]);
  const syncId = `${venue}|${symbol}|${window}`;

  // Does our OI snapshot history cover the selected window? If not, the OI pane
  // shows a (correct) empty gap on the left — caption it instead of looking broken.
  const oiStartMs = data?.snapshots.find((p) => p.oiUsd !== null)?.ts ?? null;
  const windowStartMs = Date.now() - WINDOW_MS[window];
  const oiShort = oiStartMs !== null && oiStartMs > windowStartMs + 60_000;
  const oiFromLabel =
    oiStartMs !== null
      ? new Date(oiStartMs).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "UTC",
        })
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-3"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} on ${venue} history`}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto border border-[var(--color-line)] bg-[var(--color-panel)] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold tracking-wide text-[var(--color-fg)]">
            {symbol} <span className="text-[var(--color-muted)]">@ {venue}</span>
          </h3>
          <div className="flex items-center gap-1.5">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                aria-pressed={window === w}
                className={`border px-2 py-0.5 text-xs ${
                  window === w
                    ? "border-[var(--color-green)] text-[var(--color-green)]"
                    : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                {w}
              </button>
            ))}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="ml-2 border border-[var(--color-line)] px-2 py-0.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            >
              esc ✕
            </button>
          </div>
        </div>

        <p className="mb-3 text-[11px] text-[var(--color-muted)]">
          Price &amp; volume above, open interest below — synced on one timeline.
          Drag to pan, scroll/pinch to zoom either, hover for values.
        </p>

        {loading && !data ? (
          <p className="py-16 text-center text-xs text-[var(--color-muted)]">loading…</p>
        ) : !hasPriceVol && !hasOi ? (
          <p className="py-16 text-center text-xs text-[var(--color-muted)]">
            no data yet — accumulating
          </p>
        ) : (
          <div className="space-y-2">
            {/* Chart 1 — price + daily volume */}
            <div className="border border-[var(--color-line)]">
              <div className="border-b border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                Mark price · daily notional volume
              </div>
              {hasPriceVol ? (
                <InteractiveChart
                  series={priceVolSeries}
                  fitKey={`pv|${venue}|${symbol}|${window}`}
                  timeAxis={timeAxis}
                  timeRange={timeRange}
                  domain={domain}
                  syncId={syncId}
                  height={250}
                />
              ) : (
                <p className="py-10 text-center text-[11px] text-[var(--color-muted)]">
                  no price/volume series
                </p>
              )}
            </div>

            {/* Chart 2 — open interest (separate chart, synced timeline) */}
            <div className="border border-[var(--color-line)]">
              <div className="border-b border-[var(--color-line)] px-2 py-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                Open interest · our snapshots
              </div>
              {hasOi ? (
                <InteractiveChart
                  series={oiSeries}
                  fitKey={`oi|${venue}|${symbol}|${window}`}
                  timeAxis={timeAxis}
                  timeRange={timeRange}
                  domain={domain}
                  syncId={syncId}
                  height={150}
                />
              ) : (
                <p className="py-8 text-center text-[11px] text-[var(--color-muted)]">
                  OI history is still building — not enough recorded yet for this range
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 space-y-0.5 text-[10px] text-[var(--color-muted)]">
          {oiShort && oiFromLabel && (
            <p className="text-[var(--color-amber)]">
              OI recorded from {oiFromLabel} UTC — earlier of this range is
              price/volume only (our snapshot history is still building).
            </p>
          )}
          <p>
            <span className="text-[#46e39b]">OI</span> — EWA snapshots (Postgres).{" "}
            <span className="text-[#f5b13d]">price</span> —{" "}
            {data?.sources.candles ?? "EWA snapshot mark"}.{" "}
            <span>volume</span> — {data?.sources.dailyVolume ?? "—"}
            {data?.sources.dailyVolumeApprox ? " (≈ approximate)" : " (exact)"}.
          </p>
          {isOstium && (
            <p className="text-[var(--color-amber)]">
              Ostium is our owned record — no public API back-fills this series.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

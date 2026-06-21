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
        color: "#FBBF24",
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
        color: "rgba(100,116,139,0.4)",
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
        color: "#34D399",
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} on ${venue} history`}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl sm:rounded-2xl">
        {/* Modal header */}
        <div className="sticky top-0 z-10 rounded-t-2xl border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[var(--color-fg)]">
                {symbol}
                <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                  @ {venue}
                </span>
              </h3>
              <p className="mt-0.5 font-mono text-[10px] text-[var(--color-subtle)]">
                Drag · scroll to zoom · tap for values
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="shrink-0 cursor-pointer rounded-full border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-muted)] transition-all duration-150 hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
            >
              ✕
            </button>
          </div>
          <div className="mt-2.5 flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindow(w)}
                aria-pressed={window === w}
                className={`cursor-pointer rounded-full border px-3 py-1 font-mono text-xs font-medium transition-all duration-150 ${
                  window === w
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {loading && !data ? (
            <div className="flex items-center justify-center py-20">
              <span className="font-mono text-sm text-[var(--color-muted)]">Loading…</span>
            </div>
          ) : !hasPriceVol && !hasOi ? (
            <div className="flex items-center justify-center py-20">
              <span className="font-mono text-sm text-[var(--color-muted)]">
                No data yet — accumulating
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Chart 1 — price + daily volume */}
              <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)]">
                <div className="border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                    Mark price · daily notional volume
                  </span>
                </div>
                {hasPriceVol ? (
                  <InteractiveChart
                    series={priceVolSeries}
                    fitKey={`pv|${venue}|${symbol}|${window}`}
                    timeAxis={timeAxis}
                    timeRange={timeRange}
                    domain={domain}
                    syncId={syncId}
                    height={200}
                  />
                ) : (
                  <p className="py-10 text-center font-mono text-xs text-[var(--color-muted)]">
                    No price/volume series
                  </p>
                )}
              </div>

              {/* Chart 2 — open interest */}
              <div className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)]">
                <div className="border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
                    Open interest · our snapshots
                  </span>
                </div>
                {hasOi ? (
                  <InteractiveChart
                    series={oiSeries}
                    fitKey={`oi|${venue}|${symbol}|${window}`}
                    timeAxis={timeAxis}
                    timeRange={timeRange}
                    domain={domain}
                    syncId={syncId}
                    height={130}
                  />
                ) : (
                  <p className="py-8 text-center font-mono text-xs text-[var(--color-muted)]">
                    OI history building — not enough recorded for this range
                  </p>
                )}
              </div>
            </div>
          )}

          {/* attribution footer */}
          <div className="mt-4 space-y-1 font-mono text-[10px] text-[var(--color-subtle)]">
            {oiShort && oiFromLabel && (
              <p className="text-[var(--color-amber)]">
                OI recorded from {oiFromLabel} UTC — earlier portion is price/volume
                only (snapshot history still building).
              </p>
            )}
            <p>
              <span className="text-[#34D399]">OI</span> — RWA snapshots.{" "}
              <span className="text-[#FBBF24]">Price</span> —{" "}
              {data?.sources.candles ?? "RWA snapshot mark"}.{" "}
              Volume — {data?.sources.dailyVolume ?? "—"}
              {data?.sources.dailyVolumeApprox ? " (≈ approx)" : " (exact)"}.
            </p>
            {isOstium && (
              <p className="text-[var(--color-amber)]">
                Ostium is our owned record — no public API back-fills this series.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

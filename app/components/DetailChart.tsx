"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractiveChart, type ChartSeries } from "./InteractiveChart";

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

const WINDOWS = ["6h", "24h", "7d", "30d"] as const;
const REFRESH_MS = 30_000;

const fmtUsd = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPx = (n: number): string =>
  n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

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

  const series = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    const out: ChartSeries[] = [];

    // Pane 0: price line (candles if present, else snapshot mark) + volume overlay.
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
        data: priceData,
        color: "#f5b13d",
        pane: 0,
        format: fmtPx,
        approx: !data.candles || data.candles.length <= 1,
      });
    }

    if (data.dailyVolume.length) {
      out.push({
        id: "vol",
        label: "Daily vol",
        type: "histogram",
        data: data.dailyVolume.map((d) => ({ time: dayToSec(d.day), value: d.notionalUsd })),
        color: "rgba(107,122,116,0.45)",
        pane: 0,
        overlay: true,
        format: fmtUsd,
        approx: data.sources.dailyVolumeApprox,
      });
    }

    // Pane 1: OI line (our owned snapshots).
    const oiData = data.snapshots
      .filter((p) => p.oiUsd !== null)
      .map((p) => ({ time: Math.floor(p.ts / 1000), value: p.oiUsd as number }));
    if (oiData.length) {
      out.push({
        id: "oi",
        label: "Open interest",
        type: "line",
        data: oiData,
        color: "#46e39b",
        pane: 1,
        format: fmtUsd,
      });
    }
    return out;
  }, [data]);

  const hasOi = series.some((s) => s.id === "oi" && s.data.length > 1);
  // Stable identity so InteractiveChart's data effect only runs on real changes.
  const paneStretch = useMemo(() => (hasOi ? [2, 1] : [1]), [hasOi]);

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

        <p className="mb-2 text-[11px] text-[var(--color-muted)]">
          Mark price + daily notional volume (bars), with open interest below. Drag
          to pan, scroll/pinch to zoom, hover for values.
        </p>

        {loading && !data ? (
          <p className="py-16 text-center text-xs text-[var(--color-muted)]">loading…</p>
        ) : series.length === 0 ? (
          <p className="py-16 text-center text-xs text-[var(--color-muted)]">
            no data yet — accumulating
          </p>
        ) : (
          <InteractiveChart
            series={series}
            fitKey={`${venue}|${symbol}|${window}`}
            paneStretch={paneStretch}
            height={380}
          />
        )}

        <div className="mt-3 space-y-0.5 text-[10px] text-[var(--color-muted)]">
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

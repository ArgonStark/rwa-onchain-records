"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PerpPoint {
  ts: number;
  oiUsd: number | null;
  vol24h: number | null;
  funding: number | null;
  markPx: number | null;
}
interface CandlePoint {
  ts: number;
  close: number;
  volUsd: number;
}
interface HistoryResp {
  kind: "perp";
  venue: string;
  symbol: string;
  window: string;
  snapshots: PerpPoint[];
  candles: CandlePoint[] | null;
  sources: { snapshots: string; candles: string | null };
}

const WINDOWS = ["6h", "24h", "7d", "30d"] as const;

const fmtUsd = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export function DetailChart({
  venue,
  symbol,
  onClose,
}: {
  venue: string;
  symbol: string;
  onClose: () => void;
}) {
  const [window, setWindow] = useState("24h");
  const [data, setData] = useState<HistoryResp | null>(null);
  const [loading, setLoading] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(
      `/api/history?venue=${encodeURIComponent(venue)}&symbol=${encodeURIComponent(symbol)}&window=${window}`,
    )
      .then((r) => r.json() as Promise<HistoryResp>)
      .then((d) => {
        if (live) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [venue, symbol, window]);

  // Esc to close; focus the close button on open.
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

  const oi = (data?.snapshots ?? [])
    .filter((p) => p.oiUsd !== null)
    .map((p) => ({ ts: p.ts, v: p.oiUsd as number }));
  const candles = data?.candles ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={`${symbol} on ${venue} history`}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
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

        {loading ? (
          <p className="py-10 text-center text-xs text-[var(--color-muted)]">
            loading…
          </p>
        ) : (
          <div className="space-y-5">
            <LineChart
              title="Open Interest — EWA snapshots (our owned record)"
              points={oi}
              format={fmtUsd}
              color="var(--color-green)"
              empty="accumulating — snapshots every 5 min"
            />
            {candles.length > 1 ? (
              <PriceVolChart candles={candles} />
            ) : (
              <LineChart
                title="Mark price — EWA snapshots"
                points={(data?.snapshots ?? [])
                  .filter((p) => p.markPx !== null)
                  .map((p) => ({ ts: p.ts, v: p.markPx as number }))}
                format={(n) => `$${n.toFixed(2)}`}
                color="var(--color-amber)"
                empty="accumulating"
              />
            )}
            <p className="text-[10px] text-[var(--color-muted)]">
              sources: {data?.sources.snapshots}
              {data?.sources.candles ? ` · ${data.sources.candles}` : ""}. RWA
              venues (Ostium) serve entirely from our snapshots — no public API
              back-fills this series.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── inline SVG charts ─────────────────────────────────────────────────
const W = 640;
const H = 150;
const PAD = 4;

function LineChart({
  title,
  points,
  format,
  color,
  empty,
}: {
  title: string;
  points: { ts: number; v: number }[];
  format: (n: number) => string;
  color: string;
  empty: string;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-[var(--color-muted)]">{title}</p>
      {points.length < 2 ? (
        <div className="border border-dashed border-[var(--color-line)] px-3 py-8 text-center text-xs text-[var(--color-muted)]">
          {empty} ({points.length} point{points.length === 1 ? "" : "s"})
        </div>
      ) : (
        <Plot points={points} color={color} format={format} />
      )}
    </div>
  );
}

function Plot({
  points,
  color,
  format,
}: {
  points: { ts: number; v: number }[];
  color: string;
  format: (n: number) => string;
}) {
  const vals = points.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const t0 = points[0]!.ts;
  const tRange = points[points.length - 1]!.ts - t0 || 1;
  const xy = points.map((p) => {
    const x = PAD + ((p.ts - t0) / tRange) * (W - 2 * PAD);
    const y = PAD + (1 - (p.v - min) / range) * (H - 2 * PAD);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const last = points[points.length - 1]!.v;
  const first = points[0]!.v;
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full border border-[var(--color-line)]"
        preserveAspectRatio="none"
        role="img"
        aria-label="time series chart"
      >
        <polyline points={xy.join(" ")} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-muted)] tabular-nums">
        <span>lo {format(min)}</span>
        <span>
          first {format(first)} → last {format(last)}
        </span>
        <span>hi {format(max)}</span>
      </div>
    </div>
  );
}

function PriceVolChart({ candles }: { candles: CandlePoint[] }) {
  const closes = candles.map((c) => c.close);
  const cMin = Math.min(...closes);
  const cMax = Math.max(...closes);
  const cRange = cMax - cMin || 1;
  const vMax = Math.max(...candles.map((c) => c.volUsd)) || 1;
  const t0 = candles[0]!.ts;
  const tRange = candles[candles.length - 1]!.ts - t0 || 1;

  const line = candles
    .map((c) => {
      const x = PAD + ((c.ts - t0) / tRange) * (W - 2 * PAD);
      const y = PAD + (1 - (c.close - cMin) / cRange) * (H - 2 * PAD);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const barW = Math.max(1, (W - 2 * PAD) / candles.length - 1);

  return (
    <div>
      <p className="mb-1 text-xs text-[var(--color-muted)]">
        Price &amp; volume — Hyperliquid candles
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full border border-[var(--color-line)]"
        preserveAspectRatio="none"
        role="img"
        aria-label="price and volume chart"
      >
        {candles.map((c, i) => {
          const x = PAD + ((c.ts - t0) / tRange) * (W - 2 * PAD);
          const h = (c.volUsd / vMax) * (H * 0.4);
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={H - PAD - h}
              width={barW}
              height={h}
              fill="var(--color-line)"
            />
          );
        })}
        <polyline points={line} fill="none" stroke="var(--color-amber)" strokeWidth="1.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--color-muted)] tabular-nums">
        <span>${cMin.toFixed(2)}</span>
        <span>vol max {fmtUsd(vMax)}/candle</span>
        <span>${cMax.toFixed(2)}</span>
      </div>
    </div>
  );
}

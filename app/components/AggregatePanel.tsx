"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InteractiveChart, type ChartSeries } from "./InteractiveChart";

interface DaySeriesPoint {
  day: string;
  byKey: Record<string, number>;
}
interface OiPoint {
  t: number;
  byKey: Record<string, number>;
}
interface HeaderStats {
  asOf: string | null;
  totalOiUsd: number;
  rwaOiUsd: number;
  total24hUsd: number;
  rwa24hUsd: number;
  oiDodPct: number | null;
  volDodPct: number | null;
}
interface AggResp {
  header: HeaderStats | null;
  dailyByClass: DaySeriesPoint[];
  dailyByVenue: DaySeriesPoint[];
  oiByClass: OiPoint[];
  sources: Record<string, string>;
}

const REFRESH_MS = 30_000;

const CLASS_COLOR: Record<string, string> = {
  equity: "#46e39b",
  commodity: "#f5b13d",
  index: "#a78bfa",
  forex: "#38bdf8",
  crypto: "#8b9690",
};
const VENUE_COLOR: Record<string, string> = {
  Hyperliquid: "#8b9690",
  "Hyperliquid HIP-3": "#f5b13d",
  Ostium: "#a78bfa",
  dYdX: "#38bdf8",
};
const CLASS_ORDER = ["equity", "commodity", "index", "forex", "crypto"];

const fmtUsd = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPct = (n: number | null): string =>
  n === null ? "—" : `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;
const daySec = (day: string): number => Date.parse(`${day}T00:00:00Z`) / 1000;

function daySeries(
  points: DaySeriesPoint[],
  keys: string[],
  colors: Record<string, string>,
): ChartSeries[] {
  return keys
    .map((k) => ({
      id: k,
      label: k,
      type: "line" as const,
      data: points.map((p) => ({ time: daySec(p.day), value: p.byKey[k] ?? 0 })),
      color: colors[k] ?? "#c9d4cf",
      pane: 0,
      format: fmtUsd,
    }))
    .filter((s) => s.data.some((d) => d.value > 0));
}

export function AggregatePanel() {
  const [data, setData] = useState<AggResp | null>(null);
  const [mode, setMode] = useState<"class" | "venue">("class");
  const [rwaOnly, setRwaOnly] = useState(true);

  const load = useCallback(() => {
    fetch("/api/aggregates?volDays=30&oiHours=168")
      .then((r) => r.json() as Promise<AggResp>)
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const volSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    if (mode === "venue") {
      return daySeries(data.dailyByVenue, Object.keys(VENUE_COLOR), VENUE_COLOR);
    }
    const keys = CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"));
    return daySeries(data.dailyByClass, keys, CLASS_COLOR);
  }, [data, mode, rwaOnly]);

  const oiSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    const keys = CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"));
    return keys
      .map((k) => ({
        id: `oi-${k}`,
        label: k,
        type: "line" as const,
        data: data.oiByClass.map((p) => ({ time: p.t, value: p.byKey[k] ?? 0 })),
        color: CLASS_COLOR[k] ?? "#c9d4cf",
        pane: 0,
        format: fmtUsd,
      }))
      .filter((s) => s.data.some((d) => d.value > 0));
  }, [data, rwaOnly]);

  const h = data?.header;
  const volKeys = mode === "venue" ? Object.keys(VENUE_COLOR) : CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"));

  return (
    <section className="mb-10">
      <SectionTitle
        n="00"
        title="RWA MARKET OVERVIEW"
        desc="Aggregate perp open interest and daily notional across all tracked venues. RWA = non-crypto classes (our thesis); crypto shown for context."
      />

      {/* header stat strip */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="RWA perp OI" value={h ? fmtUsd(h.rwaOiUsd) : "—"} sub={`of ${h ? fmtUsd(h.totalOiUsd) : "—"} total`} dod={h?.oiDodPct ?? null} />
        <Stat label="RWA 24h notional" value={h ? fmtUsd(h.rwa24hUsd) : "—"} sub={`of ${h ? fmtUsd(h.total24hUsd) : "—"} total`} dod={h?.volDodPct ?? null} />
        <Stat label="Total perp OI" value={h ? fmtUsd(h.totalOiUsd) : "—"} sub="all venues" dod={h?.oiDodPct ?? null} />
        <Stat label="Total 24h notional" value={h ? fmtUsd(h.total24hUsd) : "—"} sub="all venues" dod={h?.volDodPct ?? null} />
      </div>

      {/* daily notional volume */}
      <div className="mb-6 border border-[var(--color-line)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide text-[var(--color-fg)]">
            DAILY NOTIONAL VOLUME{" "}
            <span className="text-[var(--color-muted)]">· 30d · by {mode}</span>
          </h3>
          <div className="flex gap-1.5 text-xs">
            <Toggle on={mode === "class"} onClick={() => setMode("class")}>by class</Toggle>
            <Toggle on={mode === "venue"} onClick={() => setMode("venue")}>by venue</Toggle>
            {mode === "class" && (
              <Toggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>RWA only</Toggle>
            )}
          </div>
        </div>
        <Legend keys={volKeys} colors={mode === "venue" ? VENUE_COLOR : CLASS_COLOR} active={volSeries.map((s) => s.id)} />
        {volSeries.length ? (
          <InteractiveChart series={volSeries} fitKey={`vol|${mode}|${rwaOnly}`} height={240} />
        ) : (
          <Empty />
        )}
      </div>

      {/* OI by class */}
      <div className="mb-2 border border-[var(--color-line)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold tracking-wide text-[var(--color-fg)]">
            OPEN INTEREST BY ASSET CLASS{" "}
            <span className="text-[var(--color-muted)]">· our snapshots</span>
          </h3>
          <div className="flex gap-1.5 text-xs">
            <Toggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>RWA only</Toggle>
          </div>
        </div>
        <Legend keys={CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"))} colors={CLASS_COLOR} active={oiSeries.map((s) => s.id.replace("oi-", ""))} />
        {oiSeries.length ? (
          <InteractiveChart series={oiSeries} fitKey={`oi|${rwaOnly}`} height={220} />
        ) : (
          <Empty msg="accumulating OI history…" />
        )}
      </div>

      <p className="text-[10px] text-[var(--color-muted)]">
        volume: {data?.sources.dailyVolume}. OI: {data?.sources.oi}. cross-check:{" "}
        {data?.sources.defiLlamaCrossCheck}.
      </p>
    </section>
  );
}

function Stat({ label, value, sub, dod }: { label: string; value: string; sub: string; dod: number | null }) {
  return (
    <div className="border border-[var(--color-line)] p-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="text-base font-bold tabular-nums text-[var(--color-fg)]">{value}</p>
      <p className="text-[10px] text-[var(--color-muted)]">
        {sub}
        {dod !== null && (
          <span className={dod >= 0 ? " text-[var(--color-green)]" : " text-[var(--color-red)]"}>
            {" "}· DoD {fmtPct(dod)}
          </span>
        )}
      </p>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`border px-2 py-0.5 ${
        on
          ? "border-[var(--color-green)] text-[var(--color-green)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({ keys, colors, active }: { keys: string[]; colors: Record<string, string>; active: string[] }) {
  const set = new Set(active);
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
      {keys.filter((k) => set.has(k)).map((k) => (
        <span key={k} className="inline-flex items-center gap-1">
          <span aria-hidden style={{ background: colors[k] }} className="inline-block h-2 w-2 rounded-full" />
          <span className="text-[var(--color-muted)]">{k}</span>
        </span>
      ))}
    </div>
  );
}

function Empty({ msg = "no data" }: { msg?: string }) {
  return (
    <div className="border border-dashed border-[var(--color-line)] px-3 py-8 text-center text-xs text-[var(--color-muted)]">
      {msg}
    </div>
  );
}

function SectionTitle({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-bold tracking-widest text-[var(--color-fg)]">
        <span className="text-[var(--color-muted)]">{n} /</span> {title}
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{desc}</p>
    </div>
  );
}

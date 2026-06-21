"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { InteractiveChart, type ChartSeries } from "./InteractiveChart";
import { compactUsd } from "@/lib/format";

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
  equity:    "#34D399",
  commodity: "#FBBF24",
  index:     "#A78BFA",
  forex:     "#38BDF8",
  crypto:    "#64748B",
};
const VENUE_COLOR: Record<string, string> = {
  Hyperliquid:          "#64748B",
  "Hyperliquid HIP-3":  "#FBBF24",
  Ostium:               "#A78BFA",
  dYdX:                 "#38BDF8",
  Lighter:              "#2DD4BF",
  Aster:                "#FB7185",
  Variational:          "#F97316",
};
const CLASS_ORDER = ["equity", "commodity", "index", "forex", "crypto"];

const fmtUsd = compactUsd;
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
      color: colors[k] ?? "#94A3B8",
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

  const oi = data?.oiByClass ?? [];
  const oiExtentSec = oi.length > 1 ? oi[oi.length - 1]!.t - oi[0]!.t : 0;
  const oiTimeAxis: "intraday" | "daily" = oiExtentSec < 2 * 86400 ? "intraday" : "daily";
  const oiBuilding = oi.length > 0 && oiExtentSec < 2 * 86400;

  const oiSeries = useMemo<ChartSeries[]>(() => {
    if (!data) return [];
    const keys = CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"));
    return keys
      .map((k) => ({
        id: `oi-${k}`,
        label: k,
        type: "line" as const,
        data: data.oiByClass.map((p) => ({ time: p.t, value: p.byKey[k] ?? 0 })),
        color: CLASS_COLOR[k] ?? "#94A3B8",
        pane: 0,
        format: fmtUsd,
      }))
      .filter((s) => s.data.some((d) => d.value > 0));
  }, [data, rwaOnly]);

  const h = data?.header;
  const volKeys =
    mode === "venue"
      ? Object.keys(VENUE_COLOR)
      : CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"));

  const volDays = data?.dailyByClass.length ?? 0;

  return (
    <section className="mb-12">
      <SectionTitle
        n="00"
        title="RWA MARKET OVERVIEW"
        desc="Aggregate perp open interest and daily notional across all tracked venues. RWA = non-crypto classes; crypto shown for context."
      />

      {/* stat strip */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="RWA Perp OI"
          value={h ? fmtUsd(h.rwaOiUsd) : "—"}
          sub={`of ${h ? fmtUsd(h.totalOiUsd) : "—"} total`}
          dod={h?.oiDodPct ?? null}
        />
        <Stat
          label="RWA 24h Notional"
          value={h ? fmtUsd(h.rwa24hUsd) : "—"}
          sub={`of ${h ? fmtUsd(h.total24hUsd) : "—"} total`}
          dod={h?.volDodPct ?? null}
        />
        <Stat
          label="Total Perp OI"
          value={h ? fmtUsd(h.totalOiUsd) : "—"}
          sub="all venues"
          dod={h?.oiDodPct ?? null}
        />
        <Stat
          label="Total 24h Notional"
          value={h ? fmtUsd(h.total24hUsd) : "—"}
          sub="all venues"
          dod={h?.volDodPct ?? null}
        />
      </div>

      {/* daily volume chart */}
      <div className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg)]">
            Daily Notional Volume
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--color-muted)]">
              · 30d · by {mode}
            </span>
          </h3>
          <div className="flex gap-1.5">
            <Toggle on={mode === "class"} onClick={() => setMode("class")}>
              By class
            </Toggle>
            <Toggle on={mode === "venue"} onClick={() => setMode("venue")}>
              By venue
            </Toggle>
            {mode === "class" && (
              <Toggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>
                RWA only
              </Toggle>
            )}
          </div>
        </div>
        <Legend
          keys={volKeys}
          colors={mode === "venue" ? VENUE_COLOR : CLASS_COLOR}
          active={volSeries.map((s) => s.id)}
        />
        {volSeries.length ? (
          <InteractiveChart
            series={volSeries}
            fitKey={`vol|${mode}|${rwaOnly}`}
            timeAxis="daily"
            height={240}
            showLegend={false}
            interactive={false}
          />
        ) : (
          <Empty />
        )}
        {volDays > 0 && volDays < 7 && (
          <p className="mt-2 font-mono text-[10px] text-[var(--color-muted)]">
            Building history — {volDays} day{volDays === 1 ? "" : "s"} so far
          </p>
        )}
      </div>

      {/* OI by class chart */}
      <div className="mb-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg)]">
            Open Interest by Asset Class
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--color-muted)]">
              · our snapshots
            </span>
          </h3>
          <div className="flex gap-1.5">
            <Toggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>
              RWA only
            </Toggle>
          </div>
        </div>
        <Legend
          keys={CLASS_ORDER.filter((k) => !(rwaOnly && k === "crypto"))}
          colors={CLASS_COLOR}
          active={oiSeries.map((s) => s.id.replace("oi-", ""))}
        />
        {oiSeries.length ? (
          <InteractiveChart
            series={oiSeries}
            fitKey={`oi|${rwaOnly}|${oiTimeAxis}`}
            timeAxis={oiTimeAxis}
            height={220}
            showLegend={false}
            interactive={false}
          />
        ) : (
          <Empty msg="Accumulating OI history…" />
        )}
        {oiBuilding && (
          <p className="mt-2 font-mono text-[10px] text-[var(--color-muted)]">
            Building history —{" "}
            {Math.max(1, Math.round(oiExtentSec / 3600))}h of snapshots so far
          </p>
        )}
      </div>

      <p className="font-mono text-[10px] text-[var(--color-subtle)]">
        Volume: {data?.sources.dailyVolume}. OI: {data?.sources.oi}.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  dod,
}: {
  label: string;
  value: string;
  sub: string;
  dod: number | null;
}) {
  const isUp = dod !== null && dod >= 0;
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </p>
      <p className="font-mono text-xl font-bold tabular-nums text-[var(--color-fg)]">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-[11px] text-[var(--color-subtle)]">{sub}</span>
        {dod !== null && (
          <span
            className={`font-mono text-[11px] font-medium ${
              isUp ? "text-[var(--color-green)]" : "text-[var(--color-red)]"
            }`}
          >
            {isUp ? "▲" : "▼"} {fmtPct(dod)}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ${
        on
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

function Legend({
  keys,
  colors,
  active,
}: {
  keys: string[];
  colors: Record<string, string>;
  active: string[];
}) {
  const set = new Set(active);
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
      {keys
        .filter((k) => set.has(k))
        .map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              style={{ background: colors[k] }}
              className="inline-block h-2 w-2 rounded-full"
            />
            <span className="text-xs capitalize text-[var(--color-muted)]">
              {k}
            </span>
          </span>
        ))}
    </div>
  );
}

function Empty({ msg = "No data" }: { msg?: string }) {
  return (
    <div className="rounded border border-dashed border-[var(--color-line)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
      {msg}
    </div>
  );
}

function SectionTitle({
  n,
  title,
  desc,
}: {
  n: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-1.5 flex items-center gap-3">
        <span className="font-mono text-xs font-medium text-[var(--color-accent)]">
          {n}
        </span>
        <div className="h-px flex-1 bg-[var(--color-line)]" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-fg)]">
          {title}
        </h2>
        <div className="h-px w-6 bg-[var(--color-line)]" />
      </div>
      <p className="pl-0 sm:pl-8 text-xs text-[var(--color-muted)]">{desc}</p>
    </div>
  );
}

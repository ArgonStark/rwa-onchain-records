"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCard, CardToggle, CardEmpty } from "./ChartCard";
import { compactUsd, venueColor, LINE_COLOR, MUTED_TEXT } from "./nivoTheme";

type SortKey = "rwaOi" | "totalOi" | "vol";
type Filter = "rwa" | "all";

interface ByClass {
  oiUsd: number;
  vol24hUsd: number;
}
interface VenueRow {
  venue: string;
  totalOiUsd: number;
  rwaOiUsd: number;
  totalVol24hUsd: number;
  rwaVol24hUsd: number;
  byClass: Partial<Record<string, ByClass>>;
}
interface Resp {
  hasDatabase: boolean;
  asOf: string | null;
  venues: VenueRow[];
}

const RWA_CLASSES = ["equity", "commodity", "index", "forex"] as const;
const MIX_COLOR: Record<string, string> = {
  equity:    "#34D399",
  commodity: "#FBBF24",
  index:     "#A78BFA",
  forex:     "#38BDF8",
};

export function EcosystemLeaderboard() {
  const [data, setData]     = useState<Resp | null>(null);
  const [sort, setSort]     = useState<SortKey>("rwaOi");
  const [filter, setFilter] = useState<Filter>("rwa");

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/leaderboard")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const sorted = useMemo(() => {
    const venues = data?.venues ?? [];
    const key: keyof VenueRow =
      sort === "totalOi" ? "totalOiUsd"
      : sort === "vol"   ? (filter === "rwa" ? "rwaVol24hUsd" : "totalVol24hUsd")
      :                    "rwaOiUsd";
    return [...venues].sort((a, b) => (b[key] as number) - (a[key] as number));
  }, [data, sort, filter]);

  const maxOi  = useMemo(() => Math.max(1, ...sorted.map((v) => sort === "totalOi" ? v.totalOiUsd : v.rwaOiUsd)), [sorted, sort]);
  const maxVol = useMemo(() => Math.max(1, ...sorted.map((v) => filter === "rwa" ? v.rwaVol24hUsd : v.totalVol24hUsd)), [sorted, filter]);

  const oiLabel  = sort === "totalOi" ? "Total OI"  : "RWA OI";
  const volLabel = filter === "rwa"   ? "RWA 24h Vol" : "24h Vol";

  return (
    <ChartCard
      title="ECOSYSTEM LEADERBOARD"
      badge="venues · live snapshot"
      desc="Cross-venue ranking by open interest, 24h volume, and asset-class mix. RWA = non-crypto (equity, commodity, index, forex)."
      right={
        <>
          <CardToggle on={filter === "rwa"} onClick={() => setFilter("rwa")}>RWA only</CardToggle>
          <CardToggle on={filter === "all"} onClick={() => setFilter("all")}>all markets</CardToggle>
        </>
      }
      caption="Bar width is relative to the top venue. Asset mix shows OI share across RWA classes."
      source={data?.asOf ? `source: RWA perp_snapshots · ${new Date(data.asOf).toLocaleString("en-US", { hour12: false })}` : undefined}
    >
      {!data ? (
        <CardEmpty msg="loading…" />
      ) : sorted.length === 0 ? (
        <CardEmpty msg="no snapshot data" />
      ) : (
        <div>
          {/* Sort controls */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
              Sort
            </span>
            <CardToggle on={sort === "rwaOi"}   onClick={() => setSort("rwaOi")}>RWA OI</CardToggle>
            <CardToggle on={sort === "totalOi"} onClick={() => setSort("totalOi")}>Total OI</CardToggle>
            <CardToggle on={sort === "vol"}     onClick={() => setSort("vol")}>24h Vol</CardToggle>
          </div>

          {/* Desktop header row — hidden on mobile */}
          <div className="mb-1 hidden sm:grid sm:grid-cols-[28px_1fr_200px_140px_160px] items-center gap-4 px-3 font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
            <span>#</span>
            <span>Venue</span>
            <span>{oiLabel}</span>
            <span>{volLabel}</span>
            <span>Asset Mix (OI)</span>
          </div>

          <div className="flex flex-col gap-0.5">
            {sorted.map((v, i) => {
              const oiVal  = sort === "totalOi" ? v.totalOiUsd  : v.rwaOiUsd;
              const volVal = filter === "rwa"   ? v.rwaVol24hUsd : v.totalVol24hUsd;
              const oiFrac = oiVal  / maxOi;
              const volFrac = volVal / maxVol;

              const mixTotal = RWA_CLASSES.reduce((s, c) => s + (v.byClass[c]?.oiUsd ?? 0), 0);
              const segments = RWA_CLASSES
                .map((c) => ({ c, oi: v.byClass[c]?.oiUsd ?? 0 }))
                .filter((s) => s.oi > 0)
                .sort((a, b) => b.oi - a.oi);

              const color = venueColor(v.venue);
              const rankColor = i === 0 ? "#FBBF24" : i === 1 ? "#94A3B8" : "#64748B";

              return (
                <div
                  key={v.venue}
                  className="group rounded-lg border border-transparent transition-colors duration-150 hover:border-[var(--color-line)] hover:bg-[var(--color-surface)]/40"
                >
                  {/* ── Mobile card (hidden at sm+) ── */}
                  <div className="sm:hidden px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-5 shrink-0 font-mono text-sm font-semibold" style={{ color: rankColor }}>
                        {i + 1}
                      </span>
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-fg)]">
                        {v.venue}
                      </span>
                      <span className="shrink-0 font-mono text-xs font-medium text-[var(--color-fg)]">
                        {compactUsd(oiVal)}
                      </span>
                    </div>
                    <div className="ml-7 mt-2.5 space-y-2">
                      {/* OI bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted)]">
                          <span>{oiLabel}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max(oiFrac * 100, 0.5)}%`, background: color }}
                          />
                        </div>
                      </div>
                      {/* Vol bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted)]">
                          <span>{volLabel}</span>
                          <span>{compactUsd(volVal)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                          <div
                            className="h-full rounded-full opacity-60 transition-all duration-700"
                            style={{ width: `${Math.max(volFrac * 100, 0.5)}%`, background: color }}
                          />
                        </div>
                      </div>
                      {/* Asset mix */}
                      {mixTotal > 0 && (
                        <div>
                          <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                            {segments.map(({ c, oi }) => (
                              <div
                                key={c}
                                style={{ width: `${(oi / mixTotal) * 100}%`, background: MIX_COLOR[c] }}
                                title={`${c}: ${compactUsd(oi)}`}
                              />
                            ))}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-2">
                            {segments.map(({ c }) => (
                              <span
                                key={c}
                                className="font-mono text-[9px] uppercase tracking-wide"
                                style={{ color: MIX_COLOR[c] ?? MUTED_TEXT }}
                              >
                                {c.slice(0, 4)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Desktop grid row (hidden below sm) ── */}
                  <div className="hidden sm:grid sm:grid-cols-[28px_1fr_200px_140px_160px] items-center gap-4 px-3 py-3">
                    {/* Rank */}
                    <span className="font-mono text-sm font-semibold" style={{ color: rankColor }}>
                      {i + 1}
                    </span>

                    {/* Venue */}
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ background: color }}
                      />
                      <span className="truncate text-sm font-medium text-[var(--color-fg)]">
                        {v.venue}
                      </span>
                    </div>

                    {/* OI — value + bar */}
                    <div className="space-y-1.5">
                      <span className="font-mono text-xs font-medium text-[var(--color-fg)]">
                        {compactUsd(oiVal)}
                      </span>
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(oiFrac * 100, 0.5)}%`, background: color }}
                        />
                      </div>
                    </div>

                    {/* Vol — value + bar */}
                    <div className="space-y-1.5">
                      <span className="font-mono text-xs text-[var(--color-muted)]">
                        {compactUsd(volVal)}
                      </span>
                      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                        <div
                          className="h-full rounded-full opacity-60 transition-all duration-700"
                          style={{ width: `${Math.max(volFrac * 100, 0.5)}%`, background: color }}
                        />
                      </div>
                    </div>

                    {/* Asset mix — stacked bar + class labels */}
                    {mixTotal > 0 ? (
                      <div className="space-y-1">
                        <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: LINE_COLOR }}>
                          {segments.map(({ c, oi }) => (
                            <div
                              key={c}
                              style={{ width: `${(oi / mixTotal) * 100}%`, background: MIX_COLOR[c] }}
                              title={`${c}: ${compactUsd(oi)}`}
                            />
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-x-2">
                          {segments.map(({ c }) => (
                            <span
                              key={c}
                              className="font-mono text-[9px] uppercase tracking-wide"
                              style={{ color: MIX_COLOR[c] ?? MUTED_TEXT }}
                              title={compactUsd(v.byClass[c]?.oiUsd ?? 0)}
                            >
                              {c.slice(0, 4)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono text-[10px]" style={{ color: MUTED_TEXT }}>
                        crypto only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-line)] pt-3">
            {(Object.entries(MIX_COLOR) as [string, string][]).map(([c, hex]) => (
              <span key={c} className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-muted)]">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: hex }} />
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

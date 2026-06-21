"use client";

import { useMemo, useState } from "react";
import type { AssetCategory, PerpMarket } from "@/lib/types";
import { canonicalFor } from "@/lib/canonicalAsset";
import { compactUsd, priceUsd } from "@/lib/format";
import { Sparkline } from "./Sparkline";

type SortKey = "symbol" | "mark" | "oi" | "vol" | "funding" | "skew";

const CAT_LABEL: Record<AssetCategory, string> = {
  crypto:    "CRYPTO",
  equity:    "EQUITY",
  commodity: "COMMOD",
  forex:     "FOREX",
  index:     "INDEX",
};

const CAT_BADGE: Record<AssetCategory, string> = {
  crypto:    "text-[var(--color-muted)] border-[var(--color-line)] bg-transparent",
  equity:    "text-[var(--color-green)] border-[var(--color-green)]/20 bg-[var(--color-green)]/5",
  commodity: "text-[var(--color-amber)] border-[var(--color-amber)]/20 bg-[var(--color-amber)]/5",
  forex:     "text-[var(--color-sky)] border-[var(--color-sky)]/20 bg-[var(--color-sky)]/5",
  index:     "text-violet-400 border-violet-400/20 bg-violet-400/5",
};

function CategoryBadge({ cat }: { cat: AssetCategory }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${CAT_BADGE[cat]}`}
    >
      {CAT_LABEL[cat]}
    </span>
  );
}

interface Group {
  key: string;
  label: string;
  category: AssetCategory;
  members: PerpMarket[];
  oiUsd: number;
  vol24hUsd: number | null;
  venueCount: number;
  deepest: PerpMarket;
}

const fmtPct = (n: number, d = 3) => `${(n * 100).toFixed(d)}%`;

function buildGroups(markets: PerpMarket[]): Group[] {
  const map = new Map<string, Group>();
  for (const m of markets) {
    const ref = canonicalFor(m.symbol, m.category);
    let g = map.get(ref.key);
    if (!g) {
      g = {
        key: ref.key,
        label: ref.label,
        category: m.category,
        members: [],
        oiUsd: 0,
        vol24hUsd: null,
        venueCount: 0,
        deepest: m,
      };
      map.set(ref.key, g);
    }
    g.members.push(m);
  }
  for (const g of map.values()) {
    g.oiUsd = g.members.reduce((s, m) => s + m.oiUsd, 0);
    const vols = g.members.map((m) => m.vol24hUsd).filter((v): v is number => v !== null);
    g.vol24hUsd = vols.length ? vols.reduce((a, b) => a + b, 0) : null;
    g.venueCount = new Set(g.members.map((m) => m.venue)).size;
    g.deepest = g.members.reduce((a, b) => (b.oiUsd > a.oiUsd ? b : a), g.members[0]!);
    g.category = g.deepest.category;
    g.members.sort((a, b) => b.oiUsd - a.oiUsd);
  }
  return [...map.values()];
}

function marketSortVal(m: PerpMarket, key: SortKey): number | string {
  switch (key) {
    case "symbol":  return m.symbol.toLowerCase();
    case "mark":    return m.markPx;
    case "oi":      return m.oiUsd;
    case "vol":     return m.vol24hUsd ?? -1;
    case "funding": return m.funding ?? Number.NEGATIVE_INFINITY;
    case "skew":    return m.skew ?? Number.NEGATIVE_INFINITY;
  }
}
function groupSortVal(g: Group, key: SortKey): number | string {
  switch (key) {
    case "symbol":  return g.label.toLowerCase();
    case "mark":    return g.deepest.markPx;
    case "oi":      return g.oiUsd;
    case "vol":     return g.vol24hUsd ?? -1;
    case "funding": return g.deepest.funding ?? Number.NEGATIVE_INFINITY;
    case "skew":    return g.deepest.skew ?? Number.NEGATIVE_INFINITY;
  }
}
function cmp(a: number | string, b: number | string, dir: "asc" | "desc"): number {
  let r: number;
  if (typeof a === "string" || typeof b === "string") r = String(a).localeCompare(String(b));
  else r = a - b;
  return dir === "asc" ? r : -r;
}

export function PerpLedger({
  markets,
  spark,
  onSelect,
}: {
  markets: PerpMarket[];
  spark: Record<string, number[]>;
  onSelect: (t: { venue: string; symbol: string }) => void;
}) {
  const [search, setSearch] = useState("");
  const [grouped, setGrouped] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("oi");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const q = search.trim().toLowerCase();
  const matchMarket = (m: PerpMarket) =>
    !q || m.symbol.toLowerCase().includes(q) || m.venue.toLowerCase().includes(q);

  const groups = useMemo(() => buildGroups(markets), [markets]);

  const visibleGroups = useMemo(() => {
    const gs = groups
      .map((g) => ({ ...g, members: g.members.filter(matchMarket) }))
      .filter((g) => g.members.length > 0 || g.label.toLowerCase().includes(q));
    return gs.sort((a, b) => cmp(groupSortVal(a, sortKey), groupSortVal(b, sortKey), sortDir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, q, sortKey, sortDir]);

  const visibleFlat = useMemo(() => {
    return markets
      .filter(matchMarket)
      .sort((a, b) => cmp(marketSortVal(a, sortKey), marketSortVal(b, sortKey), sortDir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, q, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "symbol" ? "asc" : "desc");
    }
  };
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const rowCount = grouped ? visibleGroups.length : visibleFlat.length;

  return (
    <div>
      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:flex-none">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol or venue…"
            aria-label="search markets"
            className="w-full sm:w-56 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 font-mono text-xs text-[var(--color-fg)] placeholder:text-[var(--color-subtle)] transition-colors duration-150 focus:border-[var(--color-accent)] focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            >
              ×
            </button>
          )}
        </div>

        <Toggle on={grouped} onClick={() => setGrouped((v) => !v)}>
          Group by asset
        </Toggle>

        {grouped && (
          <>
            <button
              type="button"
              onClick={() => setOpen(new Set(visibleGroups.map((g) => g.key)))}
              className="cursor-pointer rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setOpen(new Set())}
              className="cursor-pointer rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
            >
              Collapse all
            </button>
          </>
        )}

        <span className="ml-auto font-mono text-[10px] text-[var(--color-subtle)]">
          {rowCount} {grouped ? "assets" : "markets"}
          {grouped ? ` · ${markets.filter(matchMarket).length} legs` : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
        <div className="overflow-x-auto">
          {/* min-w grows with breakpoints: mobile shows Symbol+OI, sm adds Class/Venue/Mark/Trend, md adds Vol/Funding/Skew */}
          <table className="w-full min-w-[240px] sm:min-w-[580px] md:min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
                <SortTh label="Symbol" k="symbol" cur={sortKey} dir={sortDir} onClick={setSort} className="pl-4" />
                <Th className="hidden sm:table-cell">Class</Th>
                <Th className="hidden sm:table-cell">{grouped ? "Venues" : "Venue"}</Th>
                <SortTh label="Mark" k="mark" cur={sortKey} dir={sortDir} onClick={setSort} align="right" className="hidden sm:table-cell" />
                <SortTh label="OI" k="oi" cur={sortKey} dir={sortDir} onClick={setSort} align="right" />
                <Th className="hidden md:table-cell text-right">OI Trend</Th>
                <SortTh label="24h Vol" k="vol" cur={sortKey} dir={sortDir} onClick={setSort} align="right" className="hidden md:table-cell" />
                <SortTh label="Funding" k="funding" cur={sortKey} dir={sortDir} onClick={setSort} align="right" className="hidden md:table-cell" />
                <SortTh label="Skew" k="skew" cur={sortKey} dir={sortDir} onClick={setSort} align="right" className="hidden md:table-cell pr-4" />
              </tr>
            </thead>
            <tbody>
              {rowCount === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-10 text-center text-sm text-[var(--color-muted)]"
                  >
                    No markets match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}

              {grouped
                ? visibleGroups.map((g) => {
                    const isOpen = open.has(g.key);
                    return (
                      <GroupRows
                        key={g.key}
                        g={g}
                        isOpen={isOpen}
                        onToggle={() => toggle(g.key)}
                        spark={spark}
                        onSelect={onSelect}
                      />
                    );
                  })
                : visibleFlat.map((m, i) => (
                    <MarketRow
                      key={`${m.venue}:${m.symbol}:${i}`}
                      m={m}
                      spark={spark}
                      onSelect={onSelect}
                    />
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GroupRows({
  g,
  isOpen,
  onToggle,
  spark,
  onSelect,
}: {
  g: Group;
  isOpen: boolean;
  onToggle: () => void;
  spark: Record<string, number[]>;
  onSelect: (t: { venue: string; symbol: string }) => void;
}) {
  const d = g.deepest;
  return (
    <>
      <tr
        onClick={onToggle}
        tabIndex={0}
        role="button"
        aria-expanded={isOpen}
        aria-label={`${g.label} — ${g.venueCount} venues, toggle breakdown`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer border-b border-[var(--color-line)]/50 transition-colors duration-100 hover:bg-[var(--color-panel)]"
      >
        <Td className="pl-4 font-semibold text-[var(--color-fg)]">
          <span className="mr-2 inline-block w-3 text-[10px] text-[var(--color-accent)]">
            {isOpen ? "▾" : "▸"}
          </span>
          {g.label}
          {/* mobile sub-line: class + venue count (hidden on sm+ where columns exist) */}
          <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-subtle)] sm:hidden">
            {g.venueCount} venue{g.venueCount !== 1 ? "s" : ""} · {CAT_LABEL[g.category]}
          </span>
        </Td>
        <Td className="hidden sm:table-cell">
          <CategoryBadge cat={g.category} />
        </Td>
        <Td className="hidden sm:table-cell">
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-0.5 font-mono text-[10px] text-[var(--color-muted)]">
            {g.venueCount} venue{g.venueCount !== 1 ? "s" : ""}
          </span>
        </Td>
        <Td className="hidden sm:table-cell text-right font-mono tabular-nums text-[var(--color-muted)]">
          ~{priceUsd(d.markPx)}
        </Td>
        <Td className="text-right font-mono font-semibold tabular-nums text-[var(--color-fg)]">
          {compactUsd(g.oiUsd)}
        </Td>
        <Td className="hidden md:table-cell text-right">
          <Sparkline data={spark[`${d.venue}|${d.symbol}`]} />
        </Td>
        <Td className="hidden md:table-cell text-right font-mono tabular-nums text-[var(--color-muted)]">
          {g.vol24hUsd !== null ? compactUsd(g.vol24hUsd) : "—"}
        </Td>
        <Td className="hidden md:table-cell text-right font-mono tabular-nums">
          <FundingCell v={d.funding} />
        </Td>
        <Td className="hidden md:table-cell pr-4 text-right font-mono tabular-nums">
          {d.skew !== null ? <SkewCell skew={d.skew} /> : <span className="text-[var(--color-muted)]">—</span>}
        </Td>
      </tr>
      {isOpen &&
        g.members.map((m, i) => (
          <MarketRow
            key={`${g.key}:${m.venue}:${m.symbol}:${i}`}
            m={m}
            spark={spark}
            onSelect={onSelect}
            nested
          />
        ))}
    </>
  );
}

function MarketRow({
  m,
  spark,
  onSelect,
  nested,
}: {
  m: PerpMarket;
  spark: Record<string, number[]>;
  onSelect: (t: { venue: string; symbol: string }) => void;
  nested?: boolean;
}) {
  const open = () => onSelect({ venue: m.venue, symbol: m.symbol });
  return (
    <tr
      onClick={open}
      tabIndex={0}
      role="button"
      aria-label={`${m.symbol} on ${m.venue} — open history chart`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`cursor-pointer border-b border-[var(--color-line)]/50 transition-colors duration-100 hover:bg-[var(--color-panel)] ${
        nested ? "bg-[var(--color-bg)]" : ""
      }`}
    >
      <Td
        className={`${nested ? "pl-10 text-[var(--color-muted)]" : "pl-4 font-semibold text-[var(--color-fg)]"}`}
      >
        {nested ? (
          <span className="font-mono text-[var(--color-fg)]/70">{m.symbol}</span>
        ) : (
          <>
            {m.symbol}
            {/* mobile sub-line: venue (hidden on sm+ where Venue column exists) */}
            <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-subtle)] sm:hidden">
              {m.venue}
            </span>
          </>
        )}
      </Td>
      <Td className="hidden sm:table-cell">
        {nested ? null : <CategoryBadge cat={m.category} />}
      </Td>
      <Td className="hidden sm:table-cell">
        <span className="font-mono text-xs text-[var(--color-muted)]">
          {m.venue}
        </span>
      </Td>
      <Td className="hidden sm:table-cell text-right font-mono tabular-nums text-[var(--color-fg)]">
        {priceUsd(m.markPx)}
      </Td>
      <Td className="text-right font-mono tabular-nums text-[var(--color-fg)]">
        {compactUsd(m.oiUsd)}
      </Td>
      <Td className="hidden md:table-cell text-right">
        <Sparkline data={spark[`${m.venue}|${m.symbol}`]} />
      </Td>
      <Td className="hidden md:table-cell text-right font-mono tabular-nums text-[var(--color-muted)]">
        {m.vol24hUsd !== null ? compactUsd(m.vol24hUsd) : "—"}
      </Td>
      <Td className="hidden md:table-cell text-right font-mono tabular-nums">
        <FundingCell v={m.funding} />
      </Td>
      <Td className="hidden md:table-cell pr-4 text-right font-mono tabular-nums">
        {m.skew !== null ? <SkewCell skew={m.skew} /> : <span className="text-[var(--color-muted)]">—</span>}
      </Td>
    </tr>
  );
}

function FundingCell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-[var(--color-muted)]">—</span>;
  return (
    <span
      className={
        v >= 0 ? "text-[var(--color-green)]" : "text-[var(--color-red)]"
      }
    >
      {fmtPct(v, 4)}
    </span>
  );
}

function SkewCell({ skew }: { skew: number }) {
  const pct = skew * 100;
  return (
    <span
      className={skew >= 0.5 ? "text-[var(--color-green)]" : "text-[var(--color-red)]"}
      title={`${pct.toFixed(1)}% long / ${(100 - pct).toFixed(1)}% short`}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] ${className}`}
    >
      {children}
    </th>
  );
}

function SortTh({
  label,
  k,
  cur,
  dir,
  onClick,
  align = "left",
  className = "",
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = cur === k;
  return (
    <th
      className={`px-3 py-2.5 text-xs font-medium uppercase tracking-wide ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`cursor-pointer inline-flex items-center gap-1 transition-colors duration-150 hover:text-[var(--color-fg)] ${
          active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"
        }`}
        aria-label={`sort by ${label}`}
      >
        {label}
        <span className="w-2.5 text-[9px]">
          {active ? (dir === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
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
      className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
        on
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

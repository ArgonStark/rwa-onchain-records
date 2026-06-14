"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AssetCategory,
  PerpMarket,
  PerpsResponse,
  SpotTokenRow,
  TokensResponse,
} from "@/lib/types";
import { Sparkline } from "./components/Sparkline";
import { DetailChart } from "./components/DetailChart";
import { AggregatePanel } from "./components/AggregatePanel";

const REFRESH_MS = 30_000;

type SparkMap = Record<string, number[]>;
interface DetailTarget {
  venue: string;
  symbol: string;
}

// ── formatting helpers ───────────────────────────────────────────────
const fmtUsd = (n: number): string => {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPrice = (n: number): string =>
  n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : n >= 1
      ? n.toFixed(2)
      : n.toFixed(5);
const fmtPct = (n: number, digits = 3): string =>
  `${(n * 100).toFixed(digits)}%`;
const fmtSignedPct = (n: number, digits = 2): string =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

const CAT_LABEL: Record<AssetCategory, string> = {
  crypto: "CRYPTO",
  equity: "EQUITY",
  commodity: "COMMOD",
  forex: "FOREX",
  index: "INDEX",
};
const CAT_COLOR: Record<AssetCategory, string> = {
  crypto: "text-[var(--color-muted)]",
  equity: "text-[var(--color-green)]",
  commodity: "text-[var(--color-amber)]",
  forex: "text-sky-400",
  index: "text-violet-400",
};

type CatFilter = "all" | AssetCategory;

export default function Page() {
  const [perps, setPerps] = useState<PerpsResponse | null>(null);
  const [tokens, setTokens] = useState<TokensResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<CatFilter>("all");
  const [spark, setSpark] = useState<SparkMap>({});
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, t, s] = await Promise.all([
        fetch("/api/perps").then((r) => r.json() as Promise<PerpsResponse>),
        fetch("/api/tokens").then((r) => r.json() as Promise<TokensResponse>),
        fetch("/api/history/spark")
          .then((r) => r.json() as Promise<{ series: SparkMap }>)
          .catch(() => ({ series: {} })),
      ]);
      setPerps(p);
      setTokens(t);
      setSpark(s.series ?? {});
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Deep link: ?chart=Venue|SYMBOL opens that history chart (shareable).
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("chart");
    if (c?.includes("|")) {
      const [venue, symbol] = c.split("|");
      if (venue && symbol) setDetail({ venue, symbol });
    }
  }, []);

  const markets = (perps?.markets ?? []).filter(
    (m) => filter === "all" || m.category === filter,
  );

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-5 sm:py-8">
      <Header asOf={perps?.asOf} loading={loading} />

      {err && (
        <p className="mb-4 border border-[var(--color-red)] px-3 py-2 text-sm text-[var(--color-red)]">
          fetch error: {err}
        </p>
      )}

      <VenueStrip perps={perps} />

      <AggregatePanel />

      <section className="mb-10">
        <SectionTitle
          n="01"
          title="PERP LEDGER"
          desc="Live OI · funding · 24h vol · skew across public RWA + crypto perp venues, sorted by OI. Sparkline = OI trend from our snapshots; click a row for full history."
        />
        <FilterBar filter={filter} setFilter={setFilter} markets={perps?.markets} />
        <PerpTable markets={markets} spark={spark} onSelect={setDetail} />
      </section>

      <section className="mb-10">
        <SectionTitle
          n="02"
          title="SPOT TOKEN PREMIUM"
          desc="Tokenized gold & equities vs real spot. premium = token ÷ spot − 1. Each row links to its deepest venue."
        />
        <TokenTable tokens={tokens?.tokens ?? []} />
      </section>

      <Footer />

      {detail && (
        <DetailChart
          venue={detail.venue}
          symbol={detail.symbol}
          onClose={() => setDetail(null)}
        />
      )}
    </main>
  );
}

function Header({ asOf, loading }: { asOf?: string; loading: boolean }) {
  return (
    <header className="mb-6 border-b border-[var(--color-line)] pb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold tracking-tight text-[var(--color-green)] sm:text-xl">
          EWA ONCHAIN RECORDS
          <span className="cursor-blink ml-1 text-[var(--color-green)]">▍</span>
        </h1>
        <p className="text-xs text-[var(--color-muted)]">
          {loading
            ? "syncing…"
            : asOf
              ? `as of ${new Date(asOf).toLocaleTimeString("en-US", { hour12: false })} · refresh 30s`
              : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        on-chain analytics for tokenized real-world assets — live snapshot +
        owned time-series (click any row for history)
      </p>
    </header>
  );
}

function VenueStrip({ perps }: { perps: PerpsResponse | null }) {
  if (!perps) return null;
  return (
    <div className="mb-6 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {perps.venues.map((v) => (
        <span key={v.venue} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={
              v.status === "ok"
                ? "text-[var(--color-green)]"
                : "text-[var(--color-red)]"
            }
          >
            ●
          </span>
          <span className="text-[var(--color-fg)]">{v.venue}</span>
          <span className="text-[var(--color-muted)]">
            {v.status === "ok" ? `${v.count}` : "down"}
          </span>
        </span>
      ))}
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
    <div className="mb-3">
      <h2 className="text-sm font-bold tracking-widest text-[var(--color-fg)]">
        <span className="text-[var(--color-muted)]">{n} /</span> {title}
      </h2>
      <p className="mt-0.5 text-xs text-[var(--color-muted)]">{desc}</p>
    </div>
  );
}

function FilterBar({
  filter,
  setFilter,
  markets,
}: {
  filter: CatFilter;
  setFilter: (f: CatFilter) => void;
  markets?: PerpMarket[];
}) {
  const cats: CatFilter[] = ["all", "equity", "commodity", "index", "forex", "crypto"];
  const counts = new Map<string, number>();
  for (const m of markets ?? [])
    counts.set(m.category, (counts.get(m.category) ?? 0) + 1);

  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {cats.map((c) => {
        const active = filter === c;
        const count = c === "all" ? (markets?.length ?? 0) : (counts.get(c) ?? 0);
        return (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={active}
            className={`border px-2 py-0.5 text-xs uppercase tracking-wide transition-colors ${
              active
                ? "border-[var(--color-green)] text-[var(--color-green)]"
                : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {c === "all" ? "all" : CAT_LABEL[c as AssetCategory]}
            <span className="ml-1 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function PerpTable({
  markets,
  spark,
  onSelect,
}: {
  markets: PerpMarket[];
  spark: SparkMap;
  onSelect: (t: DetailTarget) => void;
}) {
  if (markets.length === 0) {
    return <Empty label="no perp markets" />;
  }
  return (
    <div className="overflow-x-auto border border-[var(--color-line)]">
      <table className="w-full min-w-[720px] border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-muted)]">
            <Th className="pl-3">SYMBOL</Th>
            <Th>CLASS</Th>
            <Th>VENUE</Th>
            <Th className="text-right">MARK</Th>
            <Th className="text-right">OI</Th>
            <Th className="text-right">OI TREND</Th>
            <Th className="text-right">24H VOL</Th>
            <Th className="text-right">FUNDING</Th>
            <Th className="pr-3 text-right">SKEW (%L)</Th>
          </tr>
        </thead>
        <tbody>
          {markets.map((m, i) => {
            const open = () => onSelect({ venue: m.venue, symbol: m.symbol });
            return (
              <tr
                key={`${m.venue}:${m.symbol}:${i}`}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${m.symbol} on ${m.venue} — open history chart`}
                className="cursor-pointer border-b border-[var(--color-line)]/60 hover:bg-[var(--color-panel)]"
              >
                <Td className="pl-3 font-bold text-[var(--color-fg)]">{m.symbol}</Td>
                <Td className={CAT_COLOR[m.category]}>{CAT_LABEL[m.category]}</Td>
                <Td className="text-[var(--color-muted)]">{m.venue}</Td>
                <Td className="text-right tabular-nums">{fmtPrice(m.markPx)}</Td>
                <Td className="text-right tabular-nums">{fmtUsd(m.oiUsd)}</Td>
                <Td className="text-right">
                  <Sparkline data={spark[`${m.venue}|${m.symbol}`]} />
                </Td>
                <Td className="text-right tabular-nums text-[var(--color-muted)]">
                  {m.vol24hUsd !== null ? fmtUsd(m.vol24hUsd) : "—"}
                </Td>
                <Td className="text-right tabular-nums">
                  {m.funding !== null ? (
                    <span
                      className={
                        m.funding >= 0
                          ? "text-[var(--color-green)]"
                          : "text-[var(--color-red)]"
                      }
                    >
                      {fmtPct(m.funding, 4)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="pr-3 text-right tabular-nums">
                  {m.skew !== null ? <SkewCell skew={m.skew} /> : "—"}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkewCell({ skew }: { skew: number }) {
  const pct = skew * 100;
  const longHeavy = skew >= 0.5;
  return (
    <span
      className={longHeavy ? "text-[var(--color-green)]" : "text-[var(--color-red)]"}
      title={`${pct.toFixed(1)}% long / ${(100 - pct).toFixed(1)}% short`}
    >
      {pct.toFixed(1)}%
    </span>
  );
}

function TokenTable({ tokens }: { tokens: SpotTokenRow[] }) {
  if (tokens.length === 0) return <Empty label="loading tokens…" />;
  return (
    <div className="overflow-x-auto border border-[var(--color-line)]">
      <table className="w-full min-w-[640px] border-collapse text-xs sm:text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line)] text-left text-[var(--color-muted)]">
            <Th className="pl-3">TOKEN</Th>
            <Th>CLASS</Th>
            <Th>CHAIN</Th>
            <Th className="text-right">TOKEN $</Th>
            <Th className="text-right">SPOT $</Th>
            <Th className="text-right">PREMIUM</Th>
            <Th className="pr-3 text-right">TRADE</Th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => (
            <tr
              key={t.symbol}
              className="border-b border-[var(--color-line)]/60 align-top hover:bg-[var(--color-panel)]"
            >
              <Td className="pl-3">
                <span className="font-bold text-[var(--color-fg)]">{t.symbol}</span>
                <span className="block text-[10px] text-[var(--color-muted)]">
                  {t.name}
                </span>
              </Td>
              <Td className={CAT_COLOR[t.category]}>{CAT_LABEL[t.category]}</Td>
              <Td className="text-[var(--color-muted)]">{t.chain}</Td>
              <Td className="text-right tabular-nums">
                {t.tokenUsdPrice !== null ? `$${fmtPrice(t.tokenUsdPrice)}` : "—"}
                {t.priceSource && (
                  <span className="block text-[10px] text-[var(--color-muted)]">
                    {t.priceSource}
                  </span>
                )}
              </Td>
              <Td className="text-right tabular-nums">
                {t.realSpotPrice !== null ? `$${fmtPrice(t.realSpotPrice)}` : "—"}
                {t.spotSource && (
                  <span className="block text-[10px] text-[var(--color-muted)]">
                    {t.spotSource}
                  </span>
                )}
              </Td>
              <Td className="text-right tabular-nums">
                {t.premium !== null ? (
                  <span
                    className={
                      t.premium >= 0
                        ? "text-[var(--color-green)]"
                        : "text-[var(--color-red)]"
                    }
                  >
                    {fmtSignedPct(t.premium)}
                  </span>
                ) : (
                  "—"
                )}
                {t.marketOpen === false && (
                  <span className="block text-[10px] text-[var(--color-amber)]">
                    off-hours
                  </span>
                )}
              </Td>
              <Td className="pr-3 text-right">
                <a
                  href={t.tradeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-green)] underline-offset-2 hover:underline"
                >
                  {t.tradeVenue} ↗
                </a>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <th className={`px-2 py-2 font-medium tracking-wide ${className}`}>
      {children}
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
  return <td className={`px-2 py-1.5 ${className}`}>{children}</td>;
}

function Empty({ label }: { label: string }) {
  return (
    <div className="border border-dashed border-[var(--color-line)] px-3 py-6 text-center text-xs text-[var(--color-muted)]">
      {label}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)] pt-4 text-[10px] leading-relaxed text-[var(--color-muted)]">
      <p>
        sources: Hyperliquid /info · Hyperliquid HIP-3 (xyz) · Ostium subgraph ·
        dYdX v4 indexer · CoinGecko · gold-api.com · Jupiter price v3. every
        metric is attributed to its venue.
      </p>
      <p className="mt-1">
        skew shown only where a long/short split exists (Ostium). 24h vol and
        funding omitted where a venue doesn&apos;t expose them. not investment
        advice.
      </p>
    </footer>
  );
}

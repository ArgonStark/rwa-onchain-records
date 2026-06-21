"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AssetCategory,
  PerpMarket,
  PerpsResponse,
  SpotTokenRow,
  TokensResponse,
} from "@/lib/types";
import { DetailChart } from "./components/DetailChart";
import { PerpLedger } from "./components/PerpLedger";
import { AggregatePanel } from "./components/AggregatePanel";
import { AnalyticsPanel } from "./components/AnalyticsPanel";
import { SameAssetPanel } from "./components/charts/SameAssetPanel";
import { IssuancePanel } from "./components/IssuancePanel";

const REFRESH_MS = 30_000;

type SparkMap = Record<string, number[]>;
interface DetailTarget {
  venue: string;
  symbol: string;
}

// ── formatting helpers ───────────────────────────────────────────────
const fmtPrice = (n: number): string =>
  n >= 1000
    ? n.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : n >= 1
      ? n.toFixed(2)
      : n.toFixed(5);
const fmtSignedPct = (n: number, digits = 2): string =>
  `${n >= 0 ? "+" : ""}${(n * 100).toFixed(digits)}%`;

const CAT_LABEL: Record<AssetCategory, string> = {
  crypto: "CRYPTO",
  equity: "EQUITY",
  commodity: "COMMOD",
  forex: "FOREX",
  index: "INDEX",
};

const CAT_BADGE: Record<AssetCategory, string> = {
  crypto:    "text-[var(--color-muted)] border-[var(--color-line)] bg-[var(--color-panel)]",
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
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Header asOf={perps?.asOf} loading={loading} />

      {err && (
        <div className="mb-6 rounded-lg border border-[var(--color-red)]/30 bg-[var(--color-red)]/5 px-4 py-3 text-sm text-[var(--color-red)]">
          <span className="font-semibold">Error:</span> {err}
        </div>
      )}

      <VenueStrip perps={perps} />

      <AggregatePanel />

      <AnalyticsPanel />

      <section className="mb-12">
        <SectionTitle n="01" title="PERP LEDGER" />
        <FilterBar filter={filter} setFilter={setFilter} markets={perps?.markets} />
        <PerpLedger markets={markets} spark={spark} onSelect={setDetail} />
      </section>

      <section className="mb-12">
        <SectionTitle n="02" title="SPOT TOKEN PREMIUM" />
        <TokenTable tokens={tokens?.tokens ?? []} />
      </section>

      <SameAssetPanel />

      {/* <IssuancePanel /> */}

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

const ETH_ADDRESS = "0x1DD735D8f27D5d819DEDeb4E081C090686Bc41C1";

function CopyAddress() {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(ETH_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy ETH donation address"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 font-mono text-xs text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-accent)]/40 hover:text-[var(--color-fg)] cursor-pointer"
    >
      <svg className="h-3.5 w-3.5 shrink-0 text-[var(--color-accent)]" viewBox="0 0 320 512" fill="currentColor" aria-hidden>
        <path d="M311.9 260.8L160 353.2 8 260.8 160 0l151.9 260.8zM160 383.4L8 291l152 220.6L312 291l-152 92.4z"/>
      </svg>
      {copied ? "copied!" : <>Donate · <span className="text-[var(--color-fg)]">{ETH_ADDRESS.slice(0, 6)}…{ETH_ADDRESS.slice(-4)}</span></>}
    </button>
  );
}

function Header({ asOf, loading }: { asOf?: string; loading: boolean }) {
  return (
    <header className="mb-8 border-b border-[var(--color-line)] pb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
              <polygon points="16,4 28,10 16,16 4,10" fill="#8B5CF6"/>
              <polygon points="4,10 16,16 16,28 4,22" fill="#5B21B6"/>
              <polygon points="16,16 28,10 28,22 16,28" fill="#FBBF24"/>
              <line x1="4" y1="10" x2="16" y2="16" stroke="#0F172A" strokeWidth="1"/>
              <line x1="28" y1="10" x2="16" y2="16" stroke="#0F172A" strokeWidth="1"/>
              <line x1="16" y1="16" x2="16" y2="28" stroke="#0F172A" strokeWidth="1"/>
            </svg>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-fg)]">
              RWA{" "}
              <span className="text-[var(--color-accent)]">ONCHAIN</span>{" "}
              RECORDS
            </h1>
            <span className="cursor-blink text-[var(--color-accent)] text-xl leading-none">
              ▍
            </span>
          </div>
          <p className="max-w-xl text-sm text-[var(--color-muted)]">
            On-chain analytics for tokenized real-world assets — perp OI,
            funding, skew, and spot-token premium across public venues.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://x.com/0xargonstark"
            target="_blank"
            rel="noopener noreferrer"
            title="@0xargonstark on X"
            className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-muted)] transition-colors duration-150 hover:border-[var(--color-accent)]/40 hover:text-[var(--color-fg)]"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.259 5.63L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
            </svg>
            <span className="sr-only">@0xargonstark on X</span>
          </a>
          <CopyAddress />
          <div className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                loading
                  ? "bg-[var(--color-amber)] pulse"
                  : "bg-[var(--color-green)]"
              }`}
            />
            <span className="font-mono text-xs text-[var(--color-muted)]">
              {loading
                ? "syncing…"
                : asOf
                  ? `${new Date(asOf).toLocaleTimeString("en-US", { hour12: false })} UTC · 30s`
                  : "live"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function VenueStrip({ perps }: { perps: PerpsResponse | null }) {
  if (!perps) return null;
  return (
    <div className="mb-8 flex flex-wrap gap-2">
      {perps.venues.map((v) => (
        <div
          key={v.venue}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors ${
            v.status === "ok"
              ? "border-[var(--color-line)] bg-[var(--color-panel)]"
              : v.status === "pending"
                ? "border-[var(--color-amber)]/20 bg-[var(--color-amber)]/5"
                : "border-[var(--color-red)]/20 bg-[var(--color-red)]/5"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              v.status === "ok"
                ? "bg-[var(--color-green)]"
                : v.status === "pending"
                  ? "bg-[var(--color-amber)] pulse"
                  : "bg-[var(--color-red)]"
            }`}
          />
          <span className="font-medium text-[var(--color-fg)]">{v.venue}</span>
          <span className="font-mono text-[var(--color-muted)]">
            {v.status === "ok"
              ? String(v.count)
              : v.status === "pending"
                ? "…"
                : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs font-medium text-[var(--color-accent)]">
          {n}
        </span>
        <div className="h-px flex-1 bg-[var(--color-line)]" />
        <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-fg)]">
          {title}
        </h2>
        <div className="h-px w-6 bg-[var(--color-line)]" />
      </div>
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
    <div className="mb-3 flex flex-wrap gap-1.5">
      {cats.map((c) => {
        const active = filter === c;
        const count = c === "all" ? (markets?.length ?? 0) : (counts.get(c) ?? 0);
        return (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            aria-pressed={active}
            className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ${
              active
                ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
            }`}
          >
            {c === "all" ? "ALL" : CAT_LABEL[c as AssetCategory]}
            <span
              className={`font-mono text-[10px] ${
                active ? "text-[var(--color-accent)]/60" : "text-[var(--color-subtle)]"
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function TokenTable({ tokens }: { tokens: SpotTokenRow[] }) {
  if (tokens.length === 0) return <Empty label="loading tokens…" />;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="overflow-x-auto">
        {/* min-w grows at breakpoints: mobile = Token+Token$+Premium, sm adds Class+Spot$+Trade, md adds Chain */}
        <table className="w-full min-w-[280px] sm:min-w-[520px] md:min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-panel)]">
              <Th className="pl-4">Token</Th>
              <Th className="hidden sm:table-cell">Class</Th>
              <Th className="hidden md:table-cell">Chain</Th>
              <Th className="text-right">Token $</Th>
              <Th className="hidden sm:table-cell text-right">Spot $</Th>
              <Th className="text-right">Premium</Th>
              <Th className="hidden sm:table-cell pr-4 text-right">Trade</Th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr
                key={t.symbol}
                className="border-b border-[var(--color-line)]/50 align-top transition-colors duration-150 hover:bg-[var(--color-panel)]"
              >
                <Td className="pl-4">
                  <span className="font-semibold text-[var(--color-fg)]">
                    {t.symbol}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-muted)]">
                    {t.name}
                  </span>
                  {/* mobile: show class badge inline under name */}
                  <span className="mt-0.5 block sm:hidden">
                    <CategoryBadge cat={t.category} />
                  </span>
                </Td>
                <Td className="hidden sm:table-cell">
                  <CategoryBadge cat={t.category} />
                </Td>
                <Td className="hidden md:table-cell font-mono text-xs text-[var(--color-muted)]">
                  {t.chain}
                </Td>
                <Td className="text-right">
                  <span className="font-mono tabular-nums text-[var(--color-fg)]">
                    {t.tokenUsdPrice !== null ? `$${fmtPrice(t.tokenUsdPrice)}` : "—"}
                  </span>
                  {t.priceSource && (
                    <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-muted)]">
                      {t.priceSource}
                    </span>
                  )}
                </Td>
                <Td className="hidden sm:table-cell text-right">
                  <span className="font-mono tabular-nums text-[var(--color-fg)]">
                    {t.realSpotPrice !== null ? `$${fmtPrice(t.realSpotPrice)}` : "—"}
                  </span>
                  {t.spotSource && (
                    <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-muted)]">
                      {t.spotSource}
                    </span>
                  )}
                </Td>
                <Td className="text-right">
                  {t.premium !== null ? (
                    <span
                      className={`font-mono tabular-nums font-medium ${
                        t.premium >= 0
                          ? "text-[var(--color-green)]"
                          : "text-[var(--color-red)]"
                      }`}
                    >
                      {fmtSignedPct(t.premium)}
                    </span>
                  ) : (
                    <span className="text-[var(--color-muted)]">—</span>
                  )}
                  {t.marketOpen === false && (
                    <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-amber)]">
                      off-hours
                    </span>
                  )}
                </Td>
                <Td className="hidden sm:table-cell pr-4 text-right">
                  <a
                    href={t.tradeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 px-2 py-0.5 font-mono text-xs text-[var(--color-accent)] transition-colors duration-150 hover:border-[var(--color-accent)]/40 hover:bg-[var(--color-accent)]/10"
                  >
                    {t.tradeVenue}
                    <svg
                      className="h-3 w-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                  </a>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-[var(--color-muted)] ${className}`}
    >
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
  return <td className={`px-3 py-2.5 ${className}`}>{children}</td>;
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-line)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
      {label}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-4 border-t border-[var(--color-line)] pt-6 pb-8">
      <p className="text-xs text-[var(--color-subtle)]">
        Sources: Hyperliquid · Ostium · dYdX v4 · CoinGecko · gold-api.com · Jupiter. Not investment advice.
      </p>
    </footer>
  );
}

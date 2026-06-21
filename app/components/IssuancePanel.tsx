"use client";

import { useEffect, useState } from "react";
import { compactUsd } from "@/app/components/charts/nivoTheme";

interface IssuanceToken {
  symbol: string;
  name: string;
  chain: "Ethereum" | "Solana";
  address: string;
  underlying: string;
  supplyNow: number | null;
  supplyNowUsd: number | null;
  supply7dAgo: number | null;
  supply30dAgo: number | null;
  net7dUnits: number | null;
  net7dUsd: number | null;
  net30dUnits: number | null;
  net30dUsd: number | null;
  historyDays: number;
  source: string;
}

interface Resp { tokens: IssuanceToken[] }

type Window = "7d" | "30d";

function fmtUnits(v: number | null | undefined, decimals = 2): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

function NetChange({ units, usd, window: w }: { units: number | null | undefined; usd: number | null | undefined; window: Window }) {
  if (units == null || !isFinite(units)) {
    return (
      <span className="font-mono text-xs text-[var(--color-muted)]">
        — {w === "7d" ? "7d" : "30d"} delta pending
      </span>
    );
  }
  const pos = units >= 0;
  const sign = pos ? "+" : "−";
  const color = pos ? "var(--color-green)" : "var(--color-red)";
  return (
    <div>
      <div className="font-mono text-sm font-semibold" style={{ color }}>
        {sign}{fmtUnits(Math.abs(units))}
        <span className="ml-1 text-[10px] font-normal opacity-70">tokens</span>
      </div>
      {usd != null && isFinite(usd) && (
        <div className="font-mono text-[10px]" style={{ color }}>
          {pos ? "+" : "−"}{compactUsd(Math.abs(usd))}
        </div>
      )}
    </div>
  );
}

function ChainPill({ chain }: { chain: "Ethereum" | "Solana" }) {
  const eth = chain === "Ethereum";
  return (
    <span
      className="inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={{
        color: eth ? "#A78BFA" : "#34D399",
        borderColor: eth ? "rgba(167,139,250,.2)" : "rgba(52,211,153,.2)",
        background: eth ? "rgba(167,139,250,.05)" : "rgba(52,211,153,.05)",
      }}
    >
      {chain}
    </span>
  );
}

function HistoryNote({ days, needed }: { days: number | undefined; needed: number }) {
  if (days == null || !isFinite(days) || days >= needed) return null;
  const remaining = needed - days;
  return (
    <p className="mt-1 font-mono text-[9px] text-[var(--color-amber)]">
      accumulating — {remaining}d until {needed}d delta
    </p>
  );
}

export function IssuancePanel() {
  const [data, setData]       = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [win, setWin]         = useState<Window>("7d");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/issuance")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const tokens    = data?.tokens ?? [];
  const ethTokens = tokens.filter((t) => t.chain === "Ethereum");
  const solTokens = tokens.filter((t) => t.chain === "Solana");

  return (
    <section className="mb-12">
      {/* Section header */}
      <div className="mb-5">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="font-mono text-xs font-medium text-[var(--color-accent)]">04</span>
          <div className="h-px flex-1 bg-[var(--color-line)]" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-fg)]">
            On-Chain Issuance
          </h2>
          <div className="h-px w-6 bg-[var(--color-line)]" />
        </div>
        <p className="pl-8 text-xs text-[var(--color-muted)]">
          Net mint/burn flow derived from circulating supply snapshots — every snapshot
          records supply, so delta accumulates over time with no API key required.{" "}
          <span className="text-[var(--color-amber)]">Nobody else surfaces this.</span>
        </p>
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]">
        {/* Panel header */}
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <span className="font-mono text-xs font-semibold uppercase tracking-widest text-[var(--color-fg)]">
              ISSUANCE &amp; SUPPLY
            </span>
            <span className="ml-2 font-mono text-[10px] text-[var(--color-muted)]">
              · net mint/burn · circulating supply
            </span>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d"] as Window[]).map((w) => (
              <button
                key={w}
                onClick={() => setWin(w)}
                className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors duration-150 ${
                  win === w
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                    : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-[var(--color-muted)]">
            loading…
          </div>
        ) : tokens.length === 0 ? (
          <div className="px-4 py-10 text-center font-mono text-xs text-[var(--color-muted)]">
            no data — database required for supply history
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-line)]">

            {/* ── Ethereum gold tokens ── */}
            {ethTokens.length > 0 && (
              <div>
                <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
                  Tokenized Gold — Ethereum ERC-20
                </div>
                <div className="grid grid-cols-1 divide-y divide-[var(--color-line)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  {ethTokens.map((t) => {
                    const netUnits = win === "7d" ? t.net7dUnits : t.net30dUnits;
                    const netUsd   = win === "7d" ? t.net7dUsd   : t.net30dUsd;
                    const needed   = win === "7d" ? 7 : 30;
                    return (
                      <div key={t.symbol} className="px-5 py-4">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--color-fg)]">{t.symbol}</span>
                          <span className="text-xs text-[var(--color-muted)]">{t.name}</span>
                          <ChainPill chain={t.chain} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="mb-1 font-mono text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
                              Net {win} issuance
                            </p>
                            <NetChange units={netUnits} usd={netUsd} window={win} />
                            <HistoryNote days={t.historyDays} needed={needed} />
                          </div>
                          <div>
                            <p className="mb-1 font-mono text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
                              Supply now
                            </p>
                            {t.supplyNow != null ? (
                              <>
                                <p className="font-mono text-sm font-medium text-[var(--color-fg)]">
                                  {fmtUnits(t.supplyNow, 0)} oz
                                </p>
                                {t.supplyNowUsd !== null && (
                                  <p className="font-mono text-[10px] text-[var(--color-muted)]">
                                    {compactUsd(t.supplyNowUsd)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <p className="font-mono text-xs text-[var(--color-muted)]">—</p>
                            )}
                          </div>
                        </div>
                        <p className="mt-3 font-mono text-[9px] text-[var(--color-subtle)]">
                          source: {t.source} · {t.historyDays}d history
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Solana xStocks ── */}
            {solTokens.length > 0 && (
              <div>
                <div className="px-4 py-2 font-mono text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
                  xStocks — Solana SPL Token-2022 · {win} supply change
                </div>
                <div className="divide-y divide-[var(--color-line)]">
                  {solTokens.map((t) => {
                    const netUnits = win === "7d" ? t.net7dUnits : t.net30dUnits;
                    const netUsd   = win === "7d" ? t.net7dUsd   : t.net30dUsd;
                    const needed   = win === "7d" ? 7 : 30;
                    return (
                      <div key={t.symbol} className="grid grid-cols-[1fr_140px_180px] items-center gap-4 px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--color-fg)]">{t.symbol}</span>
                          <span className="text-xs text-[var(--color-muted)]">{t.name}</span>
                          <ChainPill chain={t.chain} />
                        </div>
                        <div>
                          <p className="mb-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-muted)]">Supply now</p>
                          <p className="font-mono text-xs font-medium text-[var(--color-fg)]">
                            {t.supplyNow !== null ? fmtUnits(t.supplyNow, 0) : "—"}
                          </p>
                          {t.supplyNowUsd !== null && (
                            <p className="font-mono text-[9px] text-[var(--color-muted)]">{compactUsd(t.supplyNowUsd)}</p>
                          )}
                        </div>
                        <div>
                          <p className="mb-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-muted)]">
                            Net {win}
                          </p>
                          <NetChange units={netUnits} usd={netUsd} window={win} />
                          <HistoryNote days={t.historyDays} needed={needed} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="px-5 py-2 font-mono text-[9px] text-[var(--color-subtle)]">
                  source: Jupiter v3 circSupplyPrescaled snapshots — delta accumulates over time
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

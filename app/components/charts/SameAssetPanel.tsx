"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ChartCard, CardToggle, CardEmpty } from "./ChartCard";
import {
  nivoTheme,
  venueColor,
  compactUsd,
  signedPct,
  reducedMotion,
  PANEL_BG,
  LINE_COLOR,
} from "./nivoTheme";

interface VenueRow {
  venue: string;
  symbol: string;
  oiUsd: number;
  vol24h: number | null;
  funding: number | null;
  markPx: number | null;
}
interface AssetResp {
  hasDatabase: boolean;
  asOf: string | null;
  label: string;
  category: string | null;
  venues: VenueRow[];
}
interface Option {
  key: string;
  label: string;
  category: string;
  venueCount: number;
}

export function SameAssetPanel() {
  const [options, setOptions] = useState<Option[]>([]);
  const [asset, setAsset] = useState<string>("gold");
  const [view, setView] = useState<"multiples" | "grouped">("multiples");
  const [data, setData] = useState<AssetResp | null>(null);

  useEffect(() => {
    fetch("/api/analytics/same-asset")
      .then((r) => r.json() as Promise<{ options: Option[] }>)
      .then((d) => {
        setOptions(d.options ?? []);
        if (d.options?.length && !d.options.some((o) => o.key === "gold")) {
          setAsset(d.options[0]!.key);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/analytics/same-asset?asset=${encodeURIComponent(asset)}`)
      .then((r) => r.json() as Promise<AssetResp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [asset]);

  const venues = data?.venues ?? [];
  // A venue can list the same canonical asset under two symbols (e.g. gold as
  // both XAU and PAXG). Disambiguate those bars by "venue·SYM" so nothing is
  // hidden or silently stacked; keep the bare venue name when it's the only one.
  const labeled = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of venues) counts.set(v.venue, (counts.get(v.venue) ?? 0) + 1);
    return venues.map((v) => ({
      ...v,
      label: (counts.get(v.venue) ?? 1) > 1 ? `${v.venue}·${v.symbol}` : v.venue,
    }));
  }, [venues]);

  const oiData = useMemo(() => labeled.map((v) => ({ venue: v.label, value: v.oiUsd })), [labeled]);
  const fundData = useMemo(
    () => labeled.filter((v) => v.funding !== null).map((v) => ({ venue: v.label, value: v.funding! })),
    [labeled],
  );
  const markData = useMemo(
    () => labeled.filter((v) => v.markPx !== null).map((v) => ({ venue: v.label, value: v.markPx! })),
    [labeled],
  );
  const groupedData = useMemo(
    () => labeled.map((v) => ({ venue: v.label, OI: v.oiUsd, "24h vol": v.vol24h ?? 0 })),
    [labeled],
  );
  const distinctVenues = useMemo(() => new Set(venues.map((v) => v.venue)).size, [venues]);

  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-sm font-bold tracking-widest text-[var(--color-fg)]">
          <span className="text-[var(--color-muted)]">03 /</span> SAME ASSET, EVERY VENUE
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          One underlying compared across the venues that list it — OI, funding, and mark price
          side by side. Symbols are unified across venues (gold = XAU/GOLD/PAXG, etc.).
          <span className="text-[var(--color-amber)]"> Nobody else aggregates this.</span>
        </p>
      </div>

      <ChartCard
        title={`${data?.label ?? asset.toUpperCase()}`}
        badge={data?.category ?? undefined}
        right={
          <>
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-0.5 text-xs text-[var(--color-fg)]"
              aria-label="select asset"
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} ({o.venueCount})
                </option>
              ))}
            </select>
            <CardToggle on={view === "multiples"} onClick={() => setView("multiples")}>small multiples</CardToggle>
            <CardToggle on={view === "grouped"} onClick={() => setView("grouped")}>grouped</CardToggle>
          </>
        }
        caption={
          venues.length
            ? `${venues.length} listing${venues.length === 1 ? "" : "s"} across ${distinctVenues} venue${distinctVenues === 1 ? "" : "s"} (a venue may list it under two symbols, e.g. XAU + PAXG). funding/mark omitted where a venue doesn't expose them.`
            : undefined
        }
        source={data?.asOf ? `source: EWA perp_snapshots · as of ${new Date(data.asOf).toLocaleString("en-US", { hour12: false })}` : undefined}
      >
        {!data ? (
          <CardEmpty msg="loading…" />
        ) : venues.length === 0 ? (
          <CardEmpty msg="no venues list this asset in the latest snapshot" />
        ) : view === "multiples" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniBar title="Open interest" data={oiData} fmt={(v) => compactUsd(v)} />
            <MiniBar title="Funding (hourly)" data={fundData} fmt={(v) => signedPct(v, 4)} signed />
            <MiniBar title="Mark price" data={markData} fmt={(v) => compactUsd(v)} />
          </div>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveBar
              data={groupedData}
              keys={["OI", "24h vol"]}
              indexBy="venue"
              groupMode="grouped"
              theme={nivoTheme}
              colors={({ id }) => (id === "OI" ? "#46e39b" : "#f5b13d")}
              valueFormat={(v) => compactUsd(v)}
              margin={{ top: 8, right: 8, bottom: 64, left: 56 }}
              padding={0.25}
              innerPadding={2}
              axisBottom={{ tickRotation: -30 }}
              axisLeft={{ format: (v: number) => compactUsd(v) }}
              enableLabel={false}
              animate={!reducedMotion()}
              tooltip={({ id, value, indexValue }) => (
                <Tip>
                  <strong>{String(indexValue)}</strong>
                  <div>{String(id)}: {compactUsd(Number(value))}</div>
                </Tip>
              )}
            />
            <div className="mt-1 flex gap-3 text-[10px] text-[var(--color-muted)]">
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#46e39b" }} />OI</span>
              <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "#f5b13d" }} />24h vol</span>
            </div>
          </div>
        )}
      </ChartCard>
    </section>
  );
}

function MiniBar({
  title,
  data,
  fmt,
  signed,
}: {
  title: string;
  data: { venue: string; value: number }[];
  fmt: (v: number) => string;
  signed?: boolean;
}) {
  return (
    <div className="border border-[var(--color-line)] p-2">
      <p className="mb-1 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">{title}</p>
      {data.length === 0 ? (
        <div className="px-2 py-8 text-center text-[10px] text-[var(--color-muted)]">not exposed</div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveBar
            data={data}
            keys={["value"]}
            indexBy="venue"
            theme={nivoTheme}
            colors={(d) => venueColor(String(d.indexValue).split("·")[0]!)}
            valueFormat={fmt}
            margin={{ top: 6, right: 6, bottom: 58, left: 50 }}
            padding={0.3}
            axisBottom={{ tickRotation: -40 }}
            axisLeft={{ format: (v: number) => fmt(Number(v)), tickValues: 4 }}
            enableLabel={false}
            valueScale={signed ? { type: "linear" } : { type: "linear", min: 0 }}
            animate={!reducedMotion()}
            tooltip={({ value, indexValue }) => (
              <Tip>
                <strong>{String(indexValue)}</strong>
                <div>{title}: {fmt(Number(value))}</div>
              </Tip>
            )}
          />
        </div>
      )}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: PANEL_BG, border: `1px solid ${LINE_COLOR}`, padding: "6px 8px", fontSize: 11, color: "#c9d4cf" }}>
      {children}
    </div>
  );
}

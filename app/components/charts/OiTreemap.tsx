"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveTreeMap } from "@nivo/treemap";
import { ChartCard, CardToggle, CardEmpty } from "./ChartCard";
import {
  nivoTheme,
  classColor,
  compactUsd,
  reducedMotion,
  PANEL_BG,
  LINE_COLOR,
  MUTED_TEXT,
} from "./nivoTheme";

interface MarketRow {
  venue: string;
  symbol: string;
  category: string;
  oiUsd: number;
  vol24h: number | null;
}
interface Resp {
  hasDatabase: boolean;
  asOf: string | null;
  markets: MarketRow[];
}

// Hierarchy datum for Nivo. Parents carry children; leaves carry value. Every
// node carries a precomputed color + the attribution fields for the tooltip.
interface TreeDatum {
  id: string;
  name: string;
  color: string;
  venue?: string;
  klass?: string;
  value?: number;
  children?: TreeDatum[];
}

const CAP_PER_GROUP = 10; // top markets per venue→class, rest folded into "others"

function build(markets: MarketRow[], metric: "oi" | "vol", rwaOnly: boolean): TreeDatum {
  const val = (m: MarketRow) => (metric === "vol" ? (m.vol24h ?? 0) : m.oiUsd);
  const rows = markets.filter((m) => (rwaOnly ? m.category !== "crypto" : true) && val(m) > 0);

  // venue -> class -> markets
  const byVenue = new Map<string, Map<string, MarketRow[]>>();
  for (const m of rows) {
    let byClass = byVenue.get(m.venue);
    if (!byClass) {
      byClass = new Map<string, MarketRow[]>();
      byVenue.set(m.venue, byClass);
    }
    let arr = byClass.get(m.category);
    if (!arr) {
      arr = [];
      byClass.set(m.category, arr);
    }
    arr.push(m);
  }

  const venues: TreeDatum[] = [];
  for (const [venue, byClass] of byVenue) {
    const classNodes: TreeDatum[] = [];
    for (const [klass, ms] of byClass) {
      // Aggregate same-symbol markets within a venue+class: a venue can list the
      // same underlying in several contracts (Aster ETHUSDT/ETHUSD1, Ostium
      // USD-base FX before the adapter fix), which would otherwise produce
      // duplicate tile ids. Sum their value into one tile.
      const bySym = new Map<string, number>();
      for (const m of ms) bySym.set(m.symbol, (bySym.get(m.symbol) ?? 0) + val(m));
      const sorted = [...bySym.entries()]
        .map(([symbol, v]) => ({ symbol, v }))
        .sort((a, b) => b.v - a.v);
      const top = sorted.slice(0, CAP_PER_GROUP);
      const rest = sorted.slice(CAP_PER_GROUP);
      const leaves: TreeDatum[] = top.map((s) => ({
        id: `${venue}/${klass}/${s.symbol}`,
        name: s.symbol,
        color: classColor(klass),
        venue,
        klass,
        value: s.v,
      }));
      if (rest.length) {
        leaves.push({
          id: `${venue}/${klass}/others`,
          name: `+${rest.length} more`,
          color: classColor(klass),
          venue,
          klass,
          value: rest.reduce((s, r) => s + r.v, 0),
        });
      }
      if (leaves.length) {
        classNodes.push({
          id: `${venue}/${klass}`,
          name: klass,
          color: classColor(klass),
          children: leaves,
        });
      }
    }
    if (classNodes.length) {
      venues.push({ id: venue, name: venue, color: PANEL_BG, children: classNodes });
    }
  }
  return { id: "root", name: "all", color: "transparent", children: venues };
}

export function OiTreemap() {
  const [data, setData] = useState<Resp | null>(null);
  const [metric, setMetric] = useState<"oi" | "vol">("oi");
  const [rwaOnly, setRwaOnly] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/treemap")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const tree = useMemo(
    () => (data ? build(data.markets, metric, rwaOnly) : null),
    [data, metric, rwaOnly],
  );
  const hasLeaves = !!tree?.children?.length;

  return (
    <ChartCard
      title="OI / VOLUME TREEMAP"
      badge={`${metric === "oi" ? "open interest" : "24h volume"} · venue → class → market`}
      desc="Every tracked market sized by value, nested by venue then asset class. Tiles colored by class."
      right={
        <>
          <CardToggle on={metric === "oi"} onClick={() => setMetric("oi")}>OI</CardToggle>
          <CardToggle on={metric === "vol"} onClick={() => setMetric("vol")}>24h vol</CardToggle>
          <CardToggle on={rwaOnly} onClick={() => setRwaOnly((v) => !v)}>RWA only</CardToggle>
        </>
      }
      caption={`top ${CAP_PER_GROUP} markets per venue+class shown; the rest folded into "+N more". ${
        data?.asOf ? `as of ${new Date(data.asOf).toLocaleString("en-US", { hour12: false })}` : ""
      }`}
      source="source: RWA perp_snapshots (latest slice)"
    >
      {!data ? (
        <CardEmpty msg="loading…" />
      ) : !hasLeaves ? (
        <CardEmpty msg={metric === "vol" ? "no 24h volume reported for this filter" : "no markets for this filter"} />
      ) : (
        <div className="h-[260px] sm:h-[380px] md:h-[420px]">
          <ResponsiveTreeMap
            data={tree as TreeDatum}
            identity="id"
            value="value"
            valueFormat={(v) => compactUsd(v)}
            theme={nivoTheme}
            tile="squarify"
            leavesOnly={false}
            innerPadding={2}
            outerPadding={3}
            colors={(node) => node.data.color}
            nodeOpacity={0.92}
            borderWidth={1}
            borderColor={LINE_COLOR}
            enableParentLabel
            parentLabelSize={16}
            parentLabelPosition="top"
            parentLabelTextColor={MUTED_TEXT}
            label={(node) => node.data.name}
            labelSkipSize={42}
            labelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
            orientLabel={false}
            animate={!reducedMotion()}
            motionConfig="gentle"
            tooltip={({ node }) => (
              <div
                style={{
                  background: PANEL_BG,
                  border: `1px solid ${LINE_COLOR}`,
                  padding: "6px 8px",
                  fontSize: 11,
                }}
              >
                <strong>{node.data.name}</strong>
                {node.data.venue && (
                  <div style={{ color: MUTED_TEXT }}>
                    {node.data.venue} · {node.data.klass}
                  </div>
                )}
                <div>{metric === "oi" ? "OI" : "24h vol"}: {node.formattedValue}</div>
              </div>
            )}
          />
        </div>
      )}
    </ChartCard>
  );
}

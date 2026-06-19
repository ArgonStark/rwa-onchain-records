"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveBump } from "@nivo/bump";
import { ChartCard, CardEmpty } from "./ChartCard";
import { nivoTheme, venueColor, compactUsd, reducedMotion, MUTED_TEXT, PANEL_BG, LINE_COLOR } from "./nivoTheme";

interface SeriePoint {
  x: string;
  rank: number;
  oiUsd: number;
}
interface Serie {
  venue: string;
  points: SeriePoint[];
}
interface Resp {
  hasDatabase: boolean;
  buckets: string[];
  series: Serie[];
}

export function VenueRankBump() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/venue-rank?days=30")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // OI lookup for the tooltip, keyed venue|day.
  const oiLookup = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data?.series ?? [])
      for (const p of s.points) m.set(`${s.venue}|${p.x}`, p.oiUsd);
    return m;
  }, [data]);

  const bumpData = useMemo(
    () =>
      (data?.series ?? []).map((s) => ({
        id: s.venue,
        data: s.points.map((p) => ({ x: p.x, y: p.rank })),
      })),
    [data],
  );

  const buckets = data?.buckets.length ?? 0;

  return (
    <ChartCard
      title="VENUE RANK BY RWA OI"
      badge={`${data?.series.length ?? 0} venues · daily`}
      desc="Each line is a venue, ranked 1..N by total non-crypto (RWA) open interest at the last snapshot of each UTC day. Watch venues trade places."
      caption={
        buckets > 0 && buckets < 3
          ? `limited snapshot history — ${buckets} daily bucket${buckets === 1 ? "" : "s"} so far; rank movement becomes meaningful as more days accumulate.`
          : undefined
      }
      source="source: EWA perp_snapshots (last snapshot per UTC day, category ≠ crypto)"
    >
      {!data ? (
        <CardEmpty msg="loading…" />
      ) : bumpData.length === 0 || buckets === 0 ? (
        <CardEmpty msg="no snapshot history yet" />
      ) : (
        <div style={{ height: 320 }}>
          <ResponsiveBump
            data={bumpData}
            theme={nivoTheme}
            colors={(serie) => venueColor(String(serie.id))}
            lineWidth={2}
            activeLineWidth={4}
            inactiveLineWidth={2}
            inactiveOpacity={0.3}
            pointSize={8}
            activePointSize={12}
            inactivePointSize={5}
            pointBorderWidth={2}
            pointBorderColor={{ from: "serie.color" }}
            interpolation="smooth"
            margin={{ top: 24, right: 120, bottom: 36, left: 44 }}
            startLabel={false}
            endLabel={(serie) => String(serie.id)}
            endLabelPadding={10}
            axisTop={null}
            axisRight={null}
            axisBottom={{ tickRotation: 0, legend: "", legendOffset: 32 }}
            axisLeft={{ legend: "rank", legendPosition: "middle", legendOffset: -36 }}
            animate={!reducedMotion()}
            pointTooltip={({ point }) => {
              const venue = String(point.serie.id);
              const day = String(point.data.x);
              const oi = oiLookup.get(`${venue}|${day}`);
              return (
                <div
                  style={{
                    background: PANEL_BG,
                    border: `1px solid ${LINE_COLOR}`,
                    padding: "6px 8px",
                    fontSize: 11,
                  }}
                >
                  <strong>{venue}</strong>
                  <div style={{ color: MUTED_TEXT }}>{day}</div>
                  <div>rank #{point.data.y} · RWA OI {oi !== undefined ? compactUsd(oi) : "—"}</div>
                </div>
              );
            }}
          />
        </div>
      )}
    </ChartCard>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveStream } from "@nivo/stream";
import { ChartCard, CardToggle, CardEmpty, ChartLegend } from "./ChartCard";
import { nivoTheme, classColor, compactUsd, reducedMotion, CLASS_COLOR } from "./nivoTheme";

interface Point {
  t: number;
  equity: number;
  commodity: number;
  index: number;
  forex: number;
  crypto: number;
}
interface Resp {
  hasDatabase: boolean;
  metric: "oi" | "vol";
  days: number;
  points: Point[];
}

type ClassKey = "equity" | "commodity" | "index" | "forex" | "crypto";
const RWA_KEYS: ClassKey[] = ["equity", "commodity", "index", "forex"];

export function ClassShareStream() {
  const [metric, setMetric] = useState<"oi" | "vol">("oi");
  const [withCrypto, setWithCrypto] = useState(false); // RWA-only by default
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    fetch(`/api/analytics/class-share?metric=${metric}&days=${days}`)
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [metric, days]);

  const keys = useMemo<ClassKey[]>(
    () => (withCrypto ? [...RWA_KEYS, "crypto"] : [...RWA_KEYS]),
    [withCrypto],
  );

  // Strip timestamps into a parallel array — Nivo stream is index-based; we label
  // the axis with the real snapshot times at a few ticks.
  const points = data?.points ?? [];
  const times = useMemo(() => points.map((p) => p.t), [points]);
  const streamData = useMemo(
    () =>
      points.map((p) => ({
        equity: p.equity,
        commodity: p.commodity,
        index: p.index,
        forex: p.forex,
        crypto: p.crypto,
      })),
    [points],
  );

  // sparse, evenly-spaced ticks
  const tickValues = useMemo(() => {
    const n = streamData.length;
    if (n <= 1) return [0];
    const step = Math.max(1, Math.floor(n / 5));
    const t: number[] = [];
    for (let i = 0; i < n; i += step) t.push(i);
    if (t[t.length - 1] !== n - 1) t.push(n - 1);
    return t;
  }, [streamData.length]);

  const fmtTick = (i: number) => {
    const ts = times[i];
    if (ts === undefined) return "";
    return new Date(ts * 1000).toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: false,
    });
  };

  const coverage =
    times.length > 1
      ? `${new Date(times[0]! * 1000).toLocaleDateString("en-US")} → ${new Date(
          times[times.length - 1]! * 1000,
        ).toLocaleDateString("en-US")}`
      : "—";

  return (
    <ChartCard
      title="ASSET-CLASS SHARE OVER TIME"
      badge={`${metric === "oi" ? "OI" : "24h vol"} share · ${withCrypto ? "RWA + crypto" : "RWA only"}`}
      desc="Share of open interest (or volume) by asset class across our snapshots. Bands sum to 100% — they show composition, not absolute size."
      right={
        <>
          <CardToggle on={metric === "oi"} onClick={() => setMetric("oi")}>OI</CardToggle>
          <CardToggle on={metric === "vol"} onClick={() => setMetric("vol")}>24h vol</CardToggle>
          <CardToggle on={withCrypto} onClick={() => setWithCrypto((v) => !v)}>+ crypto</CardToggle>
          <CardToggle on={days === 7} onClick={() => setDays(7)}>7d</CardToggle>
          <CardToggle on={days === 30} onClick={() => setDays(30)}>30d</CardToggle>
        </>
      }
      caption={`x = successive snapshots (not linear time); spacing is by snapshot, gaps omitted. coverage ${coverage}, ${streamData.length} snapshots.`}
      source="source: EWA perp_snapshots"
    >
      <ChartLegend items={keys.map((k) => ({ label: k, color: CLASS_COLOR[k] ?? "#c9d4cf" }))} />
      {!data ? (
        <CardEmpty msg="loading…" />
      ) : streamData.length < 2 ? (
        <CardEmpty msg="need ≥2 snapshots to draw a share trend — building history" />
      ) : (
        <div style={{ height: 300 }}>
          <ResponsiveStream
            data={streamData}
            keys={keys}
            theme={nivoTheme}
            offsetType="expand"
            order="insideOut"
            colors={(layer) => classColor(String(layer.id))}
            fillOpacity={0.82}
            borderWidth={0}
            valueFormat={(v) => compactUsd(v)}
            margin={{ top: 8, right: 8, bottom: 42, left: 40 }}
            axisBottom={{
              tickValues,
              format: (i: number) => fmtTick(i),
              tickRotation: -35,
            }}
            axisLeft={{
              format: (v: number) => `${Math.round(v * 100)}%`,
              tickValues: [0, 0.25, 0.5, 0.75, 1],
            }}
            enableGridX={false}
            enableGridY
            animate={!reducedMotion()}
            motionConfig="gentle"
          />
        </div>
      )}
    </ChartCard>
  );
}

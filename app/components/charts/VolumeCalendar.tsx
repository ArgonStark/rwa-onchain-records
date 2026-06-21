"use client";

import { useEffect, useMemo, useState } from "react";
import { ResponsiveCalendar } from "@nivo/calendar";
import { ChartCard, CardEmpty } from "./ChartCard";
import { nivoTheme, classColor, compactUsd, INK_BG, LINE_COLOR, PANEL_BG } from "./nivoTheme";

interface Day {
  day: string;
  byClass: Record<string, number>;
  total: number;
  rwa: number;
}
interface Resp {
  hasDatabase: boolean;
  from: string | null;
  to: string | null;
  days: Day[];
}

type Sel = "rwa" | "total" | "equity" | "commodity" | "index" | "forex" | "crypto";

const SELECTS: { key: Sel; label: string }[] = [
  { key: "rwa", label: "RWA total" },
  { key: "total", label: "All" },
  { key: "equity", label: "Equity" },
  { key: "commodity", label: "Commodity" },
  { key: "index", label: "Index" },
  { key: "forex", label: "Forex" },
  { key: "crypto", label: "Crypto" },
];

// 5-stop dark→bright ramp from a class hex, mixed toward the ink background.
function ramp(hex: string): string[] {
  const m = (t: number) => mixHex(hex, INK_BG, t);
  return [m(0.82), m(0.6), m(0.4), m(0.18), hex];
}
function mixHex(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  const c = (i: number) => Math.round(pa[i]! * (1 - t) + pb[i]! * t);
  return `#${[c(0), c(1), c(2)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}
function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function colorFor(sel: Sel): string {
  if (sel === "rwa" || sel === "total") return "#34D399";
  return classColor(sel);
}

export function VolumeCalendar() {
  const [data, setData] = useState<Resp | null>(null);
  const [sel, setSel] = useState<Sel>("rwa");

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/calendar?days=365")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const value = (d: Day): number =>
    sel === "rwa" ? d.rwa : sel === "total" ? d.total : (d.byClass[sel] ?? 0);

  const calData = useMemo(
    () =>
      (data?.days ?? [])
        .map((d) => ({ day: d.day, value: value(d) }))
        .filter((d) => d.value > 0),
    [data, sel],
  );

  const colors = useMemo(() => ramp(colorFor(sel)), [sel]);
  const showWeekendNote = sel !== "crypto";

  return (
    <ChartCard
      title="DAILY NOTIONAL — CALENDAR"
      badge={`${SELECTS.find((s) => s.key === sel)?.label.toLowerCase()} · UTC days`}
      desc="One cell per UTC day, shaded by notional traded. Only days we have a record for are filled."
      right={
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value as Sel)}
          className="cursor-pointer rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-fg)] transition-colors duration-150 hover:border-[var(--color-line-strong)] focus:border-[var(--color-accent)] focus:outline-none"
          aria-label="select asset class"
        >
          {SELECTS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      }
      caption={
        showWeekendNote
          ? "Weekend dip is real: RWA notional falls Sat/Sun because the underlying TradFi markets are closed — a weekly rhythm crypto doesn't have."
          : "Crypto trades 24/7 — no weekend dip, unlike the RWA classes."
      }
      source={data ? `source: RWA daily_volume · ${data.from ?? "—"} → ${data.to ?? "—"}` : undefined}
    >
      {!data ? (
        <CardEmpty msg="loading…" />
      ) : !data.from || !data.to || calData.length === 0 ? (
        <CardEmpty msg="no daily volume recorded for this class" />
      ) : (
        <div className="overflow-x-auto">
          <div style={{ height: 220, minWidth: 720 }}>
            <ResponsiveCalendar
              data={calData}
              from={data.from}
              to={data.to}
              theme={nivoTheme}
              colors={colors}
              emptyColor={PANEL_BG}
              margin={{ top: 16, right: 8, bottom: 8, left: 24 }}
              direction="horizontal"
              yearSpacing={28}
              monthBorderColor={LINE_COLOR}
              dayBorderWidth={1}
              dayBorderColor={INK_BG}
              valueFormat={(v) => compactUsd(Number(v))}
              tooltip={(d) => (
                <div
                  style={{
                    background: PANEL_BG,
                    border: `1px solid ${LINE_COLOR}`,
                    padding: "4px 8px",
                    fontSize: 11,
                  }}
                >
                  <strong>{d.day}</strong> · {compactUsd(Number(d.value))}
                </div>
              )}
            />
          </div>
        </div>
      )}
    </ChartCard>
  );
}

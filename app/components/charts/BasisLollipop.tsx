"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartCard, CardEmpty } from "./ChartCard";
import { LINE_COLOR, MUTED_TEXT, signedPct } from "./nivoTheme";

// F — perp-spot basis lollipop. SCAFFOLD: built against the Phase-5 data
// contract; until basis is computed the endpoint returns empty + a pending
// status and we render that state (never fake values). One dot per asset, line
// length = basis off a zero line, green if perp > spot, red if perp < spot.
interface BasisItem {
  asset: string;
  basisPct: number; // (perpMark / spotToken - 1)
  perpVenue: string;
  spotVenue: string;
}
interface Resp {
  status: string;
  items: BasisItem[];
}

const POS = "#46e39b";
const NEG = "#ff5c5c";

export function BasisLollipop() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/analytics/basis")
      .then((r) => r.json() as Promise<Resp>)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const pending = !data || data.items.length === 0;
  const maxAbs = useMemo(() => {
    const m = Math.max(0.001, ...(data?.items ?? []).map((i) => Math.abs(i.basisPct)));
    return m;
  }, [data]);

  return (
    <ChartCard
      title="PERP – SPOT BASIS"
      badge="perp mark vs spot token"
      desc="basis = perp mark ÷ spot token − 1. Positive (green) = perp rich; negative (red) = perp cheap. One lollipop per asset off the zero line."
      caption={
        pending
          ? data?.status ?? "pending: basis not yet computed (Phase 5)"
          : "perp leg = deepest (highest-OI) venue; spot leg = the on-chain token price. only pairs whose perp mark is within ~10% of the token price (guards against index-level vs ETF-scale and same-name memecoins)."
      }
      source="source: EWA perp_snapshots × token_snapshots (latest slice)"
    >
      {pending ? (
        <CardEmpty msg={data?.status ?? "pending: basis not yet computed (Phase 5)"} />
      ) : (
        <Lollipops items={data!.items} maxAbs={maxAbs} />
      )}
    </ChartCard>
  );
}

function Lollipops({ items, maxAbs }: { items: BasisItem[]; maxAbs: number }) {
  const rowH = 26;
  const padX = 90; // label gutter
  const padR = 56; // value gutter
  const height = items.length * rowH + 16;
  // viewBox width is virtual; SVG scales to container. Center x = zero line.
  const W = 600;
  const zeroX = padX + (W - padX - padR) / 2;
  const halfSpan = (W - padX - padR) / 2;
  const x = (pct: number) => zeroX + (pct / maxAbs) * halfSpan;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img" aria-label="perp-spot basis by asset">
        {/* zero line */}
        <line x1={zeroX} y1={8} x2={zeroX} y2={height - 8} stroke={LINE_COLOR} strokeWidth={1} />
        <text x={zeroX} y={height - 1} fill={MUTED_TEXT} fontSize={9} textAnchor="middle">0%</text>
        {items.map((it, i) => {
          const cy = 14 + i * rowH;
          const cx = x(it.basisPct);
          const color = it.basisPct >= 0 ? POS : NEG;
          return (
            <g key={it.asset}>
              <text x={padX - 8} y={cy + 3} fill="#c9d4cf" fontSize={11} textAnchor="end">{it.asset}</text>
              <line x1={zeroX} y1={cy} x2={cx} y2={cy} stroke={color} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={4} fill={color} />
              <text x={cx + (it.basisPct >= 0 ? 8 : -8)} y={cy + 3} fill={color} fontSize={10}
                textAnchor={it.basisPct >= 0 ? "start" : "end"}>
                {signedPct(it.basisPct, 2)}
              </text>
              <title>{`${it.asset}: ${signedPct(it.basisPct, 2)} — perp ${it.perpVenue} vs spot ${it.spotVenue}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

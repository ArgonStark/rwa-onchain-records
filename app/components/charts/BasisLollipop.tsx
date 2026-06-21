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

const POS = "#34D399"; // emerald-400
const NEG = "#F87171"; // red-400

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
      source="source: RWA perp_snapshots × token_snapshots (latest slice)"
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
        <line x1={zeroX} y1={4} x2={zeroX} y2={height - 10} stroke={LINE_COLOR} strokeWidth={1} strokeDasharray="3 2" />
        <text x={zeroX} y={height - 1} fill={MUTED_TEXT} fontSize={9} textAnchor="middle" fontFamily="'JetBrains Mono', ui-monospace, monospace">0%</text>
        {items.map((it, i) => {
          const cy = 14 + i * rowH;
          const cx = x(it.basisPct);
          const color = it.basisPct >= 0 ? POS : NEG;
          // For very-negative bars the dot lands near the left gutter and the
          // value label (normally left of the dot) would crash into the asset
          // name. Flip it to the right of the dot when that would happen.
          const flipLabel = it.basisPct < 0 && cx < padX + 60;
          const valX = flipLabel ? cx + 10 : (it.basisPct >= 0 ? cx + 10 : cx - 10);
          const valAnchor = (it.basisPct >= 0 || flipLabel) ? "start" : "end";
          return (
            <g key={it.asset}>
              <rect x={0} y={cy - rowH / 2 + 1} width={W} height={rowH - 2} fill={i % 2 === 0 ? "rgba(30,41,59,0.3)" : "transparent"} rx={2} />
              <text x={padX - 8} y={cy + 4} fill="#F1F5F9" fontSize={11} textAnchor="end" fontFamily="'Inter', system-ui, sans-serif">{it.asset}</text>
              <line x1={zeroX} y1={cy} x2={cx} y2={cy} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
              <circle cx={cx} cy={cy} r={5} fill={color} fillOpacity={0.9} />
              <circle cx={cx} cy={cy} r={2} fill="#0F172A" />
              <text x={valX} y={cy + 4} fill={color} fontSize={10}
                textAnchor={valAnchor}
                fontFamily="'JetBrains Mono', ui-monospace, monospace">
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

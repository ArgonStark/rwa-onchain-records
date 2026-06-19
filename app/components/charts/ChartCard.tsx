"use client";

import type { ReactNode } from "react";

// Shared panel chrome for the Nivo analytical charts — matches the dashboard's
// bordered-panel look (see AggregatePanel). Title + optional badge, a slot for
// toggles on the right, the chart body, and an optional caption/source line.
export function ChartCard({
  title,
  badge,
  desc,
  right,
  children,
  caption,
  source,
}: {
  title: string;
  badge?: string;
  desc?: string;
  right?: ReactNode;
  children: ReactNode;
  caption?: ReactNode;
  source?: ReactNode;
}) {
  return (
    <div className="mb-6 border border-[var(--color-line)] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wide text-[var(--color-fg)]">
          {title}
          {badge && <span className="ml-1 text-[var(--color-muted)]">· {badge}</span>}
        </h3>
        {right && <div className="flex flex-wrap gap-1.5 text-xs">{right}</div>}
      </div>
      {desc && <p className="mb-2 text-[11px] leading-snug text-[var(--color-muted)]">{desc}</p>}
      {children}
      {caption && <p className="mt-1 text-[10px] leading-snug text-[var(--color-muted)]">{caption}</p>}
      {source && <p className="mt-1 text-[10px] text-[var(--color-muted)]">{source}</p>}
    </div>
  );
}

export function CardToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`border px-2 py-0.5 ${
        on
          ? "border-[var(--color-green)] text-[var(--color-green)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

export function CardEmpty({ msg = "no data yet" }: { msg?: string }) {
  return (
    <div className="border border-dashed border-[var(--color-line)] px-3 py-10 text-center text-xs text-[var(--color-muted)]">
      {msg}
    </div>
  );
}

// Legend chip row reused by several charts.
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            style={{ background: it.color }}
            className="inline-block h-2 w-2 rounded-full"
          />
          <span className="text-[var(--color-muted)]">{it.label}</span>
        </span>
      ))}
    </div>
  );
}

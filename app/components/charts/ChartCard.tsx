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
    <div className="mb-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-fg)]">
          {title}
          {badge && (
            <span className="ml-2 font-normal normal-case tracking-normal text-[var(--color-muted)]">
              · {badge}
            </span>
          )}
        </h3>
        {right && <div className="flex flex-wrap gap-1.5 text-xs">{right}</div>}
      </div>
      {desc && (
        <p className="mb-3 text-xs leading-relaxed text-[var(--color-muted)]">{desc}</p>
      )}
      {children}
      {caption && (
        <p className="mt-2 font-mono text-[10px] leading-snug text-[var(--color-muted)]">
          {caption}
        </p>
      )}
      {source && (
        <p className="mt-1 font-mono text-[10px] text-[var(--color-subtle)]">{source}</p>
      )}
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
      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 ${
        on
          ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-fg)]"
      }`}
    >
      {children}
    </button>
  );
}

export function CardEmpty({ msg = "No data yet" }: { msg?: string }) {
  return (
    <div className="rounded border border-dashed border-[var(--color-line)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
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

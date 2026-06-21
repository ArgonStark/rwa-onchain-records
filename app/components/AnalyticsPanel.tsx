"use client";

import { OiTreemap } from "./charts/OiTreemap";
import { ClassShareStream } from "./charts/ClassShareStream";
import { EcosystemLeaderboard } from "./charts/EcosystemLeaderboard";
import { BasisLollipop } from "./charts/BasisLollipop";

export function AnalyticsPanel() {
  return (
    <section className="mb-12">
      <div className="mb-5">
        <div className="mb-1.5 flex items-center gap-3">
          <span className="font-mono text-xs font-medium text-[var(--color-accent)]">
            ✦
          </span>
          <div className="h-px flex-1 bg-[var(--color-line)]" />
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-fg)]">
            Analytical Views
          </h2>
          <div className="h-px w-6 bg-[var(--color-line)]" />
        </div>
        <p className="pl-8 text-xs text-[var(--color-muted)]">
          Original cross-venue analytics on our owned record — composition,
          share, rhythm, and venue rank. Captions flag where history is still
          thin; nothing is interpolated.
        </p>
      </div>

      <OiTreemap />
      <ClassShareStream />
      <EcosystemLeaderboard />
      <BasisLollipop />
    </section>
  );
}

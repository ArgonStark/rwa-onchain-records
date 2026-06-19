"use client";

import { OiTreemap } from "./charts/OiTreemap";
import { ClassShareStream } from "./charts/ClassShareStream";
import { VolumeCalendar } from "./charts/VolumeCalendar";
import { VenueRankBump } from "./charts/VenueRankBump";
import { BasisLollipop } from "./charts/BasisLollipop";

// Deep analytical views (Nivo). Sits under the market-overview strip; the
// price/OI detail panels still use lightweight-charts. Each chart fetches its
// own slice and degrades to a caption/empty state when history is too thin.
export function AnalyticsPanel() {
  return (
    <section className="mb-10">
      <div className="mb-3">
        <h2 className="text-sm font-bold tracking-widest text-[var(--color-fg)]">
          <span className="text-[var(--color-muted)]">✦ /</span> ANALYTICAL VIEWS
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Original cross-venue analytics on our owned record — composition, share, rhythm,
          and venue rank. Captions flag where history is still thin; nothing is interpolated.
        </p>
      </div>

      <OiTreemap />
      <ClassShareStream />
      <VolumeCalendar />
      <VenueRankBump />
      <BasisLollipop />
    </section>
  );
}

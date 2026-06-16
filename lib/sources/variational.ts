import type { VenueResult } from "../types";

// Variational (Omni — RFQ perp protocol). Its RWA markets (gold/silver/copper/
// WTI, expanding into stocks/FX) are live, but a PUBLIC market-data/trading API
// is still forthcoming — it was on the 2026 roadmap and is not released yet.
//
// Checked 2026-06-16: docs.variational.io documents the protocol/Omni/Pro only,
// with no public REST/GraphQL market-data endpoints; candidate API hosts
// (api.variational.io, api.omni.variational.io, app.variational.io/api) do not
// resolve/respond. Per project rules we do NOT fabricate data — this adapter is
// a normalized placeholder returning zero markets with status "pending", so the
// venue slots into the aggregate + health strip the instant a public API ships.
//
// To wire it when the API lands: discover the markets/ticker/OI/funding
// endpoints via a real call, normalize into PerpMarket exactly like the other
// sources (classify each symbol via lib/classify.ts), and flip the body below.

const VENUE = "Variational";

export async function getVariationalPerps(): Promise<VenueResult> {
  return {
    venue: VENUE,
    status: "pending",
    markets: [],
    error: "pending: public market-data API not released yet",
  };
}

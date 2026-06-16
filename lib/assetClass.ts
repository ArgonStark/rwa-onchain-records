import { classify } from "./classify";
import type { AssetCategory } from "./types";

// Asset class for a (venue, symbol). Thin wrapper over the shared classifier so
// callers that only have (venue, symbol) — e.g. the daily-volume seeder — tag
// consistently with the live source adapters.
export function categoryFor(venue: string, symbol: string): AssetCategory {
  return classify(symbol, venue);
}

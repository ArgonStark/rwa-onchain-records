// Back-compat shim. The real logic now lives in lib/classify.ts (the shared
// classifier every source runs through). Kept so existing imports keep working.
import { classify } from "./classify";
import type { AssetCategory } from "./types";

export { stripPrefix } from "./classify";

/** @deprecated use classify(symbol, venue) from lib/classify.ts */
export function classifySymbol(raw: string): AssetCategory {
  return classify(raw);
}

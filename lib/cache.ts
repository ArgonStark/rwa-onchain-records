// In-memory TTL cache (Phase 1 — no database). One process-wide store.
// Add Postgres only when we start storing historical series ourselves.

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Return a cached value if fresh, otherwise run `fn`, cache, and return it.
 * In-flight requests are NOT deduped — fine for Phase 1's low traffic.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }
  const value = await fn();
  store.set(key, { value, expires: Date.now() + ttlMs });
  return value;
}

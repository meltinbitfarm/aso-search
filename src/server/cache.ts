import { LRUCache } from "lru-cache";

// 48h default: autosuggest-backed popularity adds ~6 API calls per keyword
// and these signals change very slowly. A longer cache window makes
// batched checks cheap and gentle on Apple.
const ttl = Number(process.env.CACHE_TTL_MS ?? 172_800_000);
const max = Number(process.env.CACHE_MAX_ENTRIES ?? 2000);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CacheValue = {};

export const cache = new LRUCache<string, CacheValue>({ max, ttl });

export function cacheKey(parts: Array<string | number | undefined>): string {
  return parts.filter((p) => p !== undefined).join(":");
}

export async function withCache<T extends CacheValue>(
  key: string,
  ttlMs: number | undefined,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = cache.get(key) as T | undefined;
  if (hit !== undefined) return hit;
  const value = await loader();
  cache.set(key, value, ttlMs !== undefined ? { ttl: ttlMs } : undefined);
  return value;
}

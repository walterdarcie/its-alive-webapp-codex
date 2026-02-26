type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const globalCache = new Map<string, CacheEntry<unknown>>();

export function getCacheValue<T>(key: string): T | null {
  const hit = globalCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    globalCache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCacheValue<T>(key: string, value: T, ttlMs: number) {
  globalCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}


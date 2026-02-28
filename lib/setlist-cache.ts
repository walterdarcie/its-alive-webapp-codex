type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const globalCache = new Map<string, CacheEntry<unknown>>();
const MAX_CACHE_ENTRIES = 600;

function deleteExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of globalCache.entries()) {
    if (entry.expiresAt <= now) {
      globalCache.delete(key);
    }
  }
}

export function getCacheValue<T>(key: string): T | null {
  deleteExpiredEntries();
  const hit = globalCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    globalCache.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setCacheValue<T>(key: string, value: T, ttlMs: number) {
  deleteExpiredEntries();
  while (globalCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = globalCache.keys().next().value;
    if (oldestKey === undefined) break;
    globalCache.delete(oldestKey);
  }

  globalCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

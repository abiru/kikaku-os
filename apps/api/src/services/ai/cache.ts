interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory LRU cache with TTL support
 */
export class AICache {
  private cache: Map<string, CacheEntry<unknown>>;
  private ttlSeconds: number;
  private maxSize: number;

  constructor(ttlSeconds: number = 3600, maxSize: number = 1000) {
    this.cache = new Map();
    this.ttlSeconds = ttlSeconds;
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set value in cache with TTL
   */
  set<T>(key: string, value: T, customTtlSeconds?: number): void {
    const ttl = customTtlSeconds || this.ttlSeconds;

    // Evict oldest entry if cache is full (simple LRU)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl * 1000),
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache hit/miss stats (for monitoring)
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

/**
 * Hash text for cache key generation
 */
export function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Global cache instances
export const embeddingCache = new AICache(3600, 1000); // 1 hour TTL, 1000 entries
export const searchCache = new AICache(900, 500);      // 15 min TTL, 500 entries
export const contentCache = new AICache(1800, 200);    // 30 min TTL, 200 entries

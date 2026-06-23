import { GeoResult } from './providers/types';

/**
 * A single cached geocoding request and its result.
 */
export interface CacheEntry {
  /** Original query string (trimmed but preserving case for display) */
  query: string;
  /** Provider ID that produced this result */
  provider: string;
  /** The geocoded result */
  result: GeoResult;
  /** Timestamp of when the request was made */
  timestamp: number;
}

/**
 * In-memory geocoding cache that prevents duplicate API calls
 * and provides a selectable request history.
 */
class GeocodeCache {
  private entries: CacheEntry[] = [];

  /**
   * Build a normalized cache key from query + provider.
   * Trims whitespace and lowercases so "New York" and "new york"
   * are treated as the same request.
   */
  private key(query: string, provider: string): string {
    return `${provider}::${query.trim().toLowerCase()}`;
  }

  /**
   * Look up a cached result. Returns undefined on cache miss.
   */
  get(query: string, provider: string): GeoResult | undefined {
    const k = this.key(query, provider);
    const entry = this.entries.find(
      e => this.key(e.query, e.provider) === k
    );
    return entry?.result;
  }

  /**
   * Store a new result in the cache. If the same query+provider
   * already exists, update its timestamp (move to most recent).
   */
  put(query: string, provider: string, result: GeoResult): void {
    const k = this.key(query, provider);
    const existingIdx = this.entries.findIndex(
      e => this.key(e.query, e.provider) === k
    );

    const entry: CacheEntry = {
      query: query.trim(),
      provider,
      result,
      timestamp: Date.now(),
    };

    if (existingIdx >= 0) {
      this.entries.splice(existingIdx, 1);
    }
    this.entries.push(entry);
  }

  /**
   * Return full history ordered most-recent-first.
   */
  getHistory(): CacheEntry[] {
    return [...this.entries].reverse();
  }

  /**
   * Clear all cached entries.
   */
  clear(): void {
    this.entries = [];
  }
}

/** Singleton instance — lives for the duration of the extension session */
export const geocodeCache = new GeocodeCache();

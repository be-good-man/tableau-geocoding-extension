import { GeoResult } from './providers/types';

export type RequestType = 'location' | 'route';

/**
 * A single cached request and its result.
 */
export interface CacheEntry {
  /** Type of request: location (single point) or route (origin→destination) */
  type: RequestType;
  /** Original query string (for location) or "origin → destination" (for route) */
  query: string;
  /** Provider ID that produced this result */
  provider: string;
  /** The geocoded result (for location: the point; for route: the origin point) */
  result: GeoResult;
  /** For routes: the full LINESTRING WKT */
  routeWkt?: string;
  /** For routes: origin address */
  originAddress?: string;
  /** For routes: destination address */
  destinationAddress?: string;
  /** Timestamp of when the request was made */
  timestamp: number;
}

/**
 * In-memory cache that prevents duplicate API calls
 * and provides a selectable request history.
 */
class GeocodeCache {
  private entries: CacheEntry[] = [];

  /**
   * Build a normalized cache key from query + provider.
   */
  private key(query: string, provider: string): string {
    return `${provider}::${query.trim().toLowerCase()}`;
  }

  /**
   * Look up a cached geocode result. Returns undefined on cache miss.
   */
  get(query: string, provider: string): GeoResult | undefined {
    const k = this.key(query, provider);
    const entry = this.entries.find(
      e => e.type === 'location' && this.key(e.query, e.provider) === k
    );
    return entry?.result;
  }

  /**
   * Store a location result in the cache.
   */
  put(query: string, provider: string, result: GeoResult): void {
    const k = this.key(query, provider);
    const existingIdx = this.entries.findIndex(
      e => e.type === 'location' && this.key(e.query, e.provider) === k
    );

    const entry: CacheEntry = {
      type: 'location',
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
   * Store a route result in the cache.
   */
  putRoute(
    originAddress: string,
    destinationAddress: string,
    provider: string,
    originResult: GeoResult,
    routeWkt: string
  ): void {
    const displayQuery = `${originAddress.trim()} → ${destinationAddress.trim()}`;
    const k = this.key(displayQuery, provider);
    const existingIdx = this.entries.findIndex(
      e => e.type === 'route' && this.key(e.query, e.provider) === k
    );

    const entry: CacheEntry = {
      type: 'route',
      query: displayQuery,
      provider,
      result: originResult,
      routeWkt,
      originAddress: originAddress.trim(),
      destinationAddress: destinationAddress.trim(),
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

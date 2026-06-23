import { geocodeCache } from '../src/cache';

describe('GeocodeCache', () => {
  beforeEach(() => {
    geocodeCache.clear();
  });

  it('should return undefined on cache miss', () => {
    const result = geocodeCache.get('New York', 'google');
    expect(result).toBeUndefined();
  });

  it('should return cached result on cache hit', () => {
    const mockResult = { latitude: 40.7128, longitude: -74.006, displayName: 'New York, NY' };
    geocodeCache.put('New York', 'google', mockResult);

    const result = geocodeCache.get('New York', 'google');
    expect(result).toEqual(mockResult);
  });

  it('should normalize query case for cache key', () => {
    const mockResult = { latitude: 40.7128, longitude: -74.006, displayName: 'New York, NY' };
    geocodeCache.put('New York', 'google', mockResult);

    // Different casing should hit the same cache entry
    expect(geocodeCache.get('new york', 'google')).toEqual(mockResult);
    expect(geocodeCache.get('NEW YORK', 'google')).toEqual(mockResult);
    expect(geocodeCache.get('  New York  ', 'google')).toEqual(mockResult);
  });

  it('should scope cache entries by provider', () => {
    const googleResult = { latitude: 40.7128, longitude: -74.006, displayName: 'Google NY' };
    const mapboxResult = { latitude: 40.7130, longitude: -74.005, displayName: 'Mapbox NY' };

    geocodeCache.put('New York', 'google', googleResult);
    geocodeCache.put('New York', 'mapbox', mapboxResult);

    expect(geocodeCache.get('New York', 'google')).toEqual(googleResult);
    expect(geocodeCache.get('New York', 'mapbox')).toEqual(mapboxResult);
  });

  it('should return history in most-recent-first order', () => {
    geocodeCache.put('first', 'osm', { latitude: 1, longitude: 1, displayName: 'First' });
    geocodeCache.put('second', 'osm', { latitude: 2, longitude: 2, displayName: 'Second' });
    geocodeCache.put('third', 'osm', { latitude: 3, longitude: 3, displayName: 'Third' });

    const history = geocodeCache.getHistory();
    expect(history[0].query).toBe('third');
    expect(history[1].query).toBe('second');
    expect(history[2].query).toBe('first');
  });

  it('should move duplicate entries to the end (most recent)', () => {
    geocodeCache.put('first', 'osm', { latitude: 1, longitude: 1, displayName: 'First' });
    geocodeCache.put('second', 'osm', { latitude: 2, longitude: 2, displayName: 'Second' });
    // Re-submit "first" — should move to most recent
    geocodeCache.put('first', 'osm', { latitude: 1, longitude: 1, displayName: 'First' });

    const history = geocodeCache.getHistory();
    expect(history.length).toBe(2);
    expect(history[0].query).toBe('first');
    expect(history[1].query).toBe('second');
  });

  it('should clear all entries', () => {
    geocodeCache.put('test', 'osm', { latitude: 0, longitude: 0, displayName: 'Test' });
    geocodeCache.clear();

    expect(geocodeCache.getHistory()).toHaveLength(0);
    expect(geocodeCache.get('test', 'osm')).toBeUndefined();
  });
});

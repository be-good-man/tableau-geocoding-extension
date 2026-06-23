import { toWkt, fromWkt } from '../src/spatial';

describe('toWkt', () => {
  it('should produce correct POINT(lng lat) format', () => {
    expect(toWkt(37.7749, -122.4194)).toBe('POINT(-122.4194 37.7749)');
  });

  it('should handle negative latitudes', () => {
    expect(toWkt(-33.8688, 151.2093)).toBe('POINT(151.2093 -33.8688)');
  });

  it('should handle zero coordinates', () => {
    expect(toWkt(0, 0)).toBe('POINT(0 0)');
  });

  it('should preserve high precision', () => {
    expect(toWkt(51.507351, -0.127758)).toBe('POINT(-0.127758 51.507351)');
  });
});

describe('fromWkt', () => {
  it('should parse a valid POINT string', () => {
    const result = fromWkt('POINT(-122.4194 37.7749)');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(37.7749);
    expect(result!.longitude).toBeCloseTo(-122.4194);
  });

  it('should handle negative coordinates', () => {
    const result = fromWkt('POINT(151.2093 -33.8688)');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(-33.8688);
    expect(result!.longitude).toBeCloseTo(151.2093);
  });

  it('should be case-insensitive', () => {
    const result = fromWkt('point(-0.1278 51.5074)');
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(51.5074);
  });

  it('should return null for invalid strings', () => {
    expect(fromWkt('not a point')).toBeNull();
    expect(fromWkt('LINESTRING(0 0, 1 1)')).toBeNull();
    expect(fromWkt('')).toBeNull();
  });

  it('should handle extra whitespace', () => {
    const result = fromWkt('POINT(  -122.4194   37.7749  )');
    expect(result).not.toBeNull();
    expect(result!.longitude).toBeCloseTo(-122.4194);
    expect(result!.latitude).toBeCloseTo(37.7749);
  });
});

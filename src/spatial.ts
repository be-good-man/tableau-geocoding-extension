/**
 * Convert latitude/longitude to a WKT POINT string.
 * WKT uses (longitude latitude) order — this is the opposite of
 * the common (lat, lng) convention used by Google/Mapbox responses.
 */
export function toWkt(latitude: number, longitude: number): string {
  return `POINT(${longitude} ${latitude})`;
}

/**
 * Parse a WKT POINT string back to latitude/longitude.
 * Returns null if the string is not a valid POINT geometry.
 */
export function fromWkt(wkt: string): { latitude: number; longitude: number } | null {
  const match = wkt.match(/^POINT\(\s*([-\d.]+)\s+([-\d.]+)\s*\)$/i);
  if (!match) return null;
  return {
    longitude: parseFloat(match[1]),
    latitude: parseFloat(match[2]),
  };
}

/**
 * Convert an array of lat/lng points to a WKT LINESTRING.
 * Requires at least 2 points. Returns null if fewer than 2.
 */
export function toLineString(points: Array<{ latitude: number; longitude: number }>): string | null {
  if (points.length < 2) return null;
  const coords = points.map(p => `${p.longitude} ${p.latitude}`).join(', ');
  return `LINESTRING(${coords})`;
}

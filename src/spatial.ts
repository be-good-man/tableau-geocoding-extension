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

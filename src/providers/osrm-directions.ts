/**
 * OSRM (Open Source Routing Machine) integration.
 * Free routing service, no API key required.
 * Uses the public demo server — for production, host your own instance.
 *
 * Reference: https://project-osrm.org/docs/v5.24.0/api/
 */

export type OsrmProfile = 'driving' | 'walking' | 'cycling';

export interface OsrmRouteResult {
  /** Decoded geometry points along the route */
  points: Array<{ latitude: number; longitude: number }>;
  /** Total distance in meters */
  distanceMeters: number;
  /** Total duration in seconds */
  durationSeconds: number;
}

/**
 * Compute a route between origin and destination using OSRM.
 */
export async function computeOsrmRoute(
  originCoords: { latitude: number; longitude: number },
  destinationCoords: { latitude: number; longitude: number },
  profile: OsrmProfile
): Promise<OsrmRouteResult> {
  const coordinates = `${originCoords.longitude},${originCoords.latitude};${destinationCoords.longitude},${destinationCoords.latitude}`;
  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`OSRM routing error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM returned no routes: ${data.code || 'unknown error'}`);
  }

  const route = data.routes[0];
  const geometry = route.geometry;

  if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
    throw new Error('No geometry returned from OSRM');
  }

  // GeoJSON coordinates are [longitude, latitude]
  const points = geometry.coordinates.map((coord: [number, number]) => ({
    latitude: coord[1],
    longitude: coord[0],
  }));

  return {
    points,
    distanceMeters: route.distance || 0,
    durationSeconds: route.duration || 0,
  };
}

/**
 * Map the generic travel mode to an OSRM profile.
 * OSRM supports: driving, walking, cycling (no transit).
 */
export function toOsrmProfile(travelMode: string): OsrmProfile {
  switch (travelMode) {
    case 'DRIVE': return 'driving';
    case 'WALK': return 'walking';
    case 'BICYCLE': return 'cycling';
    default: return 'driving';
  }
}

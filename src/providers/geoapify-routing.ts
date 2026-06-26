/**
 * Geoapify Routing API integration.
 * Returns the actual route geometry as lat/lng points.
 *
 * Reference: https://apidocs.geoapify.com/docs/routing/
 */

export type GeoapifyMode = 'drive' | 'walk' | 'bicycle';

export interface GeoapifyRouteResult {
  /** Decoded geometry points along the route */
  points: Array<{ latitude: number; longitude: number }>;
  /** Total distance in meters */
  distanceMeters: number;
  /** Total duration in seconds */
  durationSeconds: number;
}

/**
 * Compute a route between origin and destination using Geoapify Routing API.
 */
export async function computeGeoapifyRoute(
  originCoords: { latitude: number; longitude: number },
  destinationCoords: { latitude: number; longitude: number },
  mode: GeoapifyMode,
  apiKey: string
): Promise<GeoapifyRouteResult> {
  const waypoints = `${originCoords.latitude},${originCoords.longitude}|${destinationCoords.latitude},${destinationCoords.longitude}`;
  const url = `https://api.geoapify.com/v1/routing?waypoints=${waypoints}&mode=${mode}&apiKey=${apiKey}`;

  const res = await fetch(url);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Geoapify Routing error: ${res.status} ${errorData?.message || res.statusText}`
    );
  }

  const data = await res.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('Geoapify Routing returned no routes');
  }

  const route = data.features[0];
  const geometry = route.geometry;

  if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
    throw new Error('No geometry returned from Geoapify Routing');
  }

  // Geoapify returns a MultiLineString — flatten all segments
  let points: Array<{ latitude: number; longitude: number }> = [];

  if (geometry.type === 'MultiLineString') {
    for (const segment of geometry.coordinates) {
      for (const coord of segment) {
        points.push({ latitude: coord[1], longitude: coord[0] });
      }
    }
  } else if (geometry.type === 'LineString') {
    points = geometry.coordinates.map((coord: [number, number]) => ({
      latitude: coord[1],
      longitude: coord[0],
    }));
  }

  const properties = route.properties || {};

  return {
    points,
    distanceMeters: properties.distance || 0,
    durationSeconds: properties.time || 0,
  };
}

/**
 * Map the generic travel mode to a Geoapify mode.
 */
export function toGeoapifyMode(travelMode: string): GeoapifyMode {
  switch (travelMode) {
    case 'DRIVE': return 'drive';
    case 'WALK': return 'walk';
    case 'BICYCLE': return 'bicycle';
    default: return 'drive';
  }
}

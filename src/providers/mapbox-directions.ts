/**
 * Mapbox Directions API integration.
 * Returns the actual route geometry decoded into lat/lng points.
 *
 * Reference: https://docs.mapbox.com/api/navigation/directions/
 */

import { GeoResult } from './types';

export type MapboxProfile = 'driving' | 'walking' | 'cycling' | 'driving-traffic';

export interface MapboxRouteResult {
  /** Decoded geometry points along the route */
  points: Array<{ latitude: number; longitude: number }>;
  /** Total distance in meters */
  distanceMeters: number;
  /** Total duration in seconds */
  durationSeconds: number;
}

/**
 * Compute a route between origin and destination using Mapbox Directions API.
 * Requires geocoding both addresses first to get coordinates.
 */
export async function computeMapboxRoute(
  originCoords: { latitude: number; longitude: number },
  destinationCoords: { latitude: number; longitude: number },
  profile: MapboxProfile,
  apiKey: string
): Promise<MapboxRouteResult> {
  const coordinates = `${originCoords.longitude},${originCoords.latitude};${destinationCoords.longitude},${destinationCoords.latitude}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?geometries=geojson&overview=full&access_token=${apiKey}`;

  const res = await fetch(url);

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Mapbox Directions API error: ${res.status} ${errorData?.message || res.statusText}`
    );
  }

  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Mapbox Directions API returned no routes');
  }

  const route = data.routes[0];
  const geometry = route.geometry;

  if (!geometry || !geometry.coordinates || geometry.coordinates.length === 0) {
    throw new Error('No geometry returned from Mapbox Directions API');
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
 * Map the generic travel mode to a Mapbox profile.
 */
export function toMapboxProfile(travelMode: string): MapboxProfile {
  switch (travelMode) {
    case 'DRIVE': return 'driving';
    case 'WALK': return 'walking';
    case 'BICYCLE': return 'cycling';
    case 'TRANSIT': return 'driving'; // Mapbox doesn't have transit — fall back to driving
    default: return 'driving';
  }
}

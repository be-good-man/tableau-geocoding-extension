/**
 * Google Routes API (computeRoutes) integration.
 * Returns the actual route polyline decoded into lat/lng points.
 *
 * Reference: https://developers.google.com/maps/documentation/routes/compute_route_directions
 */

export type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE' | 'TRANSIT' | 'TWO_WHEELER';

export interface RouteResult {
  /** Decoded polyline points along the route */
  points: Array<{ latitude: number; longitude: number }>;
  /** Total distance in meters */
  distanceMeters: number;
  /** Total duration string (e.g. "1234s") */
  duration: string;
}

/**
 * Compute a route between origin and destination using Google Routes API.
 */
export async function computeRoute(
  originAddress: string,
  destinationAddress: string,
  travelMode: TravelMode,
  apiKey: string
): Promise<RouteResult> {
  const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  const body = {
    origin: {
      address: originAddress,
    },
    destination: {
      address: destinationAddress,
    },
    travelMode: travelMode,
    computeAlternativeRoutes: false,
    polylineEncoding: 'ENCODED_POLYLINE',
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      `Google Routes API error: ${res.status} ${errorData?.error?.message || res.statusText}`
    );
  }

  const data = await res.json();

  if (!data.routes || data.routes.length === 0) {
    throw new Error('Google Routes API returned no routes');
  }

  const route = data.routes[0];
  const encodedPolyline = route.polyline?.encodedPolyline;

  if (!encodedPolyline) {
    throw new Error('No polyline returned from Google Routes API');
  }

  const points = decodePolyline(encodedPolyline);

  return {
    points,
    distanceMeters: route.distanceMeters || 0,
    duration: route.duration || '0s',
  };
}

/**
 * Decode a Google encoded polyline string into an array of lat/lng points.
 * Algorithm: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): Array<{ latitude: number; longitude: number }> {
  const points: Array<{ latitude: number; longitude: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    // Decode latitude
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    // Decode longitude
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

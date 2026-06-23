import { GeoProvider, GeoResult } from './types';

export class GoogleProvider implements GeoProvider {
  id = 'google';
  label = 'Google Geocoding';
  requiresApiKey = true;

  async geocode(query: string, apiKey: string): Promise<GeoResult> {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results.length) {
      throw new Error(`Google geocoding failed: ${data.status}`);
    }

    const loc = data.results[0].geometry.location;
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      displayName: data.results[0].formatted_address,
    };
  }
}

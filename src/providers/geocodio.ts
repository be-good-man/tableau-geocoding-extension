import { GeoProvider, GeoResult } from './types';

export class GeocodioProvider implements GeoProvider {
  id = 'geocodio';
  label = 'Geocodio';
  requiresApiKey = true;

  async geocode(query: string, apiKey: string): Promise<GeoResult> {
    const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(query)}&api_key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || !data.results.length) {
      throw new Error('Geocodio returned no results');
    }

    const loc = data.results[0].location;
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      displayName: data.results[0].formatted_address,
    };
  }
}

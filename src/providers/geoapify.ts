import { GeoProvider, GeoResult } from './types';

export class GeoapifyProvider implements GeoProvider {
  id = 'geoapify';
  label = 'Geoapify';
  requiresApiKey = true;

  async geocode(query: string, apiKey: string): Promise<GeoResult> {
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&apiKey=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || data.features.length === 0) {
      throw new Error('Geoapify returned no results');
    }

    const feature = data.features[0];
    const [lng, lat] = feature.geometry.coordinates;
    return {
      latitude: lat,
      longitude: lng,
      displayName: feature.properties.formatted || query,
    };
  }
}

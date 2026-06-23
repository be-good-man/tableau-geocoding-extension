import { GeoProvider, GeoResult } from './types';

export class MapboxProvider implements GeoProvider {
  id = 'mapbox';
  label = 'Mapbox';
  requiresApiKey = true;

  async geocode(query: string, apiKey: string): Promise<GeoResult> {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.features || !data.features.length) {
      throw new Error('Mapbox geocoding returned no results');
    }

    const [lng, lat] = data.features[0].center;
    return {
      latitude: lat,
      longitude: lng,
      displayName: data.features[0].place_name,
    };
  }
}

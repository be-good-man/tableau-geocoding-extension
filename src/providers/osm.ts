import { GeoProvider, GeoResult } from './types';

export class OsmProvider implements GeoProvider {
  id = 'osm';
  label = 'OpenStreetMap (Nominatim)';
  requiresApiKey = false;

  async geocode(query: string, _apiKey: string): Promise<GeoResult> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'TableauGeocodingExtension/1.0',
      },
    });

    const data = await res.json();

    if (!data.length) {
      throw new Error('Nominatim returned no results');
    }

    return {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }
}

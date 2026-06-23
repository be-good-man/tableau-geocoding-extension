import { GeoProvider, GeoResult } from './types';

export class SalesforceMapsProvider implements GeoProvider {
  id = 'salesforce-maps';
  label = 'Salesforce Maps';
  requiresApiKey = true; // Requires an OAuth bearer token

  async geocode(query: string, apiKey: string): Promise<GeoResult> {
    // Salesforce Maps geocoding endpoint
    // The apiKey here is the OAuth bearer token
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}`;

    // TODO: Replace with actual Salesforce Maps endpoint once API access is confirmed.
    // This is a placeholder structure — the real endpoint and response shape
    // should be adapted to your Salesforce org's Maps API configuration.
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Salesforce Maps geocoding failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // Normalize response — adjust field names based on actual SF Maps API response
    if (!data.latitude && !data.results) {
      throw new Error('Salesforce Maps returned no results');
    }

    // Adapt to actual response shape
    const lat = data.latitude ?? data.results?.[0]?.geometry?.location?.lat;
    const lng = data.longitude ?? data.results?.[0]?.geometry?.location?.lng;
    const displayName = data.formattedAddress ?? data.results?.[0]?.formatted_address ?? query;

    return { latitude: lat, longitude: lng, displayName };
  }
}

import { GeoProvider } from './types';
import { GoogleProvider } from './google';
import { MapboxProvider } from './mapbox';
import { SalesforceMapsProvider } from './salesforce-maps';
import { GeocodioProvider } from './geocodio';
import { GeoapifyProvider } from './geoapify';
import { OsmProvider } from './osm';

const providers: GeoProvider[] = [
  new GoogleProvider(),
  new MapboxProvider(),
  new SalesforceMapsProvider(),
  new GeocodioProvider(),
  new GeoapifyProvider(),
  new OsmProvider(),
];

/**
 * Get a provider by its unique ID.
 * Throws if the provider is not found.
 */
export function getProvider(id: string): GeoProvider {
  const provider = providers.find(p => p.id === id);
  if (!provider) {
    throw new Error(`Unknown geocoding provider: ${id}`);
  }
  return provider;
}

/**
 * Return all registered providers (for populating the config UI dropdown).
 */
export function getAllProviders(): GeoProvider[] {
  return providers;
}

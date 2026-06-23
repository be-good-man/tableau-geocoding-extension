/**
 * Result returned by any geocoding provider.
 */
export interface GeoResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

/**
 * Interface that all geocoding provider adapters must implement.
 */
export interface GeoProvider {
  /** Unique key stored in Tableau settings */
  id: string;
  /** Human-readable name for the config UI */
  label: string;
  /** Whether this provider requires an API key */
  requiresApiKey: boolean;
  /** Perform forward geocoding */
  geocode(query: string, apiKey: string): Promise<GeoResult>;
}

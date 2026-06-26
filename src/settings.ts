/**
 * Helper functions for reading/writing Tableau extension settings.
 */

declare const tableau: any;

export interface ExtensionSettings {
  provider: string;
  apiKey: string;
  spatialParamName: string;
  pathParamName: string;
}

/**
 * Get the stored API key for a specific provider.
 */
export function getApiKeyForProvider(providerId: string): string {
  return tableau.extensions.settings.get(`apiKey_${providerId}`) || '';
}

/**
 * Save the API key for a specific provider.
 */
export function setApiKeyForProvider(providerId: string, apiKey: string): void {
  tableau.extensions.settings.set(`apiKey_${providerId}`, apiKey);
}

/**
 * Read all extension settings from the Tableau Settings API.
 */
export function getSettings(): ExtensionSettings {
  return {
    provider: tableau.extensions.settings.get('provider') || '',
    apiKey: tableau.extensions.settings.get('apiKey') || '',
    spatialParamName: tableau.extensions.settings.get('spatialParamName') || 'GeocodedLocation',
    pathParamName: tableau.extensions.settings.get('pathParamName') || '',
  };
}

/**
 * Write extension settings to the Tableau Settings API and persist.
 */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  tableau.extensions.settings.set('provider', settings.provider);
  tableau.extensions.settings.set('apiKey', settings.apiKey);
  tableau.extensions.settings.set('spatialParamName', settings.spatialParamName);
  tableau.extensions.settings.set('pathParamName', settings.pathParamName);
  await tableau.extensions.settings.saveAsync();
}

/**
 * Check if settings are complete enough to make geocoding requests.
 */
export function isConfigured(settings: ExtensionSettings, providerRequiresKey: boolean): boolean {
  if (!settings.provider) return false;
  if (providerRequiresKey && !settings.apiKey) return false;
  return true;
}

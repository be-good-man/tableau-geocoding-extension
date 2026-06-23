/**
 * Helper functions for reading/writing Tableau extension settings.
 */

declare const tableau: any;

export interface ExtensionSettings {
  provider: string;
  apiKey: string;
  spatialParamName: string;
}

/**
 * Read all extension settings from the Tableau Settings API.
 */
export function getSettings(): ExtensionSettings {
  return {
    provider: tableau.extensions.settings.get('provider') || '',
    apiKey: tableau.extensions.settings.get('apiKey') || '',
    spatialParamName: tableau.extensions.settings.get('spatialParamName') || 'GeocodedLocation',
  };
}

/**
 * Write extension settings to the Tableau Settings API and persist.
 */
export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  tableau.extensions.settings.set('provider', settings.provider);
  tableau.extensions.settings.set('apiKey', settings.apiKey);
  tableau.extensions.settings.set('spatialParamName', settings.spatialParamName);
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

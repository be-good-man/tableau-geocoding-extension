import './styles.css';
import { getProvider, getAllProviders } from './providers';
import { geocodeCache, CacheEntry } from './cache';
import { toWkt } from './spatial';
import { getSettings, isConfigured } from './settings';
import { getParameterByName, writeSpatialValue } from './parameters';

declare const tableau: any;

let spatialParam: any = null;

/**
 * Main entry point — initializes the extension and sets up the UI.
 */
async function initialize(): Promise<void> {
  await tableau.extensions.initializeAsync();

  const settings = getSettings();
  const provider = settings.provider ? getProvider(settings.provider) : null;
  const configured = provider ? isConfigured(settings, provider.requiresApiKey) : false;

  // If not configured, prompt the user with the settings dialog
  if (!configured) {
    try {
      await openSettingsDialog();
    } catch (e) {
      // User closed the dialog without saving — show a message
      showStatus('Please configure a geocoding provider via the Settings button.', 'error');
      setupEventListeners();
      return;
    }
  }

  // Re-read settings after potential dialog
  const currentSettings = getSettings();
  spatialParam = await getParameterByName(currentSettings.spatialParamName);

  if (!spatialParam) {
    showStatus(
      `Parameter "${currentSettings.spatialParamName}" not found. Please create it in your workbook or update Settings.`,
      'error'
    );
  }

  setupEventListeners();
  renderHistory();
}

/**
 * Open the settings configuration dialog.
 */
async function openSettingsDialog(): Promise<void> {
  await tableau.extensions.ui.displayDialogAsync('config.html', '', {
    width: 500,
    height: 420,
  });
}

/**
 * Wire up all UI event listeners.
 */
function setupEventListeners(): void {
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement;
  const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
  const clearHistoryBtn = document.getElementById('clearHistoryBtn') as HTMLButtonElement;

  // Locate button click
  locateBtn.addEventListener('click', () => submitGeocode());

  // Enter key in address field
  addressInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitGeocode();
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', async () => {
    try {
      await openSettingsDialog();
      // Re-read settings and reconnect to the spatial parameter
      const currentSettings = getSettings();
      spatialParam = await getParameterByName(currentSettings.spatialParamName);
      clearStatus();
    } catch (e) {
      // Dialog was closed without saving — no action needed
    }
  });

  // Clear history button
  clearHistoryBtn.addEventListener('click', () => {
    geocodeCache.clear();
    renderHistory();
  });
}

/**
 * Submit a geocoding request from the address input.
 */
async function submitGeocode(): Promise<void> {
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  const address = addressInput.value.trim();

  if (!address) return;

  const settings = getSettings();
  if (!settings.provider) {
    showStatus('No provider configured. Click Settings to set one up.', 'error');
    return;
  }

  if (!spatialParam) {
    showStatus(`Parameter "${settings.spatialParamName}" not found in workbook.`, 'error');
    return;
  }

  showStatus('Geocoding...', 'loading');

  try {
    // Check cache first
    let result = geocodeCache.get(address, settings.provider);

    if (!result) {
      // Cache miss — call the provider
      const provider = getProvider(settings.provider);
      result = await provider.geocode(address, settings.apiKey);
      geocodeCache.put(address, settings.provider, result);
    }

    // Write WKT POINT to spatial parameter
    const wkt = toWkt(result.latitude, result.longitude);
    await writeSpatialValue(spatialParam, wkt);

    clearStatus();
    renderHistory();
  } catch (err: any) {
    showStatus(`Geocoding failed: ${err.message}`, 'error');
  }
}

/**
 * Handle clicking a history entry — apply cached result without API call.
 */
function onHistorySelect(entry: CacheEntry): void {
  if (!spatialParam) return;

  const wkt = toWkt(entry.result.latitude, entry.result.longitude);
  writeSpatialValue(spatialParam, wkt);

  // Update the address input to show what was selected
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  addressInput.value = entry.query;

  renderHistory(entry);
}

/**
 * Render the history list UI.
 */
function renderHistory(activeEntry?: CacheEntry): void {
  const historyList = document.getElementById('historyList') as HTMLUListElement;
  const emptyState = document.getElementById('emptyState') as HTMLDivElement;
  const history = geocodeCache.getHistory();

  historyList.innerHTML = '';

  if (history.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  history.forEach(entry => {
    const li = document.createElement('li');
    li.className = 'history-item';

    if (activeEntry && activeEntry.query === entry.query && activeEntry.provider === entry.provider) {
      li.classList.add('active');
    }

    const querySpan = document.createElement('span');
    querySpan.className = 'query';
    querySpan.textContent = `"${entry.query}"`;

    const coordsSpan = document.createElement('span');
    coordsSpan.className = 'coords';
    coordsSpan.textContent = `POINT(${entry.result.longitude.toFixed(4)} ${entry.result.latitude.toFixed(4)})`;

    li.appendChild(querySpan);
    li.appendChild(coordsSpan);
    li.addEventListener('click', () => onHistorySelect(entry));

    historyList.appendChild(li);
  });
}

/**
 * Show a status message (error or loading).
 */
function showStatus(message: string, type: 'error' | 'loading'): void {
  const container = document.getElementById('statusContainer') as HTMLDivElement;
  container.innerHTML = `<div class="status-message status-${type}">${message}</div>`;
}

/**
 * Clear any status message.
 */
function clearStatus(): void {
  const container = document.getElementById('statusContainer') as HTMLDivElement;
  container.innerHTML = '';
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

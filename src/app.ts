import './styles.css';
import { getProvider } from './providers';
import { geocodeCache, CacheEntry } from './cache';
import { toWkt } from './spatial';
import { getSettings, isConfigured, saveSettings } from './settings';
import { getParameterByName, getAllParameters, writeSpatialValue } from './parameters';

declare const tableau: any;

let spatialParam: any = null;
let lastSubmittedQuery: string = '';

/**
 * Main entry point — initializes the extension and sets up the UI.
 */
async function initialize(): Promise<void> {
  try {
    await tableau.extensions.initializeAsync();
  } catch (e) {
    showStatus('Failed to initialize Tableau Extensions API.', 'error');
    return;
  }

  // Apply background color immediately
  applyBackgroundColor();

  const currentSettings = getSettings();

  // First: check if a target parameter has been selected previously
  if (currentSettings.spatialParamName) {
    // Verify the saved parameter still exists in the workbook
    spatialParam = await getParameterByName(currentSettings.spatialParamName);
    if (!spatialParam) {
      // Previously saved parameter was removed — prompt user to select again
      await showParameterSelectionModal();
      if (!spatialParam) {
        setupEventListeners();
        return;
      }
    }
  } else {
    // No parameter configured yet — prompt user to select one
    await showParameterSelectionModal();
    if (!spatialParam) {
      setupEventListeners();
      return;
    }
  }

  // Second: check if a provider is configured
  const refreshedSettings = getSettings();
  const provider = refreshedSettings.provider ? getProvider(refreshedSettings.provider) : null;
  const configured = provider ? isConfigured(refreshedSettings, provider.requiresApiKey) : false;

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

  applyBackgroundColor();
  setupEventListeners();
  updateRecentCount();
}

/**
 * Show a modal that lists all spatial workbook parameters and lets the user pick one.
 * Resolves when the user selects a parameter or dismisses the modal.
 */
async function showParameterSelectionModal(): Promise<void> {
  const allParameters = await getAllParameters();

  // Filter to only spatial parameters
  const spatialParameters = allParameters.filter(
    (p: any) => p.dataType === 'spatial'
  );

  if (spatialParameters.length === 0) {
    showMissingParameterModal('GeocodedLocation');
    return;
  }

  return new Promise<void>((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-dialog';

    modal.innerHTML = `
      <h3 class="modal-title">Select Target Parameter</h3>
      <p class="modal-body">
        Choose which spatial parameter should receive the geocoded coordinates (as a WKT POINT).
      </p>
      <div class="form-group">
        <select class="param-select" id="paramSelectModal">
          <option value="">-- Select a spatial parameter --</option>
        </select>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="paramSelectCancel">Cancel</button>
        <button class="btn btn-primary" id="paramSelectConfirm">Confirm</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Populate the dropdown with spatial parameters only
    const select = document.getElementById('paramSelectModal') as HTMLSelectElement;
    spatialParameters.forEach((p: any) => {
      const option = document.createElement('option');
      option.value = p.name;
      option.textContent = p.name;
      select.appendChild(option);
    });

    // Confirm button
    const confirmBtn = document.getElementById('paramSelectConfirm') as HTMLButtonElement;
    confirmBtn.addEventListener('click', async () => {
      const selectedName = select.value;
      if (!selectedName) {
        select.style.borderColor = '#b91c1c';
        return;
      }

      // Save selection to settings
      const settings = getSettings();
      settings.spatialParamName = selectedName;
      await saveSettings(settings);

      // Set the spatial param reference
      spatialParam = await getParameterByName(selectedName);

      overlay.remove();
      resolve();
    });

    // Cancel button
    const cancelBtn = document.getElementById('paramSelectCancel') as HTMLButtonElement;
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      showStatus('No target parameter selected. Click Settings to configure.', 'error');
      resolve();
    });
  });
}

/**
 * Apply the saved background color to the extension body.
 */
function applyBackgroundColor(): void {
  const bgColor = tableau.extensions.settings.get('bgColor') || '#ffffff';
  document.body.style.background = bgColor;
}

/**
 * Open the settings configuration dialog.
 */
async function openSettingsDialog(): Promise<void> {
  await tableau.extensions.ui.displayDialogAsync('config.html', '', {
    width: 500,
    height: 450,
  });
}

/**
 * Wire up all UI event listeners.
 */
function setupEventListeners(): void {
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement;
  const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;

  // Start with Locate button disabled
  locateBtn.disabled = true;

  // Enable/disable Locate button based on input state + hide success check
  addressInput.addEventListener('input', () => {
    updateLocateButtonState(addressInput, locateBtn);
    const successCheck = document.getElementById('successCheck') as HTMLSpanElement;
    successCheck.classList.add('hidden');
  });

  // Locate button click
  locateBtn.addEventListener('click', () => {
    if (!locateBtn.disabled) {
      submitGeocode();
    }
  });

  // Enter key in address field
  addressInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!locateBtn.disabled) {
        submitGeocode();
      }
    }
  });

  // Settings button
  settingsBtn.addEventListener('click', async () => {
    try {
      await openSettingsDialog();
      // Re-read settings and reconnect to the spatial parameter
      const currentSettings = getSettings();
      spatialParam = await getParameterByName(currentSettings.spatialParamName);
      applyBackgroundColor();
      clearStatus();
    } catch (e) {
      // Dialog was closed without saving — no action needed
    }
  });

  // Recent Requests modal
  const recentBtn = document.getElementById('recentBtn') as HTMLButtonElement;

  recentBtn.addEventListener('click', async () => {
    try {
      // Store history in settings so the dialog can read it
      const historyPayload = JSON.stringify(geocodeCache.getHistory());
      tableau.extensions.settings.set('_historyData', historyPayload);
      await tableau.extensions.settings.saveAsync();

      const result = await tableau.extensions.ui.displayDialogAsync('history.html', historyPayload, {
        width: 500,
        height: 400,
      });
      if (result === 'cleared') {
        // User cleared all history in the dialog
        geocodeCache.clear();
      } else if (result && result !== 'closed') {
        // User selected a history entry — parse it and apply
        try {
          const entry: CacheEntry = JSON.parse(result);
          if (spatialParam && entry.result) {
            const wkt = toWkt(entry.result.latitude, entry.result.longitude);
            await writeSpatialValue(spatialParam, wkt);
            const addressInput = document.getElementById('addressInput') as HTMLInputElement;
            addressInput.value = entry.query;
            lastSubmittedQuery = entry.query;
            const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement;
            locateBtn.disabled = true;
            const successCheck = document.getElementById('successCheck') as HTMLSpanElement;
            successCheck.classList.remove('hidden');
          }
        } catch {
          // Not valid JSON — dialog was just closed
        }
      }
      updateRecentCount();
    } catch {
      // Dialog was closed without a payload
      updateRecentCount();
    }
  });
}

/**
 * Enable or disable the Locate button based on whether the input
 * is non-empty and different from the last submitted query.
 */
function updateLocateButtonState(addressInput: HTMLInputElement, locateBtn: HTMLButtonElement): void {
  const currentValue = addressInput.value.trim();
  locateBtn.disabled = !currentValue || currentValue === lastSubmittedQuery;
}

/**
 * Submit a geocoding request from the address input.
 */
async function submitGeocode(): Promise<void> {
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement;
  const address = addressInput.value.trim();

  if (!address || address === lastSubmittedQuery) return;

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

    // Track last submitted query and disable button
    lastSubmittedQuery = address;
    locateBtn.disabled = true;

    // Show success check mark
    const successCheck = document.getElementById('successCheck') as HTMLSpanElement;
    successCheck.classList.remove('hidden');

    clearStatus();
    updateRecentCount();
  } catch (err: any) {
    showStatus(`Geocoding failed: ${err.message}`, 'error');
  }
}

/**
 * Update the recent requests badge count on the button.
 */
function updateRecentCount(): void {
  const recentCount = document.getElementById('recentCount') as HTMLSpanElement;
  const history = geocodeCache.getHistory();

  if (history.length > 0) {
    recentCount.textContent = history.length.toString();
    recentCount.classList.remove('hidden');
  } else {
    recentCount.classList.add('hidden');
  }
}

/**
 * Show a modal popup informing the user that the required parameter is missing.
 * Includes a copy button so they can easily copy the parameter name.
 */
function showMissingParameterModal(paramName: string): void {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-dialog';

  modal.innerHTML = `
    <h3 class="modal-title">No Spatial Parameter Found</h3>
    <p class="modal-body">
      This extension requires a spatial parameter in your workbook. No spatial parameters were found.
    </p>
    <p class="modal-instructions">
      To create a parameter, navigate to a worksheet. In the Data pane, click the drop-down arrow
      in the top right of the pane and select <strong>Create Parameter</strong>. Choose a data type:
      <strong>Spatial</strong>. Under Allowable values, select <strong>All</strong>. Click
      <strong>OK</strong>. Return to this dashboard to complete the configuration.
    </p>
    <p class="modal-body">Suggested parameter name:</p>
    <div class="copy-row">
      <input type="text" class="copy-input" id="paramNameCopy" value="${paramName}" readonly>
      <button class="btn btn-primary copy-btn" id="copyParamBtn">Copy</button>
    </div>
    <div class="copy-feedback hidden" id="copyFeedback">Copied!</div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="recheckParamBtn">Re-check Parameters</button>
      <button class="btn btn-secondary" id="dismissModalBtn">Dismiss</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Copy button handler
  const copyBtn = document.getElementById('copyParamBtn') as HTMLButtonElement;
  const copyInput = document.getElementById('paramNameCopy') as HTMLInputElement;
  const copyFeedback = document.getElementById('copyFeedback') as HTMLDivElement;

  copyBtn.addEventListener('click', () => {
    // Create a temporary textarea to reliably copy text
    // This works in iframes and non-HTTPS contexts where navigator.clipboard is unavailable
    const textarea = document.createElement('textarea');
    textarea.value = paramName;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      document.execCommand('copy');
      copyFeedback.classList.remove('hidden');
      setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
    } catch {
      // Last resort — select the visible input so user can Ctrl+C manually
      copyInput.select();
    }

    document.body.removeChild(textarea);
  });

  // Re-check button — re-runs the parameter check from scratch
  const recheckBtn = document.getElementById('recheckParamBtn') as HTMLButtonElement;
  recheckBtn.addEventListener('click', async () => {
    overlay.remove();
    clearStatus();
    await showParameterSelectionModal();
    if (spatialParam) {
      // Parameter found and selected — continue initialization
      const refreshedSettings = getSettings();
      const provider = refreshedSettings.provider ? getProvider(refreshedSettings.provider) : null;
      const configured = provider ? isConfigured(refreshedSettings, provider.requiresApiKey) : false;
      if (!configured) {
        try {
          await openSettingsDialog();
        } catch (e) {
          showStatus('Please configure a geocoding provider via the Settings button.', 'error');
        }
      }
      updateRecentCount();
    }
  });

  // Dismiss button handler
  const dismissBtn = document.getElementById('dismissModalBtn') as HTMLButtonElement;
  dismissBtn.addEventListener('click', () => {
    overlay.remove();
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

import './styles.css';
import { getProvider } from './providers';
import { geocodeCache, CacheEntry } from './cache';
import { toWkt, toLineString } from './spatial';
import { getSettings, isConfigured, saveSettings } from './settings';
import { getParameterByName, getParametersByNames, getAllParameters, writeSpatialValue } from './parameters';
import { computeRoute, TravelMode } from './providers/google-routes';
import { computeMapboxRoute, toMapboxProfile } from './providers/mapbox-directions';
import { computeOsrmRoute, toOsrmProfile } from './providers/osrm-directions';
import { computeGeoapifyRoute, toGeoapifyMode } from './providers/geoapify-routing';

declare const tableau: any;

let spatialParam: any = null;
let pathParam: any = null;
let lastSubmittedQuery: string = '';
let lastRoutedOrigin: string = '';
let lastRoutedDestination: string = '';
let lastRoutedMode: string = '';

/**
 * Main entry point — initializes the extension and sets up the UI.
 */
async function initialize(): Promise<void> {
  try {
    await tableau.extensions.initializeAsync();
  } catch (e) {
    hideLoadingState();
    showStatus('Failed to initialize Tableau Extensions API.', 'error');
    return;
  }

  // Hide loading state and show the UI
  hideLoadingState();

  // Listen for external settings changes (collaborative environments)
  tableau.extensions.settings.addEventListener(
    tableau.TableauEventType.SettingsChanged,
    onSettingsChanged
  );

  // Apply background color and check routing availability
  applyBackgroundColor();
  updateRouteModeAvailability();

  const currentSettings = getSettings();

  // First: check if a target parameter has been selected previously
  if (currentSettings.spatialParamName) {
    // Load both parameters in a single API call
    const namesToLoad = [currentSettings.spatialParamName];
    if (currentSettings.pathParamName) namesToLoad.push(currentSettings.pathParamName);
    const params = await getParametersByNames(namesToLoad);
    spatialParam = params[currentSettings.spatialParamName];
    if (currentSettings.pathParamName) {
      pathParam = params[currentSettings.pathParamName];
    }
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
    // Re-read settings after dialog — batch load both parameters
    const updatedSettings = getSettings();
    const namesToLoad = [updatedSettings.spatialParamName];
    if (updatedSettings.pathParamName) namesToLoad.push(updatedSettings.pathParamName);
    const params = await getParametersByNames(namesToLoad);
    spatialParam = params[updatedSettings.spatialParamName];
    pathParam = updatedSettings.pathParamName ? params[updatedSettings.pathParamName] : null;
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
        Choose which location parameter should receive the geocoded coordinates (as a WKT POINT).
      </p>
      <div class="form-group">
        <select class="param-select" id="paramSelectModal">
          <option value="">-- Select a location parameter --</option>
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

let currentMode: 'location' | 'route' = 'location';
let lastFocusedRouteField: 'origin' | 'destination' = 'origin';

/**
 * Wire up all UI event listeners.
 */
function setupEventListeners(): void {
  // === LOCATION MODE elements ===
  const addressInput = document.getElementById('addressInput') as HTMLInputElement;
  const locateBtn = document.getElementById('locateBtn') as HTMLButtonElement;
  const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
  const recentBtn = document.getElementById('recentBtn') as HTMLButtonElement;
  const toRouteBtn = document.getElementById('toRouteBtn') as HTMLButtonElement;

  // === ROUTE MODE elements ===
  const originInput = document.getElementById('originInput') as HTMLInputElement;
  const settingsBtnRoute = document.getElementById('settingsBtnRoute') as HTMLButtonElement;
  const recentBtnRoute = document.getElementById('recentBtnRoute') as HTMLButtonElement;
  const toLocationBtn = document.getElementById('toLocationBtn') as HTMLButtonElement;

  // === MODE TOGGLE ===
  toRouteBtn.addEventListener('click', () => {
    switchMode('route');
  });

  toLocationBtn.addEventListener('click', () => {
    switchMode('location');
  });

  // === LOCATION MODE listeners ===
  locateBtn.disabled = true;

  addressInput.addEventListener('input', () => {
    updateLocateButtonState(addressInput, locateBtn);
    const successCheck = document.getElementById('successCheck') as HTMLSpanElement;
    successCheck.classList.add('hidden');
  });

  locateBtn.addEventListener('click', () => {
    if (!locateBtn.disabled) {
      submitGeocode();
    }
  });

  addressInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!locateBtn.disabled) {
        submitGeocode();
      }
    }
  });

  // === ROUTE MODE listeners ===
  originInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitRoute();
    }
  });

  // Track which route field was last focused
  originInput.addEventListener('focus', () => {
    lastFocusedRouteField = 'origin';
  });
  const destinationInput = document.getElementById('destinationInput') as HTMLInputElement;
  destinationInput.addEventListener('focus', () => {
    lastFocusedRouteField = 'destination';
  });

  // === SHARED: Settings buttons (both modes) ===
  const handleSettings = async () => {
    try {
      await openSettingsDialog();
      const currentSettings = getSettings();
      const namesToLoad = [currentSettings.spatialParamName];
      if (currentSettings.pathParamName) namesToLoad.push(currentSettings.pathParamName);
      const params = await getParametersByNames(namesToLoad);
      spatialParam = params[currentSettings.spatialParamName];
      pathParam = currentSettings.pathParamName ? params[currentSettings.pathParamName] : null;
      applyBackgroundColor();
      updateRouteModeAvailability();
      updateTravelModeVisibility();
      clearStatus();
    } catch (e) {
      // Dialog was closed without saving
    }
  };
  settingsBtn.addEventListener('click', handleSettings);
  settingsBtnRoute.addEventListener('click', handleSettings);

  // === SHARED: Info (About) buttons (both modes) ===
  const infoBtn = document.getElementById('infoBtn') as HTMLButtonElement;
  const infoBtnRoute = document.getElementById('infoBtnRoute') as HTMLButtonElement;
  const handleInfo = () => {
    tableau.extensions.ui.displayDialogAsync('about.html', '', {
      width: 400,
      height: 300,
    }).catch(() => { /* closed */ });
  };
  infoBtn.addEventListener('click', handleInfo);
  infoBtnRoute.addEventListener('click', handleInfo);

  // === SHARED: Recent Requests buttons (both modes) ===
  const handleRecent = async () => {
    try {
      const historyPayload = JSON.stringify({
        entries: geocodeCache.getHistory(),
        currentMode: currentMode,
        focusedField: lastFocusedRouteField,
      });
      tableau.extensions.settings.set('_historyData', historyPayload);
      await tableau.extensions.settings.saveAsync();

      const result = await tableau.extensions.ui.displayDialogAsync(
        'history.html', historyPayload, {
        width: 500,
        height: 400,
      });
      if (result === 'cleared') {
        geocodeCache.clear();
      } else if (result && result !== 'closed') {
        try {
          const entry: CacheEntry = JSON.parse(result);

          if (entry.type === 'route' && entry.routeWkt && pathParam) {
            // Apply a route entry — only update the path parameter
            await writeSpatialValue(pathParam, entry.routeWkt);
            if (currentMode === 'route' && entry.originAddress && entry.destinationAddress) {
              originInput.value = entry.originAddress;
              const destInput = document.getElementById('destinationInput') as HTMLInputElement;
              destInput.value = entry.destinationAddress;
            }
          } else if ((!entry.type || entry.type === 'location') && entry.result) {
            if (currentMode === 'location') {
              // Apply a location entry in location mode
              if (spatialParam) {
                const wkt = toWkt(entry.result.latitude, entry.result.longitude);
                await writeSpatialValue(spatialParam, wkt);
              }
              addressInput.value = entry.query;
              lastSubmittedQuery = entry.query;
              locateBtn.disabled = true;
              const successCheck = document.getElementById('successCheck') as HTMLSpanElement;
              successCheck.classList.remove('hidden');
            } else {
              // In route mode: fill the focused field with the location query
              const destInput = document.getElementById('destinationInput') as HTMLInputElement;
              if (lastFocusedRouteField === 'origin') {
                originInput.value = entry.query;
              } else {
                destInput.value = entry.query;
              }
            }
          }
        } catch {
          // Not valid JSON
        }
      }
      updateRecentCount();
    } catch {
      updateRecentCount();
    }
  };
  recentBtn.addEventListener('click', handleRecent);
  recentBtnRoute.addEventListener('click', handleRecent);

  // Enter key on primary destination input
  destinationInput.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submitRoute();
    }
  });

  // Travel mode icon buttons
  const travelModeBtns = document.querySelectorAll('.travel-mode-btn') as NodeListOf<HTMLButtonElement>;
  const travelModeInput = document.getElementById('travelModeSelect') as HTMLInputElement;

  // Disable travel mode buttons initially
  updateTravelModeBtnState();

  // Enable/disable when origin or destination inputs change + clear error/success states
  const handleOriginChange = () => {
    updateTravelModeBtnState();
    originInput.classList.remove('input-error');
    const originCheck = document.getElementById('originCheck') as HTMLSpanElement;
    originCheck.classList.add('hidden');
  };
  const handleDestinationChange = () => {
    updateTravelModeBtnState();
    destinationInput.classList.remove('input-error');
    const destinationCheck = document.getElementById('destinationCheck') as HTMLSpanElement;
    destinationCheck.classList.add('hidden');
  };
  originInput.addEventListener('input', handleOriginChange);
  originInput.addEventListener('change', handleOriginChange);
  destinationInput.addEventListener('input', handleDestinationChange);
  destinationInput.addEventListener('change', handleDestinationChange);

  travelModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      // Deactivate all, activate clicked
      travelModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Update hidden input value
      travelModeInput.value = btn.dataset.mode || 'DRIVE';
      // Execute route immediately
      submitRoute();
    });
  });
}

/**
 * Switch between Location and Route modes.
 */
/**
 * Providers that support routing directions.
 */
const ROUTING_PROVIDERS = ['google', 'mapbox', 'osm', 'geoapify'];

/**
 * Show or hide the route mode toggle button based on whether the provider supports routing.
 */
function updateRouteModeAvailability(): void {
  const toRouteBtn = document.getElementById('toRouteBtn') as HTMLButtonElement;
  const settings = getSettings();
  if (ROUTING_PROVIDERS.includes(settings.provider)) {
    toRouteBtn.classList.remove('hidden');
  } else {
    toRouteBtn.classList.add('hidden');
    // If currently in route mode with an unsupported provider, switch back to location
    if (currentMode === 'route') {
      switchMode('location');
    }
  }
}

async function switchMode(mode: 'location' | 'route'): Promise<void> {
  currentMode = mode;
  const locationMode = document.getElementById('locationMode') as HTMLDivElement;
  const routeMode = document.getElementById('routeMode') as HTMLDivElement;

  if (mode === 'location') {
    locationMode.classList.remove('hidden');
    routeMode.classList.add('hidden');
  } else {
    locationMode.classList.add('hidden');
    routeMode.classList.remove('hidden');
    // Ensure pathParam is loaded when entering route mode
    const settings = getSettings();
    if (settings.pathParamName && !pathParam) {
      pathParam = await getParameterByName(settings.pathParamName);
    }
    updateTravelModeVisibility();
  }
}

/**
 * Show the travel mode dropdown only when Google is the selected provider.
 */
function updateTravelModeVisibility(): void {
  const travelModeRow = document.getElementById('travelModeRow') as HTMLDivElement;
  const settings = getSettings();
  if (ROUTING_PROVIDERS.includes(settings.provider)) {
    travelModeRow.classList.remove('hidden');
  } else {
    travelModeRow.classList.add('hidden');
  }
  updateTravelModeBtnState();
}

/**
 * Enable or disable travel mode buttons based on whether
 * both origin and destination have values.
 */
function updateTravelModeBtnState(): void {
  const originInput = document.getElementById('originInput') as HTMLInputElement;
  const destinationInput = document.getElementById('destinationInput') as HTMLInputElement;
  const travelModeBtns = document.querySelectorAll('.travel-mode-btn') as NodeListOf<HTMLButtonElement>;

  const originVal = originInput?.value.trim() || '';
  const destVal = destinationInput?.value.trim() || '';
  const bothFilled = originVal !== '' && destVal !== '';
  const unchanged = originVal === lastRoutedOrigin && destVal === lastRoutedDestination;

  travelModeBtns.forEach(btn => {
    if (!bothFilled) {
      // All disabled when inputs are empty
      btn.disabled = true;
    } else if (unchanged) {
      // Only disable the button for the mode that was already computed
      btn.disabled = btn.dataset.mode === lastRoutedMode;
    } else {
      // Inputs changed — all enabled
      btn.disabled = false;
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
 * Submit a geocoding request. Handles both single-address and multi-address (path) mode.
 */
/**
 * Submit a single-address geocode (Location mode).
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
    let result = geocodeCache.get(address, settings.provider);
    if (!result) {
      const provider = getProvider(settings.provider);
      result = await provider.geocode(address, settings.apiKey);
      geocodeCache.put(address, settings.provider, result);
    }

    // Write POINT to spatial parameter
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
 * Submit a route (Route mode) — geocodes origin + all destinations, writes LINESTRING.
 */
async function submitRoute(): Promise<void> {
  const settings = getSettings();
  const originInputEl = document.getElementById('originInput') as HTMLInputElement;
  const destinationInputEl = document.getElementById('destinationInput') as HTMLInputElement;

  // Clear any previous error highlights
  originInputEl.classList.remove('input-error');
  destinationInputEl.classList.remove('input-error');

  if (!settings.provider) {
    showStatus('No provider configured. Click Settings to set one up.', 'error');
    return;
  }

  if (!pathParam) {
    showStatus('No path parameter configured. Go to Settings to set one up.', 'error');
    return;
  }

  const allAddresses = getAllAddresses();
  if (allAddresses.length < 2) {
    if (!originInputEl.value.trim()) originInputEl.classList.add('input-error');
    if (!destinationInputEl.value.trim()) destinationInputEl.classList.add('input-error');
    showStatus('A route requires an origin and a destination.', 'error');
    return;
  }

  const originAddress = allAddresses[0];
  const destinationAddress = allAddresses[1];

  showStatus('Computing route...', 'loading');

  try {
    const travelModeInput = document.getElementById('travelModeSelect') as HTMLInputElement;
    const travelMode = (travelModeInput.value || 'DRIVE');

    // Use routing APIs for Google and Mapbox; straight line for others
    if (settings.provider === 'google') {
      const routeResult = await computeRoute(
        originAddress,
        destinationAddress,
        travelMode as TravelMode,
        settings.apiKey
      );

      const lineString = toLineString(routeResult.points);
      if (lineString) {
        await writeSpatialValue(pathParam, lineString);
      }

      if (routeResult.points.length > 0 && lineString) {
        const first = routeResult.points[0];
        const last = routeResult.points[routeResult.points.length - 1];
        geocodeCache.putRoute(originAddress, destinationAddress, settings.provider,
          { latitude: first.latitude, longitude: first.longitude, displayName: originAddress }, lineString);
        if (!geocodeCache.get(originAddress, settings.provider)) {
          geocodeCache.put(originAddress, settings.provider, { latitude: first.latitude, longitude: first.longitude, displayName: originAddress });
        }
        if (!geocodeCache.get(destinationAddress, settings.provider)) {
          geocodeCache.put(destinationAddress, settings.provider, { latitude: last.latitude, longitude: last.longitude, displayName: destinationAddress });
        }
      }

    } else if (settings.provider === 'mapbox') {
      // Mapbox: geocode both addresses first, then call Directions API
      const provider = getProvider(settings.provider);

      let originResult = geocodeCache.get(originAddress, settings.provider);
      if (!originResult) {
        try {
          originResult = await provider.geocode(originAddress, settings.apiKey);
          geocodeCache.put(originAddress, settings.provider, originResult);
        } catch {
          originInputEl.classList.add('input-error');
          showStatus('Could not resolve origin address.', 'error');
          return;
        }
      }

      let destResult = geocodeCache.get(destinationAddress, settings.provider);
      if (!destResult) {
        try {
          destResult = await provider.geocode(destinationAddress, settings.apiKey);
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        } catch {
          destinationInputEl.classList.add('input-error');
          showStatus('Could not resolve destination address.', 'error');
          return;
        }
      }

      const profile = toMapboxProfile(travelMode);
      const routeResult = await computeMapboxRoute(
        { latitude: originResult.latitude, longitude: originResult.longitude },
        { latitude: destResult.latitude, longitude: destResult.longitude },
        profile,
        settings.apiKey
      );

      const lineString = toLineString(routeResult.points);
      if (lineString) {
        await writeSpatialValue(pathParam, lineString);
        geocodeCache.putRoute(originAddress, destinationAddress, settings.provider,
          { latitude: originResult.latitude, longitude: originResult.longitude, displayName: originAddress }, lineString);
      }

    } else if (settings.provider === 'osm') {
      // OSM: geocode with Nominatim, then route with OSRM
      const provider = getProvider(settings.provider);

      let originResult = geocodeCache.get(originAddress, settings.provider);
      if (!originResult) {
        try {
          originResult = await provider.geocode(originAddress, settings.apiKey);
          geocodeCache.put(originAddress, settings.provider, originResult);
        } catch {
          originInputEl.classList.add('input-error');
          showStatus('Could not resolve origin address.', 'error');
          return;
        }
      }

      let destResult = geocodeCache.get(destinationAddress, settings.provider);
      if (!destResult) {
        try {
          destResult = await provider.geocode(destinationAddress, settings.apiKey);
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        } catch {
          destinationInputEl.classList.add('input-error');
          showStatus('Could not resolve destination address.', 'error');
          return;
        }
      }

      const profile = toOsrmProfile(travelMode);
      const routeResult = await computeOsrmRoute(
        { latitude: originResult.latitude, longitude: originResult.longitude },
        { latitude: destResult.latitude, longitude: destResult.longitude },
        profile
      );

      const lineString = toLineString(routeResult.points);
      if (lineString) {
        await writeSpatialValue(pathParam, lineString);
        geocodeCache.putRoute(originAddress, destinationAddress, settings.provider,
          { latitude: originResult.latitude, longitude: originResult.longitude, displayName: originAddress }, lineString);

        if (!geocodeCache.get(originAddress, settings.provider)) {
          geocodeCache.put(originAddress, settings.provider, originResult);
        }
        if (!geocodeCache.get(destinationAddress, settings.provider)) {
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        }
      }

    } else if (settings.provider === 'geoapify') {
      // Geoapify: geocode both addresses, then route with Geoapify Routing API
      const provider = getProvider(settings.provider);

      let originResult = geocodeCache.get(originAddress, settings.provider);
      if (!originResult) {
        try {
          originResult = await provider.geocode(originAddress, settings.apiKey);
          geocodeCache.put(originAddress, settings.provider, originResult);
        } catch {
          originInputEl.classList.add('input-error');
          showStatus('Could not resolve origin address.', 'error');
          return;
        }
      }

      let destResult = geocodeCache.get(destinationAddress, settings.provider);
      if (!destResult) {
        try {
          destResult = await provider.geocode(destinationAddress, settings.apiKey);
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        } catch {
          destinationInputEl.classList.add('input-error');
          showStatus('Could not resolve destination address.', 'error');
          return;
        }
      }

      const mode = toGeoapifyMode(travelMode);
      const routeResult = await computeGeoapifyRoute(
        { latitude: originResult.latitude, longitude: originResult.longitude },
        { latitude: destResult.latitude, longitude: destResult.longitude },
        mode,
        settings.apiKey
      );

      const lineString = toLineString(routeResult.points);
      if (lineString) {
        await writeSpatialValue(pathParam, lineString);
        geocodeCache.putRoute(originAddress, destinationAddress, settings.provider,
          { latitude: originResult.latitude, longitude: originResult.longitude, displayName: originAddress }, lineString);

        if (!geocodeCache.get(originAddress, settings.provider)) {
          geocodeCache.put(originAddress, settings.provider, originResult);
        }
        if (!geocodeCache.get(destinationAddress, settings.provider)) {
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        }
      }

    } else {
      // For other providers, geocode both addresses and draw a straight line
      const provider = getProvider(settings.provider);
      const resolvedPoints: Array<{ latitude: number; longitude: number }> = [];

      // Geocode origin
      let originResult = geocodeCache.get(originAddress, settings.provider);
      if (!originResult) {
        try {
          originResult = await provider.geocode(originAddress, settings.apiKey);
          geocodeCache.put(originAddress, settings.provider, originResult);
        } catch {
          originInputEl.classList.add('input-error');
          showStatus('Could not resolve origin address.', 'error');
          return;
        }
      }
      resolvedPoints.push({ latitude: originResult.latitude, longitude: originResult.longitude });

      // Geocode destination
      let destResult = geocodeCache.get(destinationAddress, settings.provider);
      if (!destResult) {
        try {
          destResult = await provider.geocode(destinationAddress, settings.apiKey);
          geocodeCache.put(destinationAddress, settings.provider, destResult);
        } catch {
          destinationInputEl.classList.add('input-error');
          showStatus('Could not resolve destination address.', 'error');
          return;
        }
      }
      resolvedPoints.push({ latitude: destResult.latitude, longitude: destResult.longitude });

      // Write LINESTRING to path parameter
      const lineString = toLineString(resolvedPoints);
      if (lineString) {
        await writeSpatialValue(pathParam, lineString);

        // Cache the route for recent requests
        geocodeCache.putRoute(
          originAddress,
          destinationAddress,
          settings.provider,
          { latitude: resolvedPoints[0].latitude, longitude: resolvedPoints[0].longitude, displayName: originAddress },
          lineString
        );

        // Also cache origin and destination as individual locations (if not already cached)
        if (!geocodeCache.get(originAddress, settings.provider)) {
          geocodeCache.put(originAddress, settings.provider, {
            latitude: resolvedPoints[0].latitude,
            longitude: resolvedPoints[0].longitude,
            displayName: originAddress,
          });
        }
        if (!geocodeCache.get(destinationAddress, settings.provider)) {
          geocodeCache.put(destinationAddress, settings.provider, {
            latitude: resolvedPoints[1].latitude,
            longitude: resolvedPoints[1].longitude,
            displayName: destinationAddress,
          });
        }
      }
    }

    // Clear error highlights and show success checks
    originInputEl.classList.remove('input-error');
    destinationInputEl.classList.remove('input-error');
    const originCheck = document.getElementById('originCheck') as HTMLSpanElement;
    const destinationCheck = document.getElementById('destinationCheck') as HTMLSpanElement;
    originCheck.classList.remove('hidden');
    destinationCheck.classList.remove('hidden');

    // Track last routed addresses and mode, then update button states
    lastRoutedOrigin = originInputEl.value.trim();
    lastRoutedDestination = destinationInputEl.value.trim();
    const travelModeInputFinal = document.getElementById('travelModeSelect') as HTMLInputElement;
    lastRoutedMode = travelModeInputFinal.value || 'DRIVE';
    updateTravelModeBtnState();

    clearStatus();
    updateRecentCount();
  } catch (err: any) {
    // Highlight both inputs since we can't determine which address failed
    originInputEl.classList.add('input-error');
    destinationInputEl.classList.add('input-error');
    showStatus(`Route failed: ${err.message}`, 'error');
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
    <h3 class="modal-title">No Location Parameter Found</h3>
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

/**
 * Hide the loading state and show the appropriate mode UI.
 */
function hideLoadingState(): void {
  const loadingState = document.getElementById('loadingState') as HTMLDivElement;
  loadingState.classList.add('hidden');
  // Show location mode by default
  const locationMode = document.getElementById('locationMode') as HTMLDivElement;
  locationMode.classList.remove('hidden');
}

/**
 * Handle external settings changes (e.g., another user updated settings in a collaborative session).
 */
async function onSettingsChanged(): Promise<void> {
  const settings = getSettings();

  // Re-load parameters
  const namesToLoad = [settings.spatialParamName];
  if (settings.pathParamName) namesToLoad.push(settings.pathParamName);
  const params = await getParametersByNames(namesToLoad);
  spatialParam = params[settings.spatialParamName];
  pathParam = settings.pathParamName ? params[settings.pathParamName] : null;

  // Update UI state
  applyBackgroundColor();
  updateRouteModeAvailability();
  updateTravelModeVisibility();
}

/**
 * Add an additional destination input row (C, D, E...).
 * The first destination (B) is always present in the HTML.
 */

/**
 * Get origin and destination addresses in order. Used by Route mode.
 */
function getAllAddresses(): string[] {
  const addresses: string[] = [];

  const originInput = document.getElementById('originInput') as HTMLInputElement;
  const origin = originInput.value.trim();
  if (origin) addresses.push(origin);

  const destinationInput = document.getElementById('destinationInput') as HTMLInputElement;
  const dest = destinationInput.value.trim();
  if (dest) addresses.push(dest);

  return addresses;
}

// Initialize when the DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

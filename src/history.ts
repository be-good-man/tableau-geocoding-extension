
declare const tableau: any;

interface HistoryEntry {
  type?: 'location' | 'route';
  query: string;
  provider: string;
  result: { latitude: number; longitude: number; displayName: string };
  routeWkt?: string;
  originAddress?: string;
  destinationAddress?: string;
  timestamp: number;
}

interface HistoryPayload {
  entries: HistoryEntry[];
  currentMode: 'location' | 'route';
  focusedField?: 'origin' | 'destination';
}

/**
 * Request type icons
 */
function getTypeIcon(type: string): string {
  if (type === 'route') {
    // Route icon: two dots connected by a path
    return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="4" cy="12" r="2" stroke="#e15759" stroke-width="1.5" fill="none"/>
      <circle cx="12" cy="4" r="2" stroke="#e15759" stroke-width="1.5" fill="none"/>
      <path d="M5.5 10.5C7 9 9 7 10.5 5.5" stroke="#e15759" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 2"/>
    </svg>`;
  }
  // Location icon: pin/crosshair
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="4.5" stroke="#4e79a7" stroke-width="1.5" fill="none"/>
    <circle cx="8" cy="8" r="1.5" fill="#4e79a7"/>
    <line x1="8" y1="2" x2="8" y2="4" stroke="#4e79a7" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="8" y1="12" x2="8" y2="14" stroke="#4e79a7" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="2" y1="8" x2="4" y2="8" stroke="#4e79a7" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="8" x2="14" y2="8" stroke="#4e79a7" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;
}

/**
 * Provider labels
 */
function getProviderLabel(providerId: string): string {
  const labels: Record<string, string> = {
    google: 'Google',
    mapbox: 'Mapbox',
    'salesforce-maps': 'SF Maps',
    geocodio: 'Geocodio',
    osm: 'OSM',
  };
  return labels[providerId] || providerId;
}

let historyEntries: HistoryEntry[] = [];
let currentMode: 'location' | 'route' = 'location';
let focusedField: 'origin' | 'destination' = 'origin';

async function initializeHistory(): Promise<void> {
  try {
    await tableau.extensions.initializeAsync({ isDialogExtension: true });
  } catch (e) {
    console.error('History dialog init failed:', e);
    // Even if init fails, try to render from URL hash
  }

  let rawPayload = '';

  // Source 1: settings (most reliable — saved by parent before opening dialog)
  try {
    const fromSettings = tableau.extensions.settings.get('_historyData');
    if (fromSettings && fromSettings.length > 2) rawPayload = fromSettings;
  } catch { /* settings not available */ }

  // Source 2: URL hash (fallback)
  if (!rawPayload || rawPayload.length < 3) {
    try {
      const hash = window.location.hash;
      if (hash && hash.length > 1) {
        rawPayload = decodeURIComponent(hash.substring(1));
      }
    } catch { /* not available */ }
  }

  // Source 3: dialogPayload
  if (!rawPayload || rawPayload.length < 3) {
    try {
      const dp = tableau.extensions.ui.dialogPayload;
      if (dp && dp.length > 2) rawPayload = dp;
    } catch { /* not available */ }
  }

  // Parse the payload
  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload);
      if (parsed && parsed.entries && Array.isArray(parsed.entries)) {
        historyEntries = parsed.entries;
        currentMode = parsed.currentMode || 'location';
        focusedField = parsed.focusedField || 'origin';
      } else if (Array.isArray(parsed)) {
        historyEntries = parsed;
      }
    } catch {
      historyEntries = [];
    }
  }

  renderList();

  // Clear button
  const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
  clearBtn.addEventListener('click', () => {
    historyEntries = [];
    renderList();
    tableau.extensions.ui.closeDialog('cleared');
  });

  // Close button
  const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement;
  closeBtn.addEventListener('click', () => {
    tableau.extensions.ui.closeDialog('closed');
  });
}

function renderList(): void {
  const historyList = document.getElementById('historyList') as HTMLUListElement;
  const emptyState = document.getElementById('emptyState') as HTMLDivElement;

  historyList.innerHTML = '';

  if (historyEntries.length === 0) {
    emptyState.classList.remove('hidden');
    historyList.style.display = 'none';
    return;
  }

  emptyState.classList.add('hidden');
  historyList.style.display = 'block';

  historyEntries.forEach(entry => {
    const entryType = entry.type || 'location';
    const isSelectable = isEntrySelectable(entryType);

    const li = document.createElement('li');
    li.className = 'history-item';
    li.setAttribute('role', 'button');
    if (isSelectable) {
      li.tabIndex = 0;
      li.setAttribute('aria-label', `Select ${entry.query}`);
    } else {
      li.classList.add('disabled');
      li.setAttribute('aria-disabled', 'true');
    }

    // Type icon (location pin or route path)
    const typeIconSpan = document.createElement('span');
    typeIconSpan.className = 'type-icon';
    typeIconSpan.innerHTML = getTypeIcon(entryType);

    // Query text
    const querySpan = document.createElement('span');
    querySpan.className = 'query';
    querySpan.textContent = entry.query;

    // Provider badge
    const providerSpan = document.createElement('span');
    providerSpan.className = 'provider-tag';
    providerSpan.textContent = getProviderLabel(entry.provider);

    li.appendChild(typeIconSpan);
    li.appendChild(querySpan);

    // In route mode, show which field a location entry will fill
    if (currentMode === 'route' && entryType === 'location') {
      const targetSpan = document.createElement('span');
      targetSpan.className = 'target-tag';
      targetSpan.textContent = focusedField === 'origin' ? 'Origin' : 'Dest';
      li.appendChild(targetSpan);
    }

    li.appendChild(providerSpan);

    // Only allow clicking/keyboard-selecting selectable items
    if (isSelectable) {
      const selectEntry = () => {
        tableau.extensions.ui.closeDialog(JSON.stringify(entry));
      };
      li.addEventListener('click', selectEntry);
      li.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectEntry();
        }
      });
    }

    historyList.appendChild(li);
  });
}

/**
 * Determine if an entry is selectable based on current mode.
 * - Location entries are always selectable (in location mode they apply the geocode;
 *   in route mode they fill the focused input field).
 * - Route entries are only selectable in route mode.
 */
function isEntrySelectable(entryType: string): boolean {
  if (entryType === 'location') return true;
  if (entryType === 'route') return currentMode === 'route';
  return true;
}

document.addEventListener('DOMContentLoaded', initializeHistory);

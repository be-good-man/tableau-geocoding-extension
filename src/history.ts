
declare const tableau: any;

interface HistoryEntry {
  query: string;
  provider: string;
  result: { latitude: number; longitude: number; displayName: string };
  timestamp: number;
}

/**
 * Provider icon SVGs
 */
function getProviderIcon(providerId: string): string {
  switch (providerId) {
    case 'google':
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#4285F4"/><text x="8" y="11.5" text-anchor="middle" font-size="10" font-weight="bold" fill="white" font-family="Arial">G</text></svg>`;
    case 'mapbox':
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#000"/><circle cx="8" cy="8" r="3" fill="none" stroke="white" stroke-width="1.5"/><circle cx="8" cy="8" r="1" fill="white"/></svg>`;
    case 'salesforce-maps':
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#00A1E0"/><text x="8" y="11.5" text-anchor="middle" font-size="9" font-weight="bold" fill="white" font-family="Arial">SF</text></svg>`;
    case 'geocodio':
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#6C63FF"/><text x="8" y="11.5" text-anchor="middle" font-size="9" font-weight="bold" fill="white" font-family="Arial">Gc</text></svg>`;
    case 'osm':
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#7EBC6F"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="bold" fill="white" font-family="Arial">OSM</text></svg>`;
    default:
      return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill="#999"/><circle cx="8" cy="7" r="2.5" fill="none" stroke="white" stroke-width="1.5"/><line x1="8" y1="10" x2="8" y2="13" stroke="white" stroke-width="1.5"/></svg>`;
  }
}

/**
 * Provider labels
 */
function getProviderLabel(providerId: string): string {
  const labels: Record<string, string> = {
    google: 'Google Geocoding',
    mapbox: 'Mapbox',
    'salesforce-maps': 'Salesforce Maps',
    geocodio: 'Geocodio',
    osm: 'OpenStreetMap (Nominatim)',
  };
  return labels[providerId] || providerId;
}

let historyEntries: HistoryEntry[] = [];

async function initializeHistory(): Promise<void> {
  try {
    await tableau.extensions.initializeAsync({ isDialogExtension: true });
  } catch (e) {
    console.error('History dialog init failed:', e);
  }

  // Try to get history data from dialogPayload first, then fall back to settings
  let rawPayload = '';
  try {
    rawPayload = tableau.extensions.ui.dialogPayload || '';
  } catch {
    rawPayload = '';
  }

  // Fallback: read from settings (works across all API versions)
  if (!rawPayload) {
    try {
      rawPayload = tableau.extensions.settings.get('_historyData') || '[]';
    } catch {
      rawPayload = '[]';
    }
  }

  try {
    historyEntries = JSON.parse(rawPayload);
  } catch {
    historyEntries = [];
  }

  renderList();

  // Clear button
  const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
  clearBtn.addEventListener('click', () => {
    historyEntries = [];
    renderList();
    // Signal to parent that cache was cleared
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
    const li = document.createElement('li');
    li.className = 'history-item';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'provider-icon';
    iconSpan.title = getProviderLabel(entry.provider);
    iconSpan.innerHTML = getProviderIcon(entry.provider);

    const querySpan = document.createElement('span');
    querySpan.className = 'query';
    querySpan.textContent = entry.query;

    const coordsSpan = document.createElement('span');
    coordsSpan.className = 'coords';
    coordsSpan.textContent = `POINT(${entry.result.longitude.toFixed(4)} ${entry.result.latitude.toFixed(4)})`;

    li.appendChild(iconSpan);
    li.appendChild(querySpan);
    li.appendChild(coordsSpan);

    // Clicking a history item sends it back to the parent and closes
    li.addEventListener('click', () => {
      tableau.extensions.ui.closeDialog(JSON.stringify(entry));
    });

    historyList.appendChild(li);
  });
}

document.addEventListener('DOMContentLoaded', initializeHistory);

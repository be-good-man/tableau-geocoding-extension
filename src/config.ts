import { getAllProviders, getProvider } from './providers';
import { getSettings, saveSettings } from './settings';
import { getAllParameters } from './parameters';

declare const tableau: any;

/**
 * Configuration dialog entry point.
 * Populates dropdowns and handles Save/Cancel.
 */
async function initializeConfig(): Promise<void> {
  await tableau.extensions.initializeAsync({ isDialogExtension: true });

  const providers = getAllProviders();
  const settings = getSettings();

  // Populate provider dropdown
  const providerSelect = document.getElementById('providerSelect') as HTMLSelectElement;
  providers.forEach(p => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = p.label;
    if (p.id === settings.provider) {
      option.selected = true;
    }
    providerSelect.appendChild(option);
  });

  // Populate spatial parameter dropdown
  const paramSelect = document.getElementById('paramSelect') as HTMLSelectElement;
  const parameters = await getAllParameters();
  parameters.forEach((p: any) => {
    const option = document.createElement('option');
    option.value = p.name;
    option.textContent = p.name;
    if (p.name === settings.spatialParamName) {
      option.selected = true;
    }
    paramSelect.appendChild(option);
  });

  // Pre-fill API key if saved
  const apiKeyInput = document.getElementById('apiKeyInput') as HTMLInputElement;
  if (settings.apiKey) {
    apiKeyInput.value = settings.apiKey;
  }

  // Show/hide API key field based on selected provider
  updateApiKeyVisibility(providerSelect.value);

  // Provider change handler
  providerSelect.addEventListener('change', () => {
    updateApiKeyVisibility(providerSelect.value);
  });

  // Save button
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  saveBtn.addEventListener('click', async () => {
    const selectedProvider = providerSelect.value;
    const enteredKey = apiKeyInput.value.trim();
    const selectedParam = paramSelect.value;

    if (!selectedProvider) {
      alert('Please select a geocoding provider.');
      return;
    }

    if (!selectedParam) {
      alert('Please select a spatial parameter.');
      return;
    }

    // Validate API key if provider requires it
    const provider = getProvider(selectedProvider);
    if (provider.requiresApiKey && !enteredKey) {
      alert(`${provider.label} requires an API key. Please enter one.`);
      return;
    }

    await saveSettings({
      provider: selectedProvider,
      apiKey: enteredKey,
      spatialParamName: selectedParam,
    });

    tableau.extensions.ui.closeDialog('saved');
  });

  // Cancel button
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  cancelBtn.addEventListener('click', () => {
    tableau.extensions.ui.closeDialog('cancelled');
  });
}

/**
 * Show or hide the API key field based on whether the provider needs one.
 */
function updateApiKeyVisibility(providerId: string): void {
  const apiKeyGroup = document.getElementById('apiKeyGroup') as HTMLDivElement;
  const noKeyMessage = document.getElementById('noKeyMessage') as HTMLDivElement;

  if (!providerId) {
    apiKeyGroup.style.display = 'block';
    noKeyMessage.style.display = 'none';
    return;
  }

  try {
    const provider = getProvider(providerId);
    if (provider.requiresApiKey) {
      apiKeyGroup.style.display = 'block';
      noKeyMessage.style.display = 'none';
    } else {
      apiKeyGroup.style.display = 'none';
      noKeyMessage.style.display = 'block';
    }
  } catch {
    apiKeyGroup.style.display = 'block';
    noKeyMessage.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initializeConfig);

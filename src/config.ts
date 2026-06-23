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
  // Populate spatial parameter dropdown (only spatial type parameters)
  const paramSelect = document.getElementById('paramSelect') as HTMLSelectElement;
  const parameters = await getAllParameters();
  const spatialParameters = parameters.filter((p: any) => p.dataType === 'spatial');
  spatialParameters.forEach((p: any) => {
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

  // Background color controls
  const bgColorPicker = document.getElementById('bgColorPicker') as HTMLInputElement;
  const pickerBg = document.getElementById('pickerBg') as HTMLDivElement;
  const colorValue = document.getElementById('colorValue') as HTMLSpanElement;
  const swatches = document.querySelectorAll('.swatch') as NodeListOf<HTMLButtonElement>;

  // Set swatch background colors from data attributes
  swatches.forEach(swatch => {
    swatch.style.background = swatch.dataset.color || '#fff';
  });

  // Load saved background setting
  const savedBgColor = tableau.extensions.settings.get('bgColor') || '#ffffff';
  bgColorPicker.value = savedBgColor;
  pickerBg.style.background = savedBgColor;
  colorValue.textContent = savedBgColor;
  highlightActiveSwatch(savedBgColor);

  // Swatch click handler
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color || '#ffffff';
      bgColorPicker.value = color;
      pickerBg.style.background = color;
      colorValue.textContent = color;
      highlightActiveSwatch(color);
    });
  });

  // Color picker change handler
  bgColorPicker.addEventListener('input', () => {
    pickerBg.style.background = bgColorPicker.value;
    colorValue.textContent = bgColorPicker.value;
    highlightActiveSwatch(bgColorPicker.value);
  });

  function highlightActiveSwatch(activeColor: string): void {
    swatches.forEach(s => {
      if (s.dataset.color?.toLowerCase() === activeColor.toLowerCase()) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });
  }

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

    // Save background color separately (not part of core settings interface)
    tableau.extensions.settings.set('bgColor', bgColorPicker.value);
    await tableau.extensions.settings.saveAsync();

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

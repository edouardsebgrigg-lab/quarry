// Player settings (not part of save games).
import { DEFAULT_BINDINGS } from '../input/index.js';

const KEY = 'quarry.settings';

export function defaultSettings() {
  return {
    bindings: { ...DEFAULT_BINDINGS },
    volume: 0.8,
    uiScale: 1,
    fullscreen: true,
    autosave: true,
  };
}

export function loadSettings(storage) {
  const defaults = defaultSettings();
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!saved) return defaults;
    return { ...defaults, ...saved, bindings: { ...defaults.bindings, ...saved.bindings } };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings just won't persist.
  }
}

export function applyUiScale(settings) {
  document.documentElement.style.fontSize = `${16 * settings.uiScale}px`;
}

// Player settings (not part of save games).
import { DEFAULT_BINDINGS, BINDINGS_VERSION } from '../input/index.js';

const KEY = 'quarry.settings';

export function defaultSettings() {
  return {
    bindings: { ...DEFAULT_BINDINGS },
    bindingsVersion: BINDINGS_VERSION,
    volume: 0.8,
    ambientVolume: 0.8,
    uiScale: 1,
    fullscreen: true,
    autosave: true,
    mouseSensitivity: 1,
    invertY: false,
    graphics: 'high',
  };
}

export function loadSettings(storage) {
  const defaults = defaultSettings();
  try {
    const saved = JSON.parse(storage.getItem(KEY) ?? 'null');
    if (!saved) return defaults;
    // Old key layouts clash with the current controls: start fresh.
    const bindings = saved.bindingsVersion === BINDINGS_VERSION
      ? { ...defaults.bindings, ...saved.bindings }
      : defaults.bindings;
    for (const action of Object.keys(bindings)) {
      if (!(action in DEFAULT_BINDINGS)) delete bindings[action];
    }
    return { ...defaults, ...saved, bindings, bindingsVersion: BINDINGS_VERSION };
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

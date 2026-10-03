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
    guideBeam: true, // the column of light where the current goal wants you
    mentorTips: true, // Ray's short tips when something goes wrong
    mouseSensitivity: 1,
    invertY: false,
    diggerControls: 'assisted', // or 'direct': boom, stick, bucket and swing each on their own keys
    diggerSensitivity: 1,
    repeatShovel: false,
    cameraMotion: 1,
    fieldOfView: 72,
    graphics: 'high',
  };
}

// Keep old settings and edited local-storage values safe for the live camera.
export function comfortSettings(settings = {}) {
  const bounded = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value)) : fallback;
  return {
    cameraMotion: bounded(settings.cameraMotion, 1, 0, 1),
    fieldOfView: bounded(settings.fieldOfView, 72, 50, 95),
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
    if (saved.bindingsVersion === BINDINGS_VERSION && saved.bindings) {
      const customKeys = new Set(Object.entries(saved.bindings)
        .filter(([action]) => action in DEFAULT_BINDINGS).map(([, code]) => code));
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        if (!(action in saved.bindings) && customKeys.has(bindings[action])) bindings[action] = null;
      }
    }
    return { ...defaults, ...saved, ...comfortSettings(saved), bindings, bindingsVersion: BINDINGS_VERSION };
  } catch {
    return defaults;
  }
}

export function saveSettings(storage, settings) {
  try {
    storage.setItem(KEY, JSON.stringify({ ...settings, ...comfortSettings(settings) }));
  } catch {
    // Storage full or blocked: settings just won't persist.
  }
}

export function applyUiScale(settings) {
  document.documentElement.style.fontSize = `${16 * settings.uiScale}px`;
}

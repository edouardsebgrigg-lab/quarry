// Default hotkeys (KeyboardEvent.code values). Esc is fixed and always opens the menu.
// Bump BINDINGS_VERSION when defaults change in a way that clashes with old saved settings.

export const BINDINGS_VERSION = 2;

export const DEFAULT_BINDINGS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  tip: 'KeyT',
  loadPile: 'KeyF',
  repair: 'KeyR',
  camera: 'KeyC',
  recover: 'KeyV',
  map: 'Tab',
  pause: 'KeyP',
  speed1: 'Digit1',
  speed2: 'Digit2',
  speed3: 'Digit3',
  shop: 'KeyB',
  market: 'KeyM',
  dev: 'F1',
};

export const ACTION_LABELS = {
  forward: 'Move / drive forward',
  back: 'Move back / brake / reverse',
  left: 'Move left / steer left',
  right: 'Move right / steer right',
  jump: 'Jump / handbrake',
  sprint: 'Sprint',
  interact: 'Get in / get out',
  tip: 'Tip truck load (at the yard)',
  loadPile: 'Load truck from face pile',
  repair: 'Service / repair machine',
  camera: 'Switch camera (cab / outside)',
  recover: 'Recover stuck vehicle',
  map: 'Site map',
  pause: 'Pause time',
  speed1: 'Speed 1×',
  speed2: 'Speed 2×',
  speed3: 'Speed 4×',
  shop: 'Shop',
  market: 'Market',
  dev: 'Dev panel',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  return code;
}

// Assigns `code` to `action`. If another action used that key, it gets
// this action's old key (a swap), so no two actions share a key.
export function rebind(bindings, action, code) {
  const next = { ...bindings };
  const clash = Object.keys(next).find((a) => a !== action && next[a] === code);
  if (clash) next[clash] = bindings[action];
  next[action] = code;
  return next;
}

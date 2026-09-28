// Default hotkeys (KeyboardEvent.code values). Esc is fixed and always opens the menu.

export const DEFAULT_BINDINGS = {
  dig: 'KeyD',
  haul: 'KeyH',
  sell: 'KeyS',
  repair: 'KeyR',
  nextMachine: 'Tab',
  pause: 'Space',
  speed1: 'Digit1',
  speed2: 'Digit2',
  speed3: 'Digit3',
  shop: 'KeyB',
  market: 'KeyM',
  dev: 'F1',
};

export const ACTION_LABELS = {
  dig: 'Dig',
  haul: 'Haul',
  sell: 'Sell everything in the yard',
  repair: 'Service / repair',
  nextMachine: 'Next machine',
  pause: 'Pause / unpause',
  speed1: 'Speed 1×',
  speed2: 'Speed 2×',
  speed3: 'Speed 4×',
  shop: 'Shop',
  market: 'Market',
  dev: 'Dev panel',
};

// Actions that repeat while the key is held down.
export const HOLD_ACTIONS = new Set(['dig', 'haul']);

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
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

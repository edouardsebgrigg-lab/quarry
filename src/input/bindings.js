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
  handbook: 'F2',
  hints: 'KeyH',
  goal: 'KeyJ',
  controls: 'KeyG',
  works: 'KeyF',
  boomUp: 'ArrowUp',
  boomDown: 'ArrowDown',
  bucketCurl: 'ArrowLeft',
  bucketDump: 'ArrowRight',
  stickOut: 'KeyI',
  stickIn: 'KeyK',
  slewLeft: 'KeyU',
  slewRight: 'KeyO',
  freeLook: 'KeyX',
  precision: 'ShiftRight',
  survey: 'KeyL',
  cruise: 'KeyZ',
  attachments: 'KeyQ',
  dev: 'F1',
};

export const ACTION_LABELS = {
  forward: 'Move / drive forward',
  back: 'Move back / brake / reverse',
  left: 'Move left / steer left',
  right: 'Move right / steer right',
  jump: 'Jump / handbrake / digger (Direct): arm or tracks',
  sprint: 'Sprint',
  interact: 'Get in / get out',
  tip: 'Tip / unload (truck, pickup, barrow)',
  repair: 'Service / repair machine',
  camera: 'Switch camera (cab / outside)',
  recover: 'Recover stuck vehicle',
  map: 'Map',
  pause: 'Pause time',
  speed1: 'Speed 1×',
  speed2: 'Speed 2×',
  speed3: 'Speed 4×',
  shop: 'Laptop: plant dealer',
  market: 'Laptop: depot prices',
  handbook: 'Laptop: field guide',
  hints: 'Show / hide control hints',
  goal: 'Show / hide goal details',
  controls: 'Digger controls: Assisted or Direct',
  works: 'Plan a haul road, ramp or level area (on foot)',
  boomUp: 'Digger (Direct): boom up',
  boomDown: 'Digger (Direct): boom down',
  bucketCurl: 'Digger (Direct): curl bucket in',
  bucketDump: 'Digger (Direct): open bucket (dump)',
  stickOut: 'Digger: stick out',
  stickIn: 'Digger: stick in',
  slewLeft: 'Digger: slew left',
  slewRight: 'Digger: slew right',
  freeLook: 'Digger: hold to look around',
  precision: 'Digger: precision / adjust cut depth; driving: light pedal',
  survey: 'Toggle material survey',
  cruise: 'Road vehicle: hold current speed / cancel cruise',
  attachments: 'Digger: choose attachment',
  dev: 'Dev panel',
};

export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  if (code === 'ShiftLeft') return 'Shift';
  if (code === 'ShiftRight') return 'Right Shift';
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

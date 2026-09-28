// Keyboard handling: turns key presses into named actions.
import { HOLD_ACTIONS } from './bindings.js';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function createKeyboard({ target = window, getBindings, onAction, onEscape }) {
  const held = new Set();
  let captureNext = null;

  function actionFor(code) {
    const bindings = getBindings();
    return Object.keys(bindings).find((a) => bindings[a] === code) ?? null;
  }

  function onKeyDown(e) {
    if (captureNext) {
      e.preventDefault();
      const cb = captureNext;
      captureNext = null;
      if (e.code !== 'Escape') cb(e.code);
      else cb(null);
      return;
    }
    if (TYPING_TAGS.has(e.target?.tagName)) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      onEscape();
      return;
    }
    const action = actionFor(e.code);
    if (!action) return;
    e.preventDefault();
    if (HOLD_ACTIONS.has(action)) held.add(action);
    if (e.repeat) return;
    onAction(action);
  }

  function onKeyUp(e) {
    const action = actionFor(e.code);
    if (action) held.delete(action);
  }

  function onBlur() {
    held.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    isHeld: (action) => held.has(action),
    heldActions: () => [...held],
    // The next key press is handed to `cb` instead of triggering an action (for rebinding).
    captureNextKey(cb) {
      captureNext = cb;
    },
    destroy() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}

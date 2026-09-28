// Mouse look via pointer lock, plus left-button state.

export function createMouse(element, { onLockChange } = {}) {
  let dx = 0;
  let dy = 0;
  let down = false;
  let pressed = false; // went down since last frame
  let wantLock = true;

  const locked = () => document.pointerLockElement === element;

  function onMove(e) {
    if (!locked()) return;
    dx += e.movementX;
    dy += e.movementY;
  }
  function onDown(e) {
    if (e.button !== 0) return;
    if (!locked()) {
      if (wantLock) element.requestPointerLock?.()?.catch?.(() => {});
      return; // the click that grabs the mouse doesn't count as an action
    }
    down = true;
    pressed = true;
  }
  function onUp(e) {
    if (e.button === 0) down = false;
  }
  function onChange() {
    if (!locked()) down = false;
    onLockChange?.(locked());
  }

  element.addEventListener('mousedown', onDown);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('mousemove', onMove);
  document.addEventListener('pointerlockchange', onChange);

  return {
    locked,
    // Movement since the last call.
    takeDelta() {
      const d = { x: dx, y: dy };
      dx = 0;
      dy = 0;
      return d;
    },
    isDown: () => down && locked(),
    takePressed() {
      const p = pressed;
      pressed = false;
      return p && locked();
    },
    lock() {
      wantLock = true;
      if (!locked()) element.requestPointerLock?.()?.catch?.(() => {});
    },
    unlock() {
      if (locked()) document.exitPointerLock();
    },
    setWantLock(v) {
      wantLock = v;
    },
    destroy() {
      element.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onChange);
      if (locked()) document.exitPointerLock();
    },
  };
}

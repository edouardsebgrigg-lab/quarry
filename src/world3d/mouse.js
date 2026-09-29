// Mouse look via pointer lock, plus left-button state.

export function createMouse(element, { onLockChange } = {}) {
  let dx = 0;
  let dy = 0;
  let down = false;
  let rightDown = false; // (Direct digger control: open the bucket)
  let wheel = 0; // scroll since last frame (Direct digger control: the boom)
  let pressed = false; // went down since last frame
  let wantLock = true;

  const locked = () => document.pointerLockElement === element;
  let settleUntil = 0;

  function onMove(e) {
    if (!locked()) return;
    // Browsers can report one huge bogus jump just after the mouse is captured, which would
    // flick the view up at the sky. Ignore movement for a moment after locking, and any
    // single jump far bigger than a real hand movement.
    if (performance.now() < settleUntil) return;
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    dx += e.movementX;
    dy += e.movementY;
  }
  function onDown(e) {
    if (e.button === 2) {
      rightDown = locked();
      return;
    }
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
    if (e.button === 2) rightDown = false;
  }
  function onWheel(e) {
    if (locked()) wheel += e.deltaY;
  }
  function onChange() {
    if (!locked()) {
      down = false;
      rightDown = false;
    }
    else settleUntil = performance.now() + 120;
    dx = 0;
    dy = 0;
    onLockChange?.(locked());
  }

  element.addEventListener('mousedown', onDown);
  element.addEventListener('wheel', onWheel, { passive: true });
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
    isRightDown: () => rightDown && locked(),
    // Scroll since the last call (positive = wheel toward you).
    takeWheel() {
      const w = wheel;
      wheel = 0;
      return w;
    },
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
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onChange);
      if (locked()) document.exitPointerLock();
    },
  };
}

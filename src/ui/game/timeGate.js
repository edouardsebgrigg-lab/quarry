// When the game clock is allowed to run. Time only runs while you're actually playing:
//  - not before you've clicked into the game (a new game, or one just loaded),
//  - not while you're paused (P, or a menu that pauses),
//  - not when the pointer isn't locked and no panel is open (Esc, alt-tab, "Click to resume"),
//  - not while the window is hidden or doesn't have focus.
// A panel that doesn't pause (the shop, the map, the prices) lets time run, as before.
// A test hook can force it on.
export function timeRunning({ userPaused, overlayPausing, overlayOpen, locked, started, windowActive, forced = false }) {
  if (userPaused || overlayPausing) return false;
  if (forced) return true;
  if (!windowActive || !started) return false;
  return overlayOpen || locked;
}

// Turns real frame time into whole game ticks. Nothing accumulates while time is stopped, so
// the first frame after resuming can't fast-forward through the pause.
export function createTicker({ step, maxTicksPerFrame = 400 }) {
  let acc = 0;
  return {
    // Returns how many ticks to run this frame.
    frame(realDt, speed, running) {
      if (!running) {
        acc = 0;
        return 0;
      }
      acc += realDt * speed;
      let n = 0;
      while (acc >= step && n < maxTicksPerFrame) {
        acc -= step;
        n += 1;
      }
      if (n >= maxTicksPerFrame) acc = 0;
      return n;
    },
  };
}

// Is the browser window one you're looking at?
export function windowActive(doc = document) {
  return !doc.hidden && doc.hasFocus();
}

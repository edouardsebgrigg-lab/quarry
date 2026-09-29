import { describe, it, expect } from 'vitest';
import { timeRunning, createTicker } from './timeGate.js';

const base = { userPaused: false, overlayPausing: false, overlayOpen: false, locked: true, started: true, windowActive: true };
const run = (o) => timeRunning({ ...base, ...o });

describe('when the clock runs', () => {
  it('runs while you are playing with the mouse captured', () => {
    expect(run({})).toBe(true);
  });

  it('does not run before you click into the game, even with nothing open', () => {
    expect(run({ started: false, locked: false })).toBe(false);
    expect(run({ started: false, locked: false, overlayOpen: false })).toBe(false);
  });

  it('does not run when the pointer lock is lost and no panel is open (click to resume)', () => {
    expect(run({ locked: false })).toBe(false);
  });

  it('runs with a non-pausing panel open (shop, map), once you have started', () => {
    expect(run({ locked: false, overlayOpen: true })).toBe(true);
    expect(run({ locked: false, overlayOpen: true, started: false })).toBe(false);
  });

  it('does not run under a pausing menu, and an explicit pause always wins', () => {
    expect(run({ overlayPausing: true, overlayOpen: true })).toBe(false);
    expect(run({ userPaused: true })).toBe(false);
    expect(run({ userPaused: true, forced: true })).toBe(false);
  });

  it('does not run while the window is hidden or unfocused', () => {
    expect(run({ windowActive: false })).toBe(false);
    expect(run({ windowActive: false, overlayOpen: true })).toBe(false);
  });

  it('can be forced on for automated tests, but not through a pause', () => {
    expect(run({ started: false, locked: false, forced: true })).toBe(true);
  });
});

describe('the ticker', () => {
  it('turns frame time into whole ticks at the game speed', () => {
    const t = createTicker({ step: 0.1 });
    expect(t.frame(0.05, 1, true)).toBe(0);
    expect(t.frame(0.05, 1, true)).toBe(1);
    expect(t.frame(0.1, 4, true)).toBe(4);
  });

  it('does not build up time while stopped, so resuming cannot catch up', () => {
    const t = createTicker({ step: 0.1 });
    for (let i = 0; i < 600; i++) expect(t.frame(0.1, 4, false)).toBe(0); // a minute of waiting
    expect(t.frame(0.016, 1, true)).toBe(0); // the first frame back is just one frame
    expect(t.frame(0.1, 1, true)).toBe(1);
  });

  it('caps a huge frame instead of fast-forwarding', () => {
    const t = createTicker({ step: 0.1, maxTicksPerFrame: 50 });
    expect(t.frame(100, 4, true)).toBe(50);
    expect(t.frame(0.016, 1, true)).toBe(0);
  });
});

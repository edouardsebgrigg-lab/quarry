import { describe, it, expect } from 'vitest';
import { visualHour, solarState } from './visualClock.js';
import { getDate, ticksPerDay, createSaveSystem, createMemoryStorage } from './index.js';
import { createGame } from '../game/index.js';

describe('independent visual day', () => {
  it('takes 20 minutes of active real time, independently of the 20-minute business day', () => {
    const g = createGame({ seed: 1 });
    const tick = g.state.time.tick;
    g.advanceVisualTime(600);
    expect(visualHour(g.state, g.data)).toBeCloseTo(19);
    expect(g.state.time.tick).toBe(tick);
    g.advance(ticksPerDay(g.data));
    expect(getDate(g.state, g.data).day).toBe(2);
    expect(visualHour(g.state, g.data)).toBeCloseTo(19); // tick/speed/skip doesn't move the light
    g.advanceVisualTime(600);
    expect(visualHour(g.state, g.data)).toBeCloseTo(7);
    expect(ticksPerDay(g.data) / g.data.game.ticksPerSecond).toBe(1200);
  });
  it('round-trips at night and defaults old saves without changing their business date', () => {
    const g = createGame({ seed: 1 });
    g.advanceVisualTime(850);
    const saves = createSaveSystem({ storage: createMemoryStorage(), version: 1 });
    saves.save('slot1', g.snapshot());
    const loaded = createGame({ data: g.data, state: saves.load('slot1') });
    expect(visualHour(loaded.state, loaded.data)).toBeCloseTo(0);
    const date = getDate(loaded.state, loaded.data);
    delete loaded.state.time.visualSeconds;
    const old = createGame({ data: g.data, state: loaded.snapshot() });
    expect(visualHour(old.state, old.data)).toBe(7);
    expect(getDate(old.state, old.data)).toEqual(date);
  });
  it('does not move on paused/invalid elapsed time and wraps multi-cycle durations', () => {
    const g = createGame({ seed: 1 });
    for (const dt of [0, -1, NaN, Infinity]) g.advanceVisualTime(dt);
    expect(visualHour(g.state, g.data)).toBe(7);
    g.advanceVisualTime(2500);
    expect(visualHour(g.state, g.data)).toBeCloseTo(9);
  });
  it('crosses both horizons smoothly and keeps a finite unitable solar direction', () => {
    expect(solarState(12).daylight).toBe(1);
    expect(solarState(0).night).toBe(1);
    expect(solarState(6).direction.x).toBe(-1);
    expect(solarState(18).direction.x).toBe(1);
    for (const h of [6, 18, 0, 24]) {
      const a = solarState(h-.001), b = solarState(h+.001);
      expect(Math.abs(a.daylight - b.daylight)).toBeLessThan(.003);
      const d = a.direction;
      expect(Math.hypot(d.x,d.y,d.z)).toBeGreaterThan(.8);
      expect(Object.values(d).every(Number.isFinite)).toBe(true);
    }
    expect(solarState(24)).toEqual(solarState(0));
  });
});

import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { getDate, ticksPerDay, createSaveSystem, createMemoryStorage, migrations } from './index.js';

describe('business day pacing and save compatibility', () => {
  it('gives twenty real minutes per business day at 1x', () => {
    const g = createGame({ seed: 3 });
    expect(ticksPerDay(g.data) / g.data.game.ticksPerSecond).toBe(20 * 60);
    const initial = getDate(g.state, g.data);
    g.advance(120 * g.data.game.ticksPerSecond);
    expect(getDate(g.state, g.data)).toEqual({ day: initial.day, hour: 9, minute: 24 });
  });

  it('rebases a v5 save once without changing dates or deadlines', () => {
    const old = createGame({ seed: 3 }).snapshot();
    old.time = { tick: 17 * 1200 + 19 * 50 + 25, visualSeconds: 970 };
    old.contracts.active = [{ id: 'ongoing', deadline: 23 }];
    const storage = createMemoryStorage();
    createSaveSystem({ storage, version: 5 }).save('slot1', old);
    const saves = createSaveSystem({ storage, version: 6, migrations });
    const game = createGame({ state: saves.load('slot1') });
    expect(getDate(game.state, game.data)).toEqual({ day: 18, hour: 19, minute: 30 });
    expect(game.state.time.visualSeconds).toBe(970);
    expect(game.state.contracts.active[0].deadline).toBe(23);
    saves.save('slot1', game.snapshot());
    const reloaded = createGame({ state: saves.load('slot1') });
    expect(reloaded.state.time).toEqual(game.state.time);
  });
});

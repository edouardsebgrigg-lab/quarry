import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';
import { getStats, tickJobs } from './index.js';
import { pileTotal } from '../quarry/index.js';
import { looseVolume } from '../handtools/index.js';
import { createSaveSystem, createMemoryStorage, migrations } from '../core/index.js';

function setup() {
  const game = createTestGame(1);
  const ex = game.state.machines.find((m) => m.type === 'excavator');
  const truck = game.state.machines.find((m) => m.type === 'truck');
  const pickup = game.state.machines.find((m) => m.type === 'pickup');
  return { game, ctx: game.ctx, ex, truck, pickup };
}

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}
const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
// Every tonne in the game: the ground, the tools and every machine's load.
const everything = (game) => sum(game.ctx.ground.totals()) + pileTotal(game.state.tools.shovel.load)
  + pileTotal(game.state.tools.barrow.load) + game.state.machines.reduce((a, m) => a + pileTotal(m.load), 0);

describe('machines on the real ground', () => {
  it('a bucket comes out of the ground where the bucket is, after the cycle time', () => {
    const { game, ctx, ex } = setup();
    const before = ctx.ground.heightAt(40, 40);
    expect(game.actions.scoop(ex.id, { x: 40, z: 40 }).ok).toBe(true);
    expect(pileTotal(ex.load)).toBe(0);
    finish(ctx, ex);
    expect(looseVolume(ctx.data, ex.load)).toBeCloseTo(getStats(ctx.data, ex).bucketVolume, 2);
    expect(ctx.ground.heightAt(40, 40)).toBeLessThan(before - 0.1);
    expect(ctx.state.stats.tonnesDug).toBeGreaterThan(0.3);
  });

  it('only digs on your own land, and one bucket at a time', () => {
    const { game, ctx, ex } = setup();
    expect(game.actions.scoop(ex.id, { x: -60, z: -40 }).reason).toMatch(/own land/);
    game.actions.scoop(ex.id, { x: 40, z: 40 });
    finish(ctx, ex);
    expect(game.actions.scoop(ex.id, { x: 42, z: 40 }).reason).toMatch(/bucket is full/);
  });

  it('dumps into a truck bed up to its capacity; the rest stays in the bucket', () => {
    const { game, ex, truck } = setup();
    const cap = getStats(game.data, truck).capacity;
    truck.load = { gravel: cap - 0.1 };
    ex.load = { gravel: 0.5 };
    const r = game.actions.dumpBucket(ex.id, { machineId: truck.id });
    expect(r.ok).toBe(true);
    expect(pileTotal(truck.load)).toBeCloseTo(cap);
    expect(pileTotal(ex.load)).toBeCloseTo(0.4);
    expect(game.actions.dumpBucket(ex.id, { machineId: truck.id }).reason).toMatch(/full/);
  });

  it('dumps onto the ground as a heap, keeping every tonne', () => {
    const { game, ctx, ex } = setup();
    const start = everything(game);
    game.actions.scoop(ex.id, { x: 50, z: 50 });
    finish(ctx, ex);
    const base = ctx.ground.heightAt(56, 50);
    expect(game.actions.dumpBucket(ex.id, { x: 56, z: 50 }).ok).toBe(true);
    expect(ex.load).toEqual({});
    expect(ctx.ground.heightAt(56, 50)).toBeGreaterThan(base + 0.1);
    expect(everything(game)).toBeCloseTo(start, 6);
    expect(game.actions.dumpBucket(ex.id, { x: 56, z: 50 }).ok).toBe(false); // empty now
  });

  it('a truck tips onto your land as a heap, but nowhere else', () => {
    const { game, ctx, truck } = setup();
    truck.load = { gravel: 3 };
    const start = everything(game);
    expect(game.actions.tip(truck.id, { x: -300, z: 20 }).reason).toMatch(/own land/);
    const base = ctx.ground.heightAt(80, 80);
    expect(game.actions.tip(truck.id, { x: 80, z: 80 }).ok).toBe(true);
    finish(ctx, truck);
    expect(truck.load).toEqual({});
    expect(ctx.ground.heightAt(80, 80)).toBeGreaterThan(base + 0.3);
    expect(everything(game)).toBeCloseTo(start, 6);
  });

  it('a pickup is unloaded by hand: the more on board, the longer it takes', () => {
    const { game, pickup } = setup();
    const stats = getStats(game.data, pickup);
    pickup.load = { topsoil: 0.8 };
    game.actions.tip(pickup.id, { x: 20, z: 20 });
    expect(pickup.job.duration).toBeCloseTo(stats.unloadTime + stats.unloadPerTonne * 0.8);
  });
});

describe('save migration', () => {
  it('turns away saves from before the new map, with a clear message', () => {
    const storage = createMemoryStorage();
    storage.setItem('quarry.save.slot1', JSON.stringify({ version: 4, savedAt: 1, summary: {}, state: { money: 5 } }));
    const saves = createSaveSystem({ storage, version: 5, migrations });
    expect(() => saves.load('slot1')).toThrow(/new map/);
  });
});

import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';
import { getStats, tickJobs } from './index.js';
import { pileTotal, facePileTotal, yardTotal, addToFacePile } from '../quarry/index.js';
import { createSaveSystem, createMemoryStorage, migrations } from '../core/index.js';

function setup() {
  const game = createTestGame(1);
  const ex = game.state.machines.find((m) => m.type === 'excavator');
  const truck = game.state.machines.find((m) => m.type === 'truck');
  return { game, ctx: game.ctx, ex, truck };
}

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('hands-on digging (3D)', () => {
  it('a scoop fills the bucket, not the face pile', () => {
    const { game, ctx, ex } = setup();
    expect(game.actions.scoop(ex.id, 'B').ok).toBe(true);
    finish(ctx, ex);
    expect(pileTotal(ex.load)).toBeCloseTo(getStats(ctx.data, ex).bucket);
    expect(facePileTotal(ctx, 'gravelPit')).toBe(0);
    expect(game.state.sites.gravelPit.zones.B.dug).toBeGreaterThan(0);
  });

  it('cannot scoop again with a full bucket', () => {
    const { game, ctx, ex } = setup();
    game.actions.scoop(ex.id, 'A');
    finish(ctx, ex);
    const r = game.actions.scoop(ex.id, 'A');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Dump it first/);
  });

  it('dumps into a truck up to its capacity, the rest onto the face pile', () => {
    const { game, ex, truck } = setup();
    ex.load = { gravel: 2 };
    truck.load = { gravel: 2 }; // rusty truck holds 3 t
    const r = game.actions.dumpBucket(ex.id, truck.id);
    expect(r.ok).toBe(true);
    expect(pileTotal(truck.load)).toBeCloseTo(3);
    expect(facePileTotal(game.ctx, 'gravelPit')).toBeCloseTo(1);
    expect(pileTotal(ex.load)).toBe(0);
  });

  it('dumps onto the face pile with no truck', () => {
    const { game, ex } = setup();
    ex.load = { sand: 0.5 };
    game.actions.dumpBucket(ex.id, null);
    expect(facePileTotal(game.ctx, 'gravelPit')).toBeCloseTo(0.5);
  });

  it('a truck loads itself from the face pile', () => {
    const { game, ctx, truck } = setup();
    addToFacePile(ctx, 'gravelPit', { gravel: 10 });
    expect(game.actions.loadFromPile(truck.id).ok).toBe(true);
    finish(ctx, truck);
    expect(pileTotal(truck.load)).toBeCloseTo(3);
    expect(facePileTotal(ctx, 'gravelPit')).toBeCloseTo(7);
  });

  it('tipping empties the truck into the yard and wears it', () => {
    const { game, ctx, truck } = setup();
    truck.load = { gravel: 3 };
    const before = truck.condition;
    expect(game.actions.tip(truck.id).ok).toBe(true);
    finish(ctx, truck);
    expect(yardTotal(ctx, 'gravelPit')).toBeCloseTo(3);
    expect(pileTotal(truck.load)).toBe(0);
    expect(truck.condition).toBeLessThan(before);
  });

  it('cannot tip an empty truck', () => {
    const { game, truck } = setup();
    expect(game.actions.tip(truck.id).ok).toBe(false);
  });
});

describe('save migration v1 -> v2', () => {
  it('gives old machines an empty load', () => {
    const storage = createMemoryStorage();
    createSaveSystem({ storage, version: 1 }).save('slot1', { machines: [{ id: 'm1' }] });
    const state = createSaveSystem({ storage, version: 2, migrations }).load('slot1');
    expect(state.machines[0].load).toEqual({});
  });
});

import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { createTestGame } from '../game/testing.js';
import { pileTotal } from '../quarry/index.js';
import { getStats } from '../machinery/index.js';
import { looseVolume, barrowFill, shovelLoad, barrowLoad } from './index.js';

const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
// Everything there is: the ground, the tools and every machine's load.
const everything = (game) => sum(game.ctx.ground.totals()) + pileTotal(shovelLoad(game.ctx)) + pileTotal(barrowLoad(game.ctx))
  + game.state.machines.reduce((a, m) => a + pileTotal(m.load), 0);
const settle = (game) => {
  for (let i = 0; i < 400 && game.ctx.ground.busy(); i++) game.ctx.ground.settle(20000);
};

describe('shovel', () => {
  it('digs one shovelful of topsoil out of the field', () => {
    const game = createGame({ seed: 3 });
    const { ctx } = game;
    const before = ctx.ground.heightAt(20, 30);
    const r = game.actions.shovelDig({ x: 20, z: 30 });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.materials)).toEqual(['topsoil']);
    expect(looseVolume(ctx.data, shovelLoad(ctx))).toBeCloseTo(ctx.data.tools.shovel.volume, 3);
    expect(ctx.ground.heightAt(20, 30)).toBeLessThan(before);
    // One shovelful at a time.
    expect(game.actions.shovelDig({ x: 21, z: 30 }).ok).toBe(false);
  });

  it('only digs on the field', () => {
    const game = createGame({ seed: 3 });
    const r = game.actions.shovelDig({ x: -40, z: -10 }); // over the hedge, in the lane
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/field/);
  });

  it('fills the wheelbarrow in about eight shovelfuls, and keeps what does not fit', () => {
    const game = createGame({ seed: 3 });
    const { ctx } = game;
    const start = everything(game);
    let loads = 0;
    while (barrowFill(ctx) < 0.999 && loads < 20) {
      expect(game.actions.shovelDig({ x: 12 + loads * 0.5, z: 20 }).ok).toBe(true);
      expect(game.actions.shovelDump({ into: 'barrow' }).ok).toBe(true);
      loads += 1;
    }
    expect(loads).toBeGreaterThanOrEqual(7);
    expect(loads).toBeLessThanOrEqual(9);
    // The last shovelful only partly fitted: the rest is still on the shovel.
    if (pileTotal(shovelLoad(ctx)) === 0) game.actions.shovelDig({ x: 30, z: 20 });
    const r = game.actions.shovelDump({ into: 'barrow' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/full/);
    expect(everything(game)).toBeCloseTo(start, 6);
  });

  it('tips onto the ground as a heap you can shovel back up', () => {
    const game = createGame({ seed: 3 });
    const { ctx } = game;
    const start = everything(game);
    // Take clay from a hole and drop it on the grass nearby.
    for (let i = 0; i < 12; i++) {
      game.actions.shovelDig({ x: 25, z: 40 });
      game.actions.shovelDump({ into: 'ground', x: 28, z: 40 });
    }
    settle(game);
    expect(everything(game)).toBeCloseTo(start, 6);
    const heap = ctx.ground.heightAt(28, 40);
    // Shovelling the heap takes its loose material first, and it goes down.
    const r = game.actions.shovelDig({ x: 28, z: 40 });
    expect(r.ok).toBe(true);
    expect(ctx.ground.heightAt(28, 40)).toBeLessThan(heap);
    expect(everything(game)).toBeCloseTo(start, 6);
  });

  it('can hand-load a truck bed', () => {
    const game = createTestGame(3);
    const { ctx } = game;
    const truck = game.state.machines.find((m) => m.type === 'truck');
    game.actions.shovelDig({ x: 20, z: 20 });
    const dug = pileTotal(shovelLoad(ctx));
    expect(game.actions.shovelDump({ into: 'machine', machineId: truck.id }).ok).toBe(true);
    expect(pileTotal(truck.load)).toBeCloseTo(dug, 6);
    truck.load = { gravel: getStats(ctx.data, truck).capacity };
    game.actions.shovelDig({ x: 21, z: 20 });
    expect(game.actions.shovelDump({ into: 'machine', machineId: truck.id }).reason).toMatch(/full/);
  });
});

describe('wheelbarrow', () => {
  it('tips a real pile on the field, keeping every tonne', () => {
    const game = createGame({ seed: 5 });
    const { ctx } = game;
    const start = everything(game);
    for (let i = 0; i < 8; i++) {
      game.actions.shovelDig({ x: 10, z: 20 + i * 0.5 });
      game.actions.shovelDump({ into: 'barrow' });
    }
    const base = ctx.ground.heightAt(15, 35);
    const r = game.actions.tipBarrow({ x: 15, z: 35 });
    expect(r.ok).toBe(true);
    expect(pileTotal(barrowLoad(ctx))).toBe(0);
    settle(game);
    expect(ctx.ground.heightAt(15, 35)).toBeGreaterThan(base + 0.05);
    expect(ctx.ground.surfaceAt(15, 35)).toBe('topsoil');
    expect(everything(game)).toBeCloseTo(start, 6);
    expect(game.actions.tipBarrow({ x: 15, z: 35 }).ok).toBe(false); // empty now
  });

  it('will not tip off your land', () => {
    const game = createGame({ seed: 5 });
    game.actions.shovelDig({ x: 10, z: 20 });
    game.actions.shovelDump({ into: 'barrow' });
    expect(game.actions.tipBarrow({ x: 170, z: -10 }).ok).toBe(false);
    expect(pileTotal(barrowLoad(game.ctx))).toBeGreaterThan(0);
  });

  it('tips into the pickup, up to what it can carry', () => {
    const game = createGame({ seed: 5 });
    const { ctx } = game;
    const pickup = game.state.machines.find((m) => m.type === 'pickup');
    for (let i = 0; i < 8; i++) {
      game.actions.shovelDig({ x: 30, z: 18 + i * 0.5 });
      game.actions.shovelDump({ into: 'barrow' });
    }
    const t = pileTotal(barrowLoad(ctx));
    expect(game.actions.tipBarrow({ machineId: pickup.id }).ok).toBe(true);
    expect(pileTotal(pickup.load)).toBeCloseTo(t, 6);
    const cap = getStats(ctx.data, pickup).capacity;
    pickup.load = { topsoil: cap - 0.05 };
    for (let i = 0; i < 8; i++) {
      game.actions.shovelDig({ x: 31, z: 18 + i * 0.5 });
      game.actions.shovelDump({ into: 'barrow' });
    }
    const before = pileTotal(barrowLoad(ctx));
    expect(game.actions.tipBarrow({ machineId: pickup.id }).ok).toBe(true);
    expect(pileTotal(pickup.load)).toBeCloseTo(cap, 6);
    expect(pileTotal(barrowLoad(ctx))).toBeCloseTo(before - 0.05, 6); // the rest stays in the barrow
  });
});

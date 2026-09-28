import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import {
  getStats, startJob, tickJobs, buyMachine, sellMachine, buyMod, breakdownChance,
  describeStats, resaleValue, playerJob,
} from './index.js';
import { addToFacePile, facePileTotal, yardTotal } from '../quarry/index.js';

function setup(seed = 1) {
  const game = createGame({ seed });
  const ctx = game.ctx;
  const excavator = ctx.state.machines.find((m) => m.type === 'excavator');
  const truck = ctx.state.machines.find((m) => m.type === 'truck');
  return { game, ctx, excavator, truck };
}

function runUntilIdle(ctx, machine, maxTicks = 10000) {
  for (let i = 0; i < maxTicks && machine.job; i++) tickJobs(ctx, 0.1);
}

describe('stats and mods', () => {
  it('applies multiplier and additive mods', () => {
    const { ctx, excavator, truck } = setup();
    const base = getStats(ctx.data, excavator).bucket;
    excavator.mods.push('sharpTeeth');
    expect(getStats(ctx.data, excavator).bucket).toBeCloseTo(base * 1.15);
    const cap = getStats(ctx.data, truck).capacity;
    truck.mods.push('raisedTailgate');
    expect(getStats(ctx.data, truck).capacity).toBeCloseTo(cap + 1);
  });

  it('makes each tier a big jump (at least 2.5x output)', () => {
    const { ctx } = setup();
    const site = ctx.data.sites.gravelPit;
    for (const type of ['excavator', 'truck']) {
      const tiers = ctx.data.machines.types[type].tiers;
      const rate = (tier) => describeStats(type, tiers[tier], site)[0].value;
      expect(rate('used') / rate('rusty')).toBeGreaterThanOrEqual(2.5);
    }
  });
});

describe('jobs', () => {
  it('digging moves rock to the face pile after the cycle time', () => {
    const { ctx, excavator } = setup();
    ctx.state.money = 100;
    expect(startJob(ctx, excavator.id, 'dig').ok).toBe(true);
    expect(facePileTotal(ctx, 'gravelPit')).toBe(0);
    runUntilIdle(ctx, excavator);
    expect(facePileTotal(ctx, 'gravelPit')).toBeCloseTo(getStats(ctx.data, excavator).bucket);
    expect(ctx.state.stats.tonnesDug).toBeGreaterThan(0);
  });

  it('hauling moves the face pile to the yard', () => {
    const { ctx, truck } = setup();
    addToFacePile(ctx, 'gravelPit', { gravel: 2 });
    expect(startJob(ctx, truck.id, 'haul').ok).toBe(true);
    expect(facePileTotal(ctx, 'gravelPit')).toBeCloseTo(0);
    runUntilIdle(ctx, truck);
    expect(yardTotal(ctx, 'gravelPit')).toBeCloseTo(2);
  });

  it('refuses to haul with an empty face pile', () => {
    const { ctx, truck } = setup();
    const r = startJob(ctx, truck.id, 'haul');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Dig first/);
  });

  it('refuses rock that is too hard', () => {
    const { ctx, excavator } = setup();
    const site = ctx.data.sites.gravelPit;
    site.layerProfile[0].hardness = 9;
    const r = startJob(ctx, excavator.id, 'dig');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/too hard/);
  });

  it('the player can only do one job at a time', () => {
    const { ctx, excavator, truck } = setup();
    addToFacePile(ctx, 'gravelPit', { gravel: 2 });
    expect(startJob(ctx, excavator.id, 'dig').ok).toBe(true);
    const r = startJob(ctx, truck.id, 'haul');
    expect(r.ok).toBe(false);
    expect(playerJob(ctx).machine).toBe(excavator);
    // Operators (not the player) can work in parallel.
    expect(startJob(ctx, truck.id, 'haul', { byPlayer: false }).ok).toBe(true);
  });
});

describe('wear, breakdowns and repair', () => {
  it('breakdown chance rises as condition falls', () => {
    const { ctx, excavator } = setup();
    const stats = getStats(ctx.data, excavator);
    expect(breakdownChance(stats, 20)).toBeGreaterThan(breakdownChance(stats, 80));
  });

  it('jobs wear machines down', () => {
    const { ctx, excavator } = setup();
    const before = excavator.condition;
    startJob(ctx, excavator.id, 'dig');
    runUntilIdle(ctx, excavator);
    expect(excavator.condition).toBeCloseTo(before - getStats(ctx.data, excavator).wearPerJob);
  });

  it('a machine at zero condition always breaks, and repair fixes it', () => {
    const { ctx, excavator } = setup();
    excavator.condition = 0.1;
    startJob(ctx, excavator.id, 'dig');
    runUntilIdle(ctx, excavator);
    expect(excavator.broken).toBe(true);
    expect(startJob(ctx, excavator.id, 'dig').ok).toBe(false);
    const money = ctx.state.money;
    expect(startJob(ctx, excavator.id, 'repair').ok).toBe(true);
    expect(ctx.state.money).toBeLessThan(money);
    runUntilIdle(ctx, excavator);
    expect(excavator.broken).toBe(false);
    expect(excavator.condition).toBe(getStats(ctx.data, excavator).repairTo);
  });

  it('service costs more the more worn, and restores to 100', () => {
    const { ctx, excavator } = setup();
    excavator.condition = 50;
    ctx.state.money = 100;
    startJob(ctx, excavator.id, 'service');
    const expected = 50 * getStats(ctx.data, excavator).serviceCostPerPoint;
    expect(ctx.state.money).toBeCloseTo(100 - expected);
    runUntilIdle(ctx, excavator);
    expect(excavator.condition).toBe(100);
  });

  it('repairs are allowed even in debt (no soft-lock)', () => {
    const { ctx, truck } = setup();
    ctx.state.money = -50;
    truck.broken = true;
    expect(startJob(ctx, truck.id, 'repair').ok).toBe(true);
  });
});

describe('buying and selling', () => {
  it('buys a machine when affordable', () => {
    const { ctx } = setup();
    const price = ctx.data.machines.types.truck.tiers.used.price;
    ctx.state.money = price - 1;
    expect(buyMachine(ctx, 'truck', 'used').ok).toBe(false);
    ctx.state.money = price;
    const r = buyMachine(ctx, 'truck', 'used');
    expect(r.ok).toBe(true);
    expect(ctx.state.money).toBe(0);
    expect(ctx.state.machines).toHaveLength(3);
  });

  it('will not sell your last machine of a type', () => {
    const { ctx, truck } = setup();
    expect(sellMachine(ctx, truck.id).ok).toBe(false);
  });

  it('sells for less when worn or broken', () => {
    const { ctx } = setup();
    ctx.state.money = 1000;
    const { machine } = buyMachine(ctx, 'truck', 'used');
    machine.condition = 100;
    const good = resaleValue(ctx, machine);
    machine.condition = 20;
    machine.broken = true;
    expect(resaleValue(ctx, machine)).toBeLessThan(good);
    const money = ctx.state.money;
    const value = resaleValue(ctx, machine);
    expect(sellMachine(ctx, machine.id).ok).toBe(true);
    expect(ctx.state.money).toBe(money + value);
  });

  it('fits a mod once, only to the right machine type', () => {
    const { ctx, excavator, truck } = setup();
    ctx.state.money = 1000;
    expect(buyMod(ctx, truck.id, 'sharpTeeth').ok).toBe(false);
    expect(buyMod(ctx, excavator.id, 'sharpTeeth').ok).toBe(true);
    expect(buyMod(ctx, excavator.id, 'sharpTeeth').ok).toBe(false);
  });
});

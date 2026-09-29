import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('getting-started goals', () => {
  it('walks from a shovel to the depot, then up the machine ladder to a first truck load', () => {
    const game = createGame({ seed: 4 });
    const { ctx, actions } = game;
    const step = () => currentObjective(ctx)?.id;
    const pickup = game.state.machines.find((m) => m.type === 'pickup');
    expect(step()).toBe('firstShovel');

    // By hand: dig, fill the barrow, tip it into the pickup.
    expect(actions.shovelDig({ x: 30, z: 20 }).ok).toBe(true);
    expect(step()).toBe('fillBarrow');
    let spot = 0;
    const fill = () => {
      for (let i = 0; i < 12; i++) {
        if (!actions.shovelDump({ into: 'barrow' }).ok) break;
        spot += 1;
        actions.shovelDig({ x: 30 + (spot % 20) * 0.5, z: 20 + Math.floor(spot / 20) * 0.5 });
      }
    };
    fill();
    expect(step()).toBe('loadPickup');
    for (let i = 0; i < 6 && step() === 'loadPickup'; i++) {
      expect(actions.tipBarrow({ machineId: pickup.id }).ok).toBe(true);
      if (step() === 'loadPickup') fill();
    }
    expect(step()).toBe('weighIn');
    expect(pileTotal(pickup.load)).toBeGreaterThanOrEqual(0.3);

    // At the depot: weigh in, unload in the topsoil bay.
    expect(actions.tip(pickup.id, { bay: 'topsoil' }).reason).toMatch(/Weigh in/);
    expect(actions.weighIn(pickup.id).ok).toBe(true);
    expect(step()).toBe('firstSale');
    const before = ctx.state.money;
    expect(actions.tip(pickup.id, { bay: 'topsoil' }).ok).toBe(true);
    finish(ctx, pickup);
    const reward = ctx.data.objectives.steps.find((s) => s.id === 'firstSale').reward;
    expect(ctx.state.money).toBeGreaterThan(before + reward);

    // A cheap upgrade for the pickup, then saving up for the mini digger.
    expect(step()).toBe('firstMod');
    expect(actions.buyMod(pickup.id, 'stifferSprings').ok).toBe(true);
    expect(step()).toBe('buyMiniDigger');
    expect(currentObjective(ctx).progress).toBeGreaterThan(0.5);
    expect(currentObjective(ctx).progress).toBeLessThan(1);
    ctx.state.money += 400; // (more trips by hand)
    const digger = actions.buyMachine('miniDigger', 'rusty').machine;
    expect(step()).toBe('firstScoop');
    expect(actions.scoop(digger.id, { x: 60, z: 60 }).ok).toBe(true);
    finish(ctx, digger);
    expect(step()).toBe('buyTractor');

    // The tractor and trailer: only a full-ish trailer load counts.
    ctx.state.money += 500;
    const tractor = actions.buyMachine('tractor', 'rusty').machine;
    expect(step()).toBe('sellTrailer');
    pickup.load = { topsoil: 0.5 };
    actions.weighIn(pickup.id);
    actions.tip(pickup.id, { bay: 'topsoil' });
    finish(ctx, pickup);
    tractor.load = { topsoil: 1.5 };
    actions.weighIn(tractor.id);
    actions.tip(tractor.id, { bay: 'topsoil' });
    finish(ctx, tractor);
    expect(step()).toBe('sellTrailer');
    for (let i = 0; i < 80 && pileTotal(tractor.load) < 3.2; i++) {
      actions.scoop(digger.id, { x: 60 + (i % 10) * 0.8, z: 64 + Math.floor(i / 10) * 0.8 });
      finish(ctx, digger);
      actions.dumpBucket(digger.id, { machineId: tractor.id });
    }
    expect(pileTotal(tractor.load)).toBeGreaterThanOrEqual(3);
    actions.weighIn(tractor.id);
    expect(actions.tip(tractor.id, { bay: 'topsoil' }).ok).toBe(true);
    finish(ctx, tractor);
    expect(step()).toBe('earn');

    // Earn, then the big machines: buying the truck first still works.
    ctx.state.stats.totalEarned = 2000;
    ctx.state.money = 5000;
    actions.selectMachine(pickup.id); // any event re-checks the goal
    expect(step()).toBe('buyExcavator');
    const truck = actions.buyMachine('truck', 'rusty').machine;
    expect(step()).toBe('buyExcavator');
    const ex = actions.buyMachine('excavator', 'rusty').machine;
    expect(step()).toBe('sell');
    for (let i = 0; i < 40 && pileTotal(truck.load) < 3; i++) {
      actions.scoop(ex.id, { x: 90 + (i % 8) * 1.4, z: 90 + Math.floor(i / 8) * 1.4 });
      finish(ctx, ex);
      actions.dumpBucket(ex.id, { machineId: truck.id });
    }
    actions.weighIn(truck.id);
    actions.tip(truck.id, { bay: 'mixed' });
    finish(ctx, truck);
    expect(step()).toBe('usedMachine');
  });

  it('shows how far you are with saving up for the next machine', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'buyTruck');
    game.state.money = game.data.machines.types.truck.tiers.rusty.price / 4;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.25);
  });

  it('reports progress for measurable goals', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'earn');
    game.state.stats.totalEarned = 1000;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.5);
  });
});

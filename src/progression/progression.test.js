import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('getting-started goals', () => {
  it('walks from a shovel to the depot, then to machines and a first truck load', () => {
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
    expect(step()).toBe('buyExcavator');
    expect(currentObjective(ctx).progress).toBe(1); // you can afford the excavator already

    // Then the machines: buying the truck first still works.
    ctx.state.money += 100; // (the work by hand that pays for the second machine)
    const truck = actions.buyMachine('truck', 'rusty').machine;
    expect(step()).toBe('buyExcavator');
    const ex = actions.buyMachine('excavator', 'rusty').machine;
    expect(step()).toBe('firstScoop');

    expect(actions.scoop(ex.id, { x: 60, z: 60 }).ok).toBe(true);
    finish(ctx, ex);
    expect(step()).toBe('loadTruck');
    for (let i = 0; i < 20 && step() === 'loadTruck'; i++) {
      actions.dumpBucket(ex.id, { machineId: truck.id });
      if (step() !== 'loadTruck') break;
      actions.scoop(ex.id, { x: 60 + i * 1.2, z: 62 });
      finish(ctx, ex);
    }
    expect(step()).toBe('sell');
    // The pickup selling again doesn't count: this goal is a truck load.
    pickup.load = { topsoil: 0.5 };
    actions.weighIn(pickup.id);
    actions.tip(pickup.id, { bay: 'topsoil' });
    finish(ctx, pickup);
    expect(step()).toBe('sell');
    actions.weighIn(truck.id);
    actions.tip(truck.id, { bay: 'mixed' });
    finish(ctx, truck);
    expect(step()).toBe('firstMod');
  });

  it('shows how far you are with saving up for the truck', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'buyTruck');
    game.state.money = 25;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.25);
  });

  it('reports progress for measurable goals', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'earn');
    game.state.stats.totalEarned = 250;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.5);
  });
});

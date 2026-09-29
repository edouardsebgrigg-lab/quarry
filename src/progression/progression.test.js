import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { yardAmount } from '../quarry/index.js';

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('getting-started goals', () => {
  it('walks from a shovel and a barrow to machines and a first load of gravel', () => {
    const game = createGame({ seed: 4 });
    const { ctx, actions } = game;
    const step = () => currentObjective(ctx)?.id;
    expect(step()).toBe('firstShovel');

    // By hand: dig, fill the barrow, tip it in the yard, sell.
    expect(actions.shovelDig({ x: 30, z: 20 }).ok).toBe(true);
    expect(step()).toBe('fillBarrow');
    const fill = () => {
      for (let i = 0; i < 12; i++) {
        if (!actions.shovelDump({ into: 'barrow' }).ok) break;
        actions.shovelDig({ x: 30 + (i % 4) * 0.5, z: 20 + Math.floor(i / 4) * 0.5 });
      }
    };
    fill();
    expect(step()).toBe('tipBarrow');
    expect(actions.tipBarrow({ x: 20, z: 30 }).ok).toBe(true); // a heap on the field doesn't count
    expect(step()).toBe('tipBarrow');
    fill();
    expect(actions.tipBarrow({ x: 50, z: 8, intoYard: true }).ok).toBe(true);
    expect(step()).toBe('firstSale');
    expect(yardAmount(ctx, 'gravelPit', 'topsoil')).toBeGreaterThan(0);
    const before = ctx.state.money;
    const sale = actions.sellAll();
    const reward = ctx.data.objectives.steps.find((s) => s.id === 'firstSale').reward;
    expect(ctx.state.money).toBeCloseTo(before + sale.revenue + reward, 1);
    expect(step()).toBe('buyExcavator');
    expect(currentObjective(ctx).progress).toBe(1); // you can afford the excavator already

    // Then the machines: buying the truck first still works.
    ctx.state.money += 100; // (the barrow work that pays for the second machine)
    const truck = actions.buyMachine('truck', 'rusty').machine;
    expect(step()).toBe('buyExcavator');
    const ex = actions.buyMachine('excavator', 'rusty').machine;
    expect(step()).toBe('firstScoop');

    expect(actions.scoop(ex.id, 'B').ok).toBe(true);
    finish(ctx, ex);
    expect(step()).toBe('loadTruck');
    for (let i = 0; i < 20 && step() === 'loadTruck'; i++) {
      actions.dumpBucket(ex.id, truck.id);
      if (step() !== 'loadTruck') break;
      actions.scoop(ex.id, 'B');
      finish(ctx, ex);
    }
    expect(step()).toBe('tip');
    expect(actions.tip(truck.id).ok).toBe(true);
    finish(ctx, truck);
    expect(step()).toBe('sell');
    expect(yardAmount(ctx, 'gravelPit', 'gravel')).toBeGreaterThan(0);
    actions.sellAll();
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

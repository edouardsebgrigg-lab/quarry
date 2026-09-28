import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { yardAmount } from '../quarry/index.js';

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('getting-started goals', () => {
  it('walks from an empty pit to a first sale', () => {
    const game = createGame({ seed: 4 });
    const { ctx, actions } = game;
    const step = () => currentObjective(ctx)?.id;
    expect(step()).toBe('buyExcavator');

    // Buying the truck first still works: owning both completes both steps.
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
    const before = ctx.state.money;
    const sale = actions.sellAll();
    expect(step()).toBe('firstMod');
    const reward = ctx.data.objectives.steps.find((s) => s.id === 'sell').reward;
    expect(ctx.state.money).toBeCloseTo(before + sale.revenue + reward, 1);
  });

  it('reports progress for measurable goals', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'earn');
    game.state.stats.totalEarned = 250;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.5);
  });
});

import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { weeklyInsurance } from './overheads.js';

describe('running costs', () => {
  it('insures every machine once a week, at a share of its price new', () => {
    const game = createGame({ seed: 2 });
    game.state.money = 1000;
    const charges = [];
    game.events.on('overheadsCharged', (e) => charges.push(e));
    const weekly = weeklyInsurance(game.ctx);
    const pickup = game.data.machines.types.pickup.tiers.rusty.price;
    expect(weekly).toBeCloseTo(pickup * game.data.economy.insurance.weeklyRate, 2);
    game.dev.skipDays(6);
    expect(charges).toHaveLength(0);
    game.dev.skipDays(1);
    expect(charges).toHaveLength(1);
    game.actions.buyMachine('miniDigger', 'rusty');
    expect(weeklyInsurance(game.ctx)).toBeGreaterThan(weekly);
    game.dev.skipDays(7);
    expect(charges).toHaveLength(2);
    expect(charges[1].amount).toBeGreaterThan(charges[0].amount);
  });
});

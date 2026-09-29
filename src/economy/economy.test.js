import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';
import {
  integrateMultiplier, currentPrice, quoteSale, canAfford, chargeDailyInterest, marketHourly,
  chargeFuel, fuelPrice, spendMoney, quoteDelivery, sellLoad, hasTicket,
} from './index.js';
import { tickJobs } from '../machinery/index.js';

function setup(seed = 1) {
  const game = createTestGame(seed);
  return { game, ctx: game.ctx };
}

describe('saturation maths', () => {
  it('integrates the linear part', () => {
    // 1 - 0.1s from 0 to 2 = 2 - 0.1*4/2 = 1.8
    expect(integrateMultiplier(0.1, 0.5, 0, 2)).toBeCloseTo(1.8);
  });

  it('flattens at the minimum', () => {
    // threshold at s = 5; 0..5 area = 5 - 0.1*25/2 = 3.75; 5..10 at 0.5 = 2.5
    expect(integrateMultiplier(0.1, 0.5, 0, 10)).toBeCloseTo(6.25);
    expect(integrateMultiplier(0.1, 0.5, 6, 8)).toBeCloseTo(1);
  });
});

describe('selling at the depot', () => {
  const truckWith = (ctx, load) => {
    const truck = ctx.state.machines.find((m) => m.type === 'truck');
    truck.load = { ...load };
    return truck;
  };

  it('needs a weighbridge ticket, then pays the market price for a clean load', () => {
    const { game, ctx } = setup();
    const truck = truckWith(ctx, { gravel: 3 });
    expect(game.actions.tip(truck.id, { bay: 'gravel' }).reason).toMatch(/Weigh in/);
    expect(game.actions.weighIn(truck.id).ok).toBe(true);
    const expected = quoteSale(ctx, 'gravel', 3);
    const before = ctx.state.money;
    expect(game.actions.tip(truck.id, { bay: 'gravel' }).ok).toBe(true);
    for (let i = 0; i < 200 && truck.job; i++) tickJobs(ctx, 0.1);
    const fuel = ctx.state.stats.fuelSpent;
    expect(ctx.state.money).toBeCloseTo(before + expected - fuel, 1);
    expect(truck.load).toEqual({});
    expect(ctx.state.stats.tonnesSold).toBeCloseTo(3);
    expect(hasTicket(ctx, truck.id)).toBe(false); // one ticket, one load
  });

  it('grades a slightly mixed load down, and pays a very mixed one as fill', () => {
    const { ctx } = setup();
    const clean = quoteDelivery(ctx, 'gravel', { gravel: 10 });
    const slight = quoteDelivery(ctx, 'gravel', { gravel: 9, topsoil: 1 });
    const mixed = quoteDelivery(ctx, 'gravel', { gravel: 6, topsoil: 4 });
    expect(clean.grade).toBe('Clean');
    expect(slight.grade).toBe('Slightly mixed');
    expect(slight.perTonne).toBeCloseTo(clean.perTonne * 0.75, 1);
    expect(mixed.product).toBe('mixed');
    expect(mixed.perTonne).toBeLessThan(slight.perTonne);
    // The mixed-fill bay takes anything at the fill price.
    expect(quoteDelivery(ctx, 'mixed', { gravel: 6, topsoil: 4 }).perTonne).toBeCloseTo(mixed.perTonne, 3);
  });

  it('lowers the price the more you sell, then recovers', () => {
    const { ctx } = setup();
    const before = currentPrice(ctx, 'gravel');
    sellLoad(ctx, 'm0', 'gravel', { gravel: 100 });
    const after = currentPrice(ctx, 'gravel');
    expect(after).toBeLessThan(before * 0.7);
    for (let i = 0; i < 72; i++) marketHourly(ctx);
    expect(ctx.state.market.products.gravel.saturation).toBeLessThan(15);
  });

  it('selling in one go earns less per tonne than a small sale', () => {
    const { ctx } = setup();
    const small = quoteSale(ctx, 'gravel', 1);
    const big = quoteSale(ctx, 'gravel', 100) / 100;
    expect(big).toBeLessThan(small);
  });

  it('will not weigh an empty vehicle', () => {
    const { game, ctx } = setup();
    const pickup = ctx.state.machines.find((m) => m.type === 'pickup');
    expect(game.actions.weighIn(pickup.id).ok).toBe(false);
  });
});

describe('market trend', () => {
  it('stays within bounds over a long time', () => {
    const { ctx } = setup(7);
    const { min, max } = ctx.data.market.trend;
    for (let i = 0; i < 24 * 200; i++) {
      marketHourly(ctx);
      const t = ctx.state.market.products.gravel.trend;
      expect(t).toBeGreaterThanOrEqual(min);
      expect(t).toBeLessThanOrEqual(max);
    }
  });

  it('is the same for the same seed', () => {
    const a = setup(99).ctx;
    const b = setup(99).ctx;
    for (let i = 0; i < 50; i++) {
      marketHourly(a);
      marketHourly(b);
    }
    expect(a.state.market.products.sand.history).toEqual(b.state.market.products.sand.history);
  });

  it('keeps a limited price history', () => {
    const { ctx } = setup();
    for (let i = 0; i < 200; i++) marketHourly(ctx);
    expect(ctx.state.market.products.gravel.history.length).toBe(ctx.data.market.historyLength);
  });
});

describe('money and debt', () => {
  it('blocks purchases in debt and charges daily interest', () => {
    const { ctx } = setup();
    ctx.state.money = 0;
    spendMoney(ctx, 100, 'repair');
    expect(ctx.state.money).toBe(-100);
    expect(canAfford(ctx, 1)).toBe(false);
    const interest = chargeDailyInterest(ctx);
    expect(interest).toBeCloseTo(100 * ctx.data.economy.debtInterestPerDay);
    expect(ctx.state.money).toBeCloseTo(-100 - interest);
  });

  it('charges no interest when not in debt', () => {
    const { ctx } = setup();
    ctx.state.money = 50;
    expect(chargeDailyInterest(ctx)).toBe(0);
    expect(ctx.state.money).toBe(50);
  });

  it('charges fuel at the current price', () => {
    const { ctx } = setup();
    ctx.state.money = 10;
    const cost = chargeFuel(ctx, 2);
    expect(cost).toBeCloseTo(2 * fuelPrice(ctx));
    expect(ctx.state.money).toBeCloseTo(10 - cost, 1);
  });
});

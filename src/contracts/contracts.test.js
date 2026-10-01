import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { contractsState } from './index.js';

const sale = (game, material, tonnes, purity = 1) => game.events.emit('productSold', {
  machineId: 'm1', bayId: material, productId: purity >= 0.95 ? material : 'mixed', tonnes, revenue: tonnes * 30, purity,
});

describe('the jobs board', () => {
  it('starts with offers, and tops them up each morning as they go stale', () => {
    const game = createGame({ seed: 8 });
    const c = contractsState(game.ctx);
    expect(c.offers).toHaveLength(game.data.contracts.maxOffers);
    const firstIds = c.offers.map((o) => o.id);
    game.dev.skipDays(game.data.contracts.offerDays + 1);
    expect(c.offers).toHaveLength(game.data.contracts.maxOffers);
    expect(c.offers.some((o) => firstIds.includes(o.id))).toBe(false);
  });

  it('pays the bonus once enough clean material has been delivered, and ignores mixed loads', () => {
    const game = createGame({ seed: 8 });
    const c = contractsState(game.ctx);
    const offer = c.offers[0];
    expect(game.actions.acceptContract(offer.id).ok).toBe(true);
    const money = game.state.money;
    sale(game, offer.material, offer.tonnes, 0.8); // (too mixed: doesn't count)
    expect(c.active[0].delivered).toBe(0);
    sale(game, offer.material, offer.tonnes / 2);
    expect(c.active).toHaveLength(1);
    sale(game, offer.material, offer.tonnes / 2 + 0.05);
    expect(c.active).toHaveLength(0);
    expect(c.done).toBe(1);
    expect(game.state.money).toBeCloseTo(money + offer.bonus, 2);
  });

  it('limits how many you can take on, and fails a job that runs past its deadline', () => {
    const game = createGame({ seed: 8 });
    const c = contractsState(game.ctx);
    const [a, b, d] = c.offers;
    const failed = [];
    game.events.on('contractFailed', (e) => failed.push(e));
    expect(game.actions.acceptContract(a.id).ok).toBe(true);
    expect(game.actions.acceptContract(b.id).ok).toBe(true);
    expect(game.actions.acceptContract(d.id).reason).toMatch(/at a time/);
    game.dev.skipDays(Math.max(a.days, b.days) + 1);
    expect(c.active).toHaveLength(0);
    expect(failed).toHaveLength(2);
  });

  it('offers bigger jobs as the business grows, and is saved with the game', () => {
    const game = createGame({ seed: 8 });
    const small = Math.max(...contractsState(game.ctx).offers.map((o) => o.tonnes));
    game.state.stats.totalEarned = 20000;
    game.dev.skipDays(3);
    const big = Math.max(...contractsState(game.ctx).offers.map((o) => o.tonnes));
    expect(big).toBeGreaterThan(small);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 8, state: saved });
    expect(contractsState(g2.ctx).offers.map((o) => o.id)).toEqual(contractsState(game.ctx).offers.map((o) => o.id));
  });
});

describe('reputation', () => {
  it('grows with jobs done on time, falls faster for jobs let down, and brings bigger bonuses and more offers', async () => {
    const { reputation } = await import('./index.js');
    const game = createGame({ seed: 8 });
    const c = contractsState(game.ctx);
    expect(reputation(game.ctx).level).toBe(0);
    for (let i = 0; i < 4; i++) {
      const o = c.offers[0];
      game.actions.acceptContract(o.id);
      sale(game, o.material, o.tonnes + 0.1);
      game.dev.skipDays(1); // (the board fills up again each morning)
    }
    expect(reputation(game.ctx).level).toBe(4);
    game.dev.skipDays(3);
    expect(c.offers.length).toBeGreaterThan(game.data.contracts.maxOffers);
    expect(reputation(game.ctx).bonusBoost).toBeGreaterThan(0);
    const o = c.offers[0];
    game.actions.acceptContract(o.id);
    game.dev.skipDays(o.days + 1);
    expect(reputation(game.ctx).level).toBe(2);
  });
});

describe('regular customers (standing orders)', () => {
  const quiet = async () => {
    const { loadData } = await import('../core/data.js');
    const data = loadData();
    data.milestones.list = []; // (no milestone rewards landing mid-test)
    return data;
  };
  const waitForOffer = (game) => {
    const s = contractsState(game.ctx).standing;
    for (let i = 0; i < 40 && !s.offer; i++) game.dev.skipDays(1);
    return s.offer;
  };

  it('only come once you have a name', async () => {
    const game = createGame({ seed: 12, data: await quiet() });
    game.dev.skipDays(25);
    expect(contractsState(game.ctx).standing.offer).toBe(null);
  });

  it('pay each week the quota is met, once, and count loads toward it', async () => {
    const game = createGame({ seed: 12, data: await quiet() });
    const c = contractsState(game.ctx);
    c.reputation = 5;
    const offer = waitForOffer(game);
    expect(offer).toMatchObject({ client: expect.any(String), weeks: expect.any(Number) });
    expect(offer.tonnesPerWeek).toBeGreaterThan(0);
    c.active = []; // (no board jobs competing for the loads)
    expect(game.actions.acceptStandingOrder().ok).toBe(true);
    const a = c.standing.active;
    const money = game.state.money;
    sale(game, a.material, a.tonnesPerWeek / 2);
    expect(a.paidThisWeek).toBe(false);
    sale(game, a.material, a.tonnesPerWeek / 2 + 0.05);
    expect(a.paidThisWeek).toBe(true);
    expect(a.weeksDone).toBe(1);
    expect(game.state.money).toBeCloseTo(money + a.weeklyBonus, 2);
    sale(game, a.material, a.tonnesPerWeek); // (more this week doesn't pay twice)
    expect(game.state.money).toBeCloseTo(money + a.weeklyBonus, 2);
  });

  it('cost reputation for a week missed, and end after their weeks', async () => {
    const game = createGame({ seed: 12, data: await quiet() });
    const c = contractsState(game.ctx);
    c.reputation = 5;
    waitForOffer(game);
    game.actions.acceptStandingOrder();
    const weeks = c.standing.active.weeks;
    const missed = [];
    const ended = [];
    game.events.on('standingWeekMissed', (e) => missed.push(e));
    game.events.on('standingEnded', (e) => ended.push(e));
    const rep = c.reputation;
    game.dev.skipDays(game.data.contracts.standing.weekDays);
    expect(missed).toHaveLength(1);
    expect(c.reputation).toBeLessThan(rep);
    game.dev.skipDays(game.data.contracts.standing.weekDays * (weeks - 1));
    expect(ended).toHaveLength(1);
    expect(c.standing.active).toBe(null);
  });

  it('share loads with board jobs: whichever is due first gets the load', async () => {
    const game = createGame({ seed: 12, data: await quiet() });
    const c = contractsState(game.ctx);
    c.reputation = 5;
    waitForOffer(game);
    game.actions.acceptStandingOrder();
    const a = c.standing.active;
    c.active = [{ id: 999, client: 'Test', material: a.material, tonnes: 50, days: 1, bonus: 1, delivered: 0, deadline: a.weekEnd - 1 }];
    sale(game, a.material, 1);
    expect(c.active[0].delivered).toBe(1);
    expect(a.delivered).toBe(0);
    c.active[0].deadline = a.weekEnd + 3;
    sale(game, a.material, 1);
    expect(a.delivered).toBe(1);
  });
});

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

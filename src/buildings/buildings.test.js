import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { startJob, getStats, serviceCost } from '../machinery/index.js';
import { chargeFuel, fuelPrice } from '../economy/index.js';
import { ownsBuilding } from './index.js';
const setup = () => {
  const game = createGame({ seed: 3 }); game.state.money = 10000;
  game.state.insurance = { cover: 'none', next: null }; // (no insurer paying part of a repair: the workshop alone)
  const m = game.state.machines[0]; m.condition = 40;
  return { game, ctx: game.ctx, m };
};
describe('commissioned yard facilities', () => {
  it('charges exactly once, emits a receipt, and refuses duplicate, unknown and unaffordable purchases', () => {
    const { game } = setup(); const events = [];
    game.events.on('buildingBought', e => events.push(e));
    expect(game.actions.buyBuilding('workshop').ok).toBe(true);
    expect(game.state.money).toBe(10000 - game.data.buildings.workshop.price);
    const before = JSON.stringify(game.snapshot());
    expect(game.actions.buyBuilding('workshop').ok).toBe(false);
    expect(game.actions.buyBuilding('missing').ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(before);
    expect(events).toHaveLength(1);
    game.state.money = -1;
    expect(game.actions.buyBuilding('fuelTank').ok).toBe(false);
    expect(ownsBuilding(game.ctx, 'fuelTank')).toBe(false);
  });
  it('workshop reduces service and repair prices and durations, leaving the completion result intact', () => {
    for (const type of ['service', 'repair']) {
      const { game, ctx, m } = setup(); const st = getStats(game.data, m);
      game.actions.buyBuilding('workshop'); m.broken = type === 'repair';
      expect(startJob(ctx, m.id, type).ok).toBe(true);
      expect(m.job.cost).toBeCloseTo((type === 'repair' ? st.repairCost : serviceCost(st, m)) * 0.75);
      expect(m.job.duration).toBeCloseTo(st[type === 'repair' ? 'repairTime' : 'serviceTime'] * 0.7);
      game.advance(Math.ceil(m.job.duration * 10));
      expect(m.job).toBe(null);
      expect(m.broken).toBe(false);
      expect(m.condition).toBeGreaterThan(40);
    }
  });
  it('does not retroactively change a maintenance quote already running', () => {
    const { game, ctx, m } = setup();
    startJob(ctx, m.id, 'service'); const job = { ...m.job };
    game.actions.buyBuilding('workshop');
    expect(m.job).toEqual(job);
  });
  it('bulk fuel discount applies to timed and direct digging, and does not leak to another site', () => {
    const { game, ctx, m } = setup(); const price = fuelPrice(ctx);
    game.actions.buyBuilding('fuelTank');
    expect(chargeFuel(ctx, 2, m.siteId)).toBeCloseTo(price * 2 * 0.85);
    expect(chargeFuel(ctx, 2, 'other')).toBeCloseTo(price * 2);
    expect(game.state.stats.fuelSpent).toBeCloseTo(price * 2 * 1.85);
  });
  it('ownership and effects survive JSON save/load, and old saves have no facility benefits', () => {
    const { game } = setup(); game.actions.buyBuilding('workshop'); game.actions.buyBuilding('fuelTank');
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const loaded = createGame({ state: saved });
    expect(ownsBuilding(loaded.ctx, 'workshop')).toBe(true);
    expect(chargeFuel(loaded.ctx, 1)).toBeCloseTo(fuelPrice(loaded.ctx) * 0.85);
    delete saved.buildings;
    const legacy = createGame({ state: saved });
    expect(ownsBuilding(legacy.ctx, 'workshop')).toBe(false);
    expect(legacy.actions.buyBuilding('workshop').ok).toBe(true);
  });
  it('refuses commissioning outside the home yard site', () => {
    const { game } = setup(); game.state.currentSiteId = 'other';
    expect(game.actions.buyBuilding('workshop').ok).toBe(false);
    expect(game.state.money).toBe(10000);
  });
});

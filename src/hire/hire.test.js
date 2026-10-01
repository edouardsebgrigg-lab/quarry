import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { hireState, hireCandidates, machinesOnHire, dayRate, cantHire, AWAY } from './index.js';
import { machinesAt } from '../machinery/index.js';

// (milestones off, so no reward lands mid-test; plenty of money for machines)
const setup = () => {
  const data = loadData();
  data.milestones.list = [];
  const game = createGame({ seed: 14, data });
  game.state.money = 20000;
  game.actions.buyMachine('miniDigger', 'used');
  game.actions.buyMachine('excavator', 'rusty');
  return game;
};
const waitForEnquiry = (game) => {
  const h = hireState(game.ctx);
  for (let i = 0; i < 40 && !h.enquiry; i++) game.dev.skipDays(1);
  return h.enquiry;
};

describe('hiring out machines', () => {
  it('gets enquiries only once you have a few machines, for kinds you own', () => {
    const lone = createGame({ seed: 14 });
    lone.dev.skipDays(20);
    expect(hireState(lone.ctx).enquiry).toBe(null);
    const game = setup();
    const e = waitForEnquiry(game);
    expect(e).toBeTruthy();
    expect(game.state.machines.some((m) => m.type === e.type)).toBe(true);
    expect(e.rate).toBe(dayRate(game.ctx, e.type));
    expect(e.total).toBe(e.rate * e.days);
  });

  it('sends a machine away, then brings it back worn and pays for the hire', () => {
    const game = setup();
    const e = waitForEnquiry(game);
    const [m] = hireCandidates(game.ctx);
    expect(m).toBeTruthy();
    const site = m.siteId;
    const condition = m.condition;
    expect(game.actions.acceptHire(m.id).ok).toBe(true);
    expect(m.siteId).toBe(AWAY);
    expect(machinesAt(game.ctx, site)).not.toContain(m);
    expect(machinesOnHire(game.ctx)).toContain(m);
    expect(game.actions.sellMachine(m.id).ok).toBe(false);
    expect(game.actions.mechanicQuote(m.id).reason).toBeTruthy();
    const money = game.state.money;
    const returned = [];
    game.events.on('machineReturned', (r) => returned.push(r));
    game.dev.skipDays(e.days);
    expect(returned).toHaveLength(1);
    expect(m.siteId).toBe(site);
    expect(m.onHire).toBe(null);
    expect(m.condition).toBeCloseTo(condition - game.data.hire.wearPerDay * e.days, 5);
    expect(game.state.bank.statement.some((s) => s.reason === 'hire' && s.amount === e.total)).toBe(true);
    expect(game.state.money).toBeGreaterThan(money - 200); // (paid in, less the days' running costs)
  });

  it('won’t send a broken, busy or loaded machine, the wrong kind, or the last road vehicle', () => {
    const game = setup();
    const e = waitForEnquiry(game);
    const m = game.state.machines.find((x) => x.type === e.type);
    m.broken = true;
    expect(game.actions.acceptHire(m.id).ok).toBe(false);
    m.broken = false;
    m.load = { topsoil: 0.3 };
    expect(game.actions.acceptHire(m.id).reason).toBe('Empty it first');
    m.load = {};
    const wrong = game.state.machines.find((x) => x.type !== e.type);
    expect(game.actions.acceptHire(wrong.id).ok).toBe(false);
    // The pickup is the only road vehicle: it can't go.
    const pickup = game.state.machines.find((x) => x.type === 'pickup');
    expect(cantHire(game.ctx, pickup)).toBe('You need a road vehicle at home');
  });

  it('lets an enquiry go stale or be turned down', () => {
    const game = setup();
    waitForEnquiry(game);
    expect(game.actions.declineHire().ok).toBe(true);
    expect(hireState(game.ctx).enquiry).toBe(null);
    const e = waitForEnquiry(game);
    game.dev.skipDays(game.data.hire.offerDays + 1);
    expect(hireState(game.ctx).enquiry?.id ?? null).not.toBe(e.id);
  });
});

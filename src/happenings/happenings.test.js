import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { getDate } from '../core/index.js';
import { createMachine, machinePrice, buyMachine } from '../machinery/index.js';
import { contractsState, acceptContract } from '../contracts/index.js';
import { happeningsState, happeningsDaily, nextInspection, inspectionReport, dealerOffer } from './index.js';

function setup({ seed = 3, off = [] } = {}) {
  const game = createGame({ seed });
  // (milestones off: their rewards would change the money these tests check)
  game.data.milestones.list = [];
  for (const k of off) game.data.happenings[k].chancePerDay = 0;
  const got = [];
  game.events.on('*', (type, e) => got.push([type, e]));
  const events = (type) => got.filter(([t]) => t === type).map(([, e]) => e);
  const add = (type, tier = 'rusty') => createMachine(game.state, game.data, type, tier, game.state.currentSiteId);
  return { game, ctx: game.ctx, events, add };
}
const hours = (game, n) => game.dev.skipHours(n);
const now = (game) => getDate(game.state, game.data);

describe('the site inspector', () => {
  it("doesn't come until you have a few machines, then is announced the day before", () => {
    const { game, ctx, events, add } = setup({ off: ['rushOrder', 'dealerOffer'] });
    game.dev.skipDays(10);
    expect(nextInspection(ctx)).toBeNull(); // only the pickup
    add('miniDigger');
    add('tractor');
    game.dev.skipDays(1);
    const visit = nextInspection(ctx);
    expect(visit.day).toBeGreaterThan(10);
    expect(visit.announced).toBe(false);
    while (!events('inspectionAnnounced').length) game.dev.skipDays(1);
    const a = events('inspectionAnnounced')[0];
    expect(a.day).toBe(visit.day);
    expect(a.finePerMachine).toBe(game.data.happenings.inspector.finePerMachine);
  });

  it('fines each machine that is broken or badly worn, at the hour of the visit', () => {
    const { game, ctx, events, add } = setup({ off: ['rushOrder', 'dealerOffer'] });
    const digger = add('miniDigger');
    const tractor = add('tractor');
    digger.condition = 20;
    tractor.broken = true;
    game.dev.skipDays(1);
    const visit = nextInspection(ctx);
    expect(inspectionReport(ctx).fine).toBe(2 * game.data.happenings.inspector.finePerMachine);
    // Up to just before the visit: nothing yet.
    while (now(game).day < visit.day || now(game).hour < visit.hour - 1) hours(game, 1);
    expect(events('inspection')).toHaveLength(0);
    game.state.money = 500;
    const before = game.state.money;
    hours(game, 2);
    const done = events('inspection');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ fine: 120, good: false, reputationGain: 0 });
    expect(done[0].poor.sort()).toEqual([digger.id, tractor.id].sort());
    expect(before - game.state.money).toBeGreaterThanOrEqual(120);
    expect(before - game.state.money).toBeLessThan(140); // (the fine, plus a little fuel drift at most)
    // And the next visit is booked.
    game.dev.skipDays(1);
    expect(nextInspection(ctx).day).toBeGreaterThan(visit.day);
  });

  it('a clean bill of health lifts your reputation', () => {
    const { game, ctx, events, add } = setup({ off: ['rushOrder', 'dealerOffer'] });
    add('miniDigger');
    add('tractor');
    for (const m of game.state.machines) m.condition = 95;
    game.dev.skipDays(1);
    const visit = nextInspection(ctx);
    game.dev.skipDays(visit.day - 1);
    for (const m of game.state.machines) m.condition = 95; // (they wear a little over the days)
    hours(game, 24);
    const done = events('inspection');
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ fine: 0, good: true });
    expect(contractsState(ctx).reputation).toBeCloseTo(game.data.happenings.inspector.reputationBonus, 6);
  });
});

describe('rush orders', () => {
  it('only come once you have finished a job, and are smaller, sooner, better paid and open today only', () => {
    const { game, ctx, events } = setup({ off: ['dealerOffer'] });
    game.data.happenings.rushOrder.chancePerDay = 1;
    game.dev.skipDays(3);
    expect(events('rushOrder')).toHaveLength(0);
    contractsState(ctx).done = 1;
    game.dev.skipDays(1);
    const r = events('rushOrder')[0];
    expect(r).toBeDefined();
    const offer = contractsState(ctx).offers.find((o) => o.id === r.id);
    expect(offer.rush).toBe(true);
    expect(offer.days).toBe(2);
    expect(offer.expires).toBe(now(game).day); // open today only
    const job = acceptContract(ctx, offer.id).contract;
    expect(job.deadline - offer.expires).toBe(1); // due tomorrow
    // Next morning, unaccepted rush orders are gone.
    const other = contractsState(ctx).offers.find((o) => o.rush);
    game.dev.skipDays(1);
    if (other) expect(contractsState(ctx).offers.find((o) => o.id === other.id)).toBeUndefined();
  });
});

describe("the dealer's offers", () => {
  it('take a share off one machine you do not own, for a few days only', () => {
    const { game, ctx, events } = setup({ off: ['rushOrder'] });
    game.data.happenings.dealerOffer.chancePerDay = 1;
    game.dev.skipDays(game.data.happenings.dealerOffer.firstDay);
    const o = dealerOffer(ctx);
    expect(o).not.toBeNull();
    const list = game.data.machines.types[o.type].tiers[o.tier].price;
    expect(machinePrice(ctx, o.type, o.tier)).toBe(Math.round(list * 0.85));
    expect(events('dealerOffer')[0]).toMatchObject({ type: o.type, tier: o.tier, offerPrice: Math.round(list * 0.85) });
    // Other machines keep their price.
    const other = o.type === 'truck' ? 'excavator' : 'truck';
    expect(machinePrice(ctx, other, 'used')).toBe(game.data.machines.types[other].tiers.used.price);
    // Buying at the offer price.
    game.state.money = 10000;
    buyMachine(ctx, o.type, o.tier);
    expect(10000 - game.state.money).toBe(Math.round(list * 0.85));
    // It runs out.
    game.data.happenings.dealerOffer.chancePerDay = 0;
    game.dev.skipDays(game.data.happenings.dealerOffer.days);
    expect(dealerOffer(ctx)).toBeNull();
    expect(events('dealerOfferEnded')).toHaveLength(1);
    expect(machinePrice(ctx, o.type, o.tier)).toBe(list);
  });
});

describe('happenings in a save', () => {
  it('keep their state through a save and load', () => {
    const { game, ctx, add } = setup({ off: ['rushOrder'] });
    game.data.happenings.dealerOffer.chancePerDay = 1;
    add('miniDigger');
    add('tractor');
    game.dev.skipDays(game.data.happenings.dealerOffer.firstDay);
    happeningsDaily(ctx);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 3, state: saved });
    expect(nextInspection(g2.ctx)).toEqual(nextInspection(ctx));
    expect(dealerOffer(g2.ctx)).toEqual(dealerOffer(ctx));
    expect(happeningsState(g2.ctx).rngState).toBe(happeningsState(ctx).rngState);
  });
});

import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { classifiedsState, listingCondition, dealerPriceFor } from './index.js';

const setup = (seed = 21) => {
  const data = loadData();
  data.milestones.list = []; // (no rewards landing mid-test)
  const game = createGame({ seed, data });
  game.state.money = 10000;
  return game;
};
const fill = (game, days = 6) => {
  game.dev.skipDays(days);
  return classifiedsState(game.ctx).listings;
};

describe('the classifieds', () => {
  it('only start once you’ve bought a machine, and stay within the board’s size', () => {
    const game = setup();
    expect(fill(game)).toHaveLength(0);
    game.actions.buyMachine('miniDigger', 'rusty');
    const ls = fill(game, 10);
    expect(ls.length).toBeGreaterThan(0);
    expect(ls.length).toBeLessThanOrEqual(game.data.classifieds.maxListings);
  });

  it('price a machine below the dealer for the condition it claims, and take adverts down when they run out', () => {
    const game = setup();
    game.actions.buyMachine('miniDigger', 'rusty');
    const ls = fill(game);
    for (const l of ls) {
      expect(l.price).toBeLessThan(dealerPriceFor(game.ctx, l));
      expect(l.claimed).toBeGreaterThanOrEqual(l.actual);
    }
    const first = ls[0];
    game.dev.skipDays(game.data.classifieds.listingDays[1] + 1);
    expect(classifiedsState(game.ctx).listings.some((l) => l.id === first.id)).toBe(false);
  });

  it('a look over costs the fee and shows the real condition', () => {
    const game = setup();
    game.actions.buyMachine('miniDigger', 'rusty');
    const l = fill(game)[0];
    const money = game.state.money;
    const r = game.actions.inspectListing(l.id);
    expect(r.ok).toBe(true);
    expect(game.state.money).toBeCloseTo(money - game.data.classifieds.inspectionFee, 2);
    expect(listingCondition(l)).toBe(l.actual);
    expect(game.actions.inspectListing(l.id).ok).toBe(false); // (once is enough)
  });

  it('buying delivers the machine in its real condition, and says so if it wasn’t as described', () => {
    // (find a seed with a dishonest advert)
    for (let seed = 1; seed < 60; seed++) {
      const game = setup(seed);
      game.actions.buyMachine('miniDigger', 'rusty');
      const l = fill(game, 8).find((x) => x.actual < x.claimed);
      if (!l) continue;
      const notes = [];
      game.events.on('listingNotAsDescribed', (e) => notes.push(e));
      const money = game.state.money;
      const r = game.actions.buyListing(l.id);
      expect(r.ok).toBe(true);
      expect(r.machine).toMatchObject({ type: l.type, tier: l.tier, condition: l.actual });
      expect(game.state.money).toBeCloseTo(money - l.price, 2);
      expect(notes).toHaveLength(1);
      expect(classifiedsState(game.ctx).listings.some((x) => x.id === l.id)).toBe(false);
      return;
    }
    throw new Error('no dishonest advert in 60 seeds');
  });

  it('uses its own random numbers: the market moves the same with or without it', () => {
    const quiet = loadData();
    quiet.milestones.list = [];
    quiet.classifieds = { ...quiet.classifieds, fromMachines: 99 };
    const a = setup(30);
    const b = createGame({ seed: 30, data: quiet });
    b.state.money = 10000;
    for (const g of [a, b]) g.actions.buyMachine('miniDigger', 'rusty');
    a.dev.skipDays(6);
    b.dev.skipDays(6);
    expect(classifiedsState(a.ctx).listings.length).toBeGreaterThan(0);
    expect(a.state.market.products.gravel.trend).toBe(b.state.market.products.gravel.trend);
  });
});

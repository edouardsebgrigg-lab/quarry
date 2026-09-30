import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { sellLoad, quoteDelivery, chargeFuel, weighIn } from '../economy/index.js';
import { buyMachine, buyMod } from '../machinery/index.js';
import { buyBuilding } from '../buildings/index.js';
import { careerState, milestones, careerMetric, careerMetricNames, dealerPrice, hasPerk } from './index.js';

function setup(seed = 7) {
  const game = createGame({ seed });
  const pickup = game.state.machines.find((m) => m.type === 'pickup');
  const reached = [];
  game.events.on('milestoneReached', (e) => reached.push(e));
  // A sale straight into a bay: `load` is { material: tonnes }.
  const sell = (bay, load) => {
    pickup.load = { ...load };
    weighIn(game.ctx, pickup);
    pickup.load = {};
    return sellLoad(game.ctx, pickup.id, bay, load);
  };
  return { game, ctx: game.ctx, pickup, reached, sell };
}
const day = (game) => game.dev.skipDays(1);

describe('milestones', () => {
  it('counts clean loads in a row, starts again after a mixed one, and pays each milestone once', () => {
    const { game, ctx, reached, sell } = setup();
    for (let i = 0; i < 4; i++) sell('topsoil', { topsoil: 0.5 });
    sell('topsoil', { topsoil: 0.3, clay: 0.3 }); // graded down: the run is broken
    expect(careerState(ctx).cleanStreak).toBe(0);
    expect(careerState(ctx).bestCleanStreak).toBe(4);
    expect(reached.find((e) => e.id === 'clean5')).toBeUndefined();

    const before = game.state.money;
    for (let i = 0; i < 5; i++) sell('topsoil', { topsoil: 0.5 });
    const hit = reached.filter((e) => e.id === 'clean5');
    expect(hit).toHaveLength(1);
    expect(hit[0]).toMatchObject({ title: 'Clean run', reward: 80 });
    const m = milestones(ctx).find((x) => x.id === 'clean5');
    expect(m.reached).toBe(true);
    expect(m.day).toBeGreaterThanOrEqual(1);
    // the five sales plus the reward
    const sales = 5 * quoteDelivery(ctx, 'topsoil', { topsoil: 0.5 }).gross;
    expect(game.state.money - before).toBeGreaterThan(80);
    expect(game.state.money - before).toBeLessThan(80 + sales * 1.2);

    // More clean loads don't pay it again.
    for (let i = 0; i < 3; i++) sell('topsoil', { topsoil: 0.5 });
    expect(reached.filter((e) => e.id === 'clean5')).toHaveLength(1);
  });

  it('measures progress towards each milestone', () => {
    const { ctx, sell } = setup();
    sell('gravel', { gravel: 5 });
    const sold25 = milestones(ctx).find((x) => x.id === 'sold25');
    expect(sold25.value).toBeCloseTo(5, 5);
    expect(sold25.progress).toBeCloseTo(0.2, 5);
    expect(sold25.reached).toBe(false);
  });

  it('catches up on an old save that has already done the work', () => {
    const { game, ctx, reached } = setup();
    delete game.state.career; // (a save from before milestones)
    game.state.stats.tonnesSold = 30;
    game.state.stats.tonnesDug = 60;
    game.events.emit('dayStarted', {});
    expect(reached.map((e) => e.id).sort()).toEqual(['dug50', 'sold25']);
    expect(careerState(ctx).reached.sold25).toBeGreaterThanOrEqual(1);
  });

  it('keeps the best day of sales and job bonuses, starting afresh each day', () => {
    const { game, ctx, sell } = setup();
    sell('topsoil', { topsoil: 2 });
    game.events.emit('contractCompleted', { id: 1, client: 'Ashby Builders', material: 'topsoil', bonus: 40 });
    const first = careerMetric(ctx, 'bestDay');
    expect(first).toBeCloseTo(quoteDelivery(ctx, 'topsoil', { topsoil: 2 }).gross + 40, -1);
    day(game);
    sell('clay', { clay: 0.1 });
    expect(careerState(ctx).dayEarnings).toBeLessThan(first);
    expect(careerMetric(ctx, 'bestDay')).toBe(first);
  });

  it('counts gravel dug, metres of haul road and loans paid off from the game events', () => {
    const { game, ctx } = setup();
    game.events.emit('shovelDug', { x: 0, z: 0, tonnes: 0.02, materials: { topsoil: 0.02 } });
    game.events.emit('rockDug', { machineId: 'm1', tonnes: 0.5, materials: { gravel: 0.4, sand: 0.1 } });
    game.events.emit('worksBuilt', { mode: 'road', length: 22.5, width: 4, cost: 155 });
    game.events.emit('worksBuilt', { mode: 'ramp', length: 12, width: 4, cost: 116 });
    game.events.emit('loanRepaid', { loanId: 1, amount: 50, early: true });
    expect(careerMetric(ctx, 'gravelDug')).toBeCloseTo(0.4, 5);
    expect(careerMetric(ctx, 'roadMetres')).toBeCloseTo(22.5, 5);
    expect(careerMetric(ctx, 'loansCleared')).toBe(1);
  });

  it('saves and loads with the rest of the game', () => {
    const { game, sell } = setup();
    for (let i = 0; i < 5; i++) sell('topsoil', { topsoil: 0.5 });
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 7, state: saved });
    expect(careerState(g2.ctx).bestCleanStreak).toBe(5);
    expect(milestones(g2.ctx).find((x) => x.id === 'clean5').reached).toBe(true);
  });
});

describe('perks', () => {
  it('a trade account takes 5% off machines, upgrades and yard buildings', () => {
    const { game, ctx, reached } = setup();
    game.state.money = 20000;
    const price = game.data.machines.types.dumper.tiers.rusty.price;
    const m1 = buyMachine(ctx, 'dumper', 'rusty');
    expect(m1.ok).toBe(true);
    expect(20000 - game.state.money).toBe(price); // full price before the perk
    for (const t of ['miniDigger', 'tractor', 'excavator']) buyMachine(ctx, t, 'rusty');
    expect(game.state.machines).toHaveLength(5);
    expect(hasPerk(ctx, 'tradeAccount')).toBe(false);
    buyMachine(ctx, 'truck', 'rusty'); // the sixth machine
    expect(reached.find((e) => e.id === 'fleet6')).toMatchObject({ perk: 'tradeAccount', perkName: 'Trade account' });
    expect(hasPerk(ctx, 'tradeAccount')).toBe(true);

    let before = game.state.money;
    expect(buyMachine(ctx, 'dumper', 'used').ok).toBe(true);
    expect(before - game.state.money).toBe(Math.round(game.data.machines.types.dumper.tiers.used.price * 0.95));

    const pickup = game.state.machines.find((m) => m.type === 'pickup');
    before = game.state.money;
    expect(buyMod(ctx, pickup.id, 'stifferSprings').ok).toBe(true);
    expect(before - game.state.money).toBe(dealerPrice(ctx, game.data.mods.stifferSprings.price));

    before = game.state.money;
    const res = buyBuilding(ctx, 'workshop');
    expect(res.ok).toBe(true);
    expect(before - game.state.money).toBe(Math.round(game.data.buildings.workshop.price * 0.95));
    expect(res.cost).toBe(Math.round(game.data.buildings.workshop.price * 0.95));
  });

  it('a fuel card makes diesel 10% cheaper', () => {
    const { game, ctx } = setup();
    game.state.money = 1000;
    const full = chargeFuel(ctx, 10);
    careerState(ctx).perks.push('fuelCard');
    const carded = chargeFuel(ctx, 10);
    expect(carded).toBeCloseTo(full * 0.9, 6);
  });

  it('a depot account pays 4% more for clean loads only', () => {
    const { ctx } = setup();
    const clean = quoteDelivery(ctx, 'gravel', { gravel: 5 });
    const mixed = quoteDelivery(ctx, 'gravel', { gravel: 4.5, clay: 0.5 });
    careerState(ctx).perks.push('depotAccount');
    expect(quoteDelivery(ctx, 'gravel', { gravel: 5 }).gross).toBeCloseTo(clean.gross * 1.04, 6);
    expect(quoteDelivery(ctx, 'gravel', { gravel: 4.5, clay: 0.5 }).gross).toBeCloseTo(mixed.gross, 6);
  });
});

describe('milestone data', () => {
  it('uses only known measures and perks, with unique ids, and each perk comes from one milestone', () => {
    const { ctx } = setup();
    const { list, perks, groups } = ctx.data.milestones;
    const ids = new Set();
    for (const m of list) {
      expect(ids.has(m.id), m.id).toBe(false);
      ids.add(m.id);
      expect(groups[m.group], m.id).toBeDefined();
      expect(m.target, m.id).toBeGreaterThan(0);
      expect(careerMetricNames(), m.metric).toContain(m.metric);
      if (m.perk) expect(perks[m.perk], m.perk).toBeDefined();
    }
    for (const id of Object.keys(perks)) expect(list.filter((m) => m.perk === id)).toHaveLength(1);
  });
});

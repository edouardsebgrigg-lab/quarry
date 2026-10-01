import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { sellLoad, quoteDelivery, chargeFuel, weighIn, weeklyInsurance } from '../economy/index.js';
import { buyMachine, buyMod } from '../machinery/index.js';
import { buyBuilding } from '../buildings/index.js';
import { careerState, milestones, careerMetric, careerMetricNames, dealerPrice, hasPerk, pinnedMilestone, checkMilestones } from './index.js';

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

describe('player-chosen milestone targets', () => {
  it('chooses, switches and clears through actions without changing work, cash or goals', () => {
    const { game, ctx } = setup();
    const before = { money: game.state.money, stats: structuredClone(game.state.stats), objective: game.state.objectives.index };
    const events = [];
    game.events.on('*', type => events.push(type));
    expect(game.actions.pinMilestone('dug400')).toEqual({ ok: true, id: 'dug400' });
    expect(pinnedMilestone(ctx)).toMatchObject({ id: 'dug400', progress: 0, reached: false, perkName: 'Fuel card' });
    expect(game.actions.pinMilestone('road100').ok).toBe(true);
    expect(careerState(ctx).pinnedMilestoneId).toBe('road100');
    expect(game.actions.pinMilestone('missing')).toMatchObject({ ok: false });
    expect(careerState(ctx).pinnedMilestoneId).toBe('road100');
    expect(game.actions.unpinMilestone()).toEqual({ ok: true });
    expect(game.actions.unpinMilestone().ok).toBe(true);
    expect(pinnedMilestone(ctx)).toBeNull();
    expect(game.state.money).toBe(before.money);
    expect(game.state.stats).toEqual(before.stats);
    expect(game.state.objectives.index).toBe(before.objective);
    expect(events).toEqual([]);
  });

  it('selection never claims rewards, while real milestone checks pay pinned and unpinned achievements once', () => {
    const { game, ctx, reached } = setup();
    game.state.stats.tonnesDug = 400; // fixture: completed digging has not been checked yet
    const before = game.state.money;
    expect(game.actions.pinMilestone('dug400').ok).toBe(true);
    expect(game.state.money).toBe(before);
    expect(careerState(ctx).reached).toEqual({});
    checkMilestones(ctx);
    expect(reached.map(m => m.id)).toEqual(['dug50', 'dug400']);
    expect(game.state.money).toBe(before + 60 + 300);
    expect(hasPerk(ctx, 'fuelCard')).toBe(true);
    expect(pinnedMilestone(ctx)).toMatchObject({ id: 'dug400', reached: true, progress: 1, reward: 300, perkName: 'Fuel card' });
    checkMilestones(ctx);
    expect(game.actions.pinMilestone('dug400').ok).toBe(true); // retained completed target
    expect(game.actions.pinMilestone('dug50')).toMatchObject({ ok: false });
    expect(game.state.money).toBe(before + 360);
    expect(reached).toHaveLength(2);
    game.actions.unpinMilestone();
    expect(game.actions.pinMilestone('dug400')).toMatchObject({ ok: false });
    expect(game.actions.pinMilestone('road100').ok).toBe(true);
  });

  it('tracks actual clean-run progress and exposes a reset without weakening the clean-sale rule', () => {
    const { game, ctx, sell, reached } = setup();
    game.actions.pinMilestone('clean5');
    for (let i = 0; i < 4; i++) sell('topsoil', { topsoil: .5 });
    expect(pinnedMilestone(ctx)).toMatchObject({ value: 4, progress: .8, reached: false });
    sell('topsoil', { topsoil: .3, clay: .3 });
    expect(pinnedMilestone(ctx)).toMatchObject({ value: 4, reached: false });
    expect(pinnedMilestone(ctx).nextStep).toContain('Current clean run: 0');
    for (let i = 0; i < 5; i++) sell('topsoil', { topsoil: .5 });
    expect(pinnedMilestone(ctx)).toMatchObject({ id: 'clean5', reached: true, progress: 1 });
    sell('topsoil', { topsoil: .5 });
    expect(reached.filter(m => m.id === 'clean5')).toHaveLength(1);
  });

  it('preserves the selected target and exact progress across save/load', () => {
    const { game, ctx } = setup();
    game.actions.pinMilestone('dug400');
    game.state.stats.tonnesDug = 37.25;
    const target = pinnedMilestone(ctx);
    const restored = createGame({ state: JSON.parse(JSON.stringify(game.snapshot())) });
    expect(pinnedMilestone(restored.ctx)).toEqual(target);
    expect(restored.state.career.pinnedMilestoneId).toBe('dug400');
  });

  it('defaults old and removed-target saves without losing existing achievements or perks', () => {
    const { game } = setup();
    game.state.career.reached.dug400 = 2;
    game.state.career.perks = ['fuelCard'];
    game.state.career.seen = 1;
    const saved = game.snapshot();
    delete saved.career.pinnedMilestoneId;
    const old = createGame({ state: JSON.parse(JSON.stringify(saved)) });
    expect(old.state.career).toMatchObject({ pinnedMilestoneId: null, reached: { dug400: 2 }, perks: ['fuelCard'], seen: 1 });
    saved.career.pinnedMilestoneId = 'removed-milestone';
    const missing = createGame({ state: JSON.parse(JSON.stringify(saved)) });
    expect(missing.state.career).toMatchObject({ pinnedMilestoneId: null, reached: { dug400: 2 }, perks: ['fuelCard'], seen: 1 });
    delete saved.career;
    const legacy = createGame({ state: JSON.parse(JSON.stringify(saved)) });
    expect(legacy.state.career.pinnedMilestoneId).toBeNull();
  });

  it('keeps a reached target complete when a live ownership counter later falls', () => {
    const { game, ctx } = setup();
    game.actions.pinMilestone('fleet6');
    while (game.state.machines.length < 6) game.state.machines.push({ ...game.state.machines[0], id: `fixture-${game.state.machines.length}` });
    checkMilestones(ctx);
    const paid = game.state.money;
    game.state.machines.splice(1);
    expect(pinnedMilestone(ctx)).toMatchObject({ id: 'fleet6', value: 1, reached: true, progress: 1 });
    expect(milestones(ctx).find(m => m.id === 'fleet6')).toMatchObject({ reached: true, pinned: true, progress: 1 });
    checkMilestones(ctx);
    expect(game.state.money).toBe(paid);
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

describe('milestones for hire, regular customers and credit', () => {
  it('count machines back from hire, regular weeks delivered and the credit rating', () => {
    const game = createGame({ seed: 3 });
    const got = [];
    game.events.on('milestoneReached', (e) => got.push(e.id));
    game.events.emit('machineReturned', { machineId: 'm1', name: 'x', client: 'y', total: 50, wear: 6 });
    expect(got).toContain('hire1');
    for (let i = 0; i < 4; i++) game.events.emit('standingWeekDone', { client: 'c', material: 'sand', bonus: 40, week: i + 1, weeks: 4 });
    expect(got).toContain('regular4');
    game.state.bank.credit = 81;
    game.events.emit('loanTaken', { loanId: 1, amount: 250, days: 7, payment: 40 });
    expect(got).toContain('credit80');
  });
});

it('hired machines are excluded from owned fleet milestones, insurance and borrowing assets',()=>{
 const {game,ctx,reached}=setup();game.state.money=20000;
 const credit=game.actions.creditLimit(), insured=weeklyInsurance(ctx);
 const a=game.actions.rentMachine('excavator','used',1);
 const b=game.actions.rentMachine('truck','used',1);
 expect(a.ok).toBe(true);expect(b.ok).toBe(true);
 expect(careerMetric(ctx,'fleetSize')).toBe(1);
 expect(careerMetric(ctx,'usedMachines')).toBe(0);
 expect(game.actions.creditLimit()).toBe(credit);
 expect(weeklyInsurance(ctx)).toBe(insured);
 for(let i=0;i<4;i++)expect(buyMachine(ctx,'dumper','rusty').ok).toBe(true);
 expect(careerMetric(ctx,'fleetSize')).toBe(5);
 expect(reached.some(e=>e.id==='fleet6')).toBe(false);
 expect(buyMachine(ctx,'truck','rusty').ok).toBe(true);
 expect(reached.some(e=>e.id==='fleet6')).toBe(true);
});

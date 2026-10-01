import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { currentObjective, markIntroSeen } from './index.js';
import { tickJobs } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';
import { sellLoad } from '../economy/index.js';
import { contractsState, acceptContract } from '../contracts/index.js';
import { buyBuilding } from '../buildings/index.js';
import { careerMetric } from '../career/index.js';
import { attachedTrailer } from '../machinery/trailers.js';

function finish(ctx, m) {
  for (let i = 0; i < 10000 && m.job; i++) tickJobs(ctx, 0.1);
}

describe('getting-started goals', () => {
  it('walks from a shovel to the depot, then up the machine ladder to a first truck load', () => {
    const game = createGame({ seed: 4 });
    const { ctx, actions } = game;
    const step = () => currentObjective(ctx)?.id;
    const pickup = game.state.machines.find((m) => m.type === 'pickup');
    expect(step()).toBe('firstShovel');

    // By hand: dig, fill the barrow, tip it into the pickup.
    expect(actions.shovelDig({ x: 30, z: 20 }).ok).toBe(true);
    expect(step()).toBe('fillBarrow');
    let spot = 0;
    const fill = () => {
      for (let i = 0; i < 12; i++) {
        if (!actions.shovelDump({ into: 'barrow' }).ok) break;
        spot += 1;
        actions.shovelDig({ x: 30 + (spot % 20) * 0.5, z: 20 + Math.floor(spot / 20) * 0.5 });
      }
    };
    fill();
    expect(step()).toBe('loadPickup');
    for (let i = 0; i < 6 && step() === 'loadPickup'; i++) {
      expect(actions.tipBarrow({ machineId: pickup.id }).ok).toBe(true);
      if (step() === 'loadPickup') fill();
    }
    expect(step()).toBe('weighIn');
    expect(pileTotal(pickup.load)).toBeGreaterThanOrEqual(0.3);

    // At the depot: weigh in, unload in the topsoil bay.
    expect(actions.tip(pickup.id, { bay: 'topsoil' }).reason).toMatch(/Weigh in/);
    expect(actions.weighIn(pickup.id).ok).toBe(true);
    expect(step()).toBe('firstSale');
    const before = ctx.state.money;
    expect(actions.tip(pickup.id, { bay: 'topsoil' }).ok).toBe(true);
    finish(ctx, pickup);
    const reward = ctx.data.objectives.steps.find((s) => s.id === 'firstSale').reward;
    expect(ctx.state.money).toBeGreaterThan(before + reward);

    // A cheap upgrade for the pickup, then saving up for the mini digger.
    expect(step()).toBe('firstMod');
    expect(actions.buyMod(pickup.id, 'stifferSprings').ok).toBe(true);
    expect(step()).toBe('buyMiniDigger');
    expect(currentObjective(ctx).progress).toBeGreaterThan(0.5);
    expect(currentObjective(ctx).progress).toBeLessThanOrEqual(1);
    ctx.state.money += 400; // (more trips by hand)
    const digger = actions.buyMachine('miniDigger', 'mini16').machine;
    expect(step()).toBe('firstScoop');
    expect(actions.scoop(digger.id, { x: 60, z: 60 }).ok).toBe(true);
    finish(ctx, digger);
    expect(step()).toBe('buyTractor');

    // The tractor and trailer: only a full-ish trailer load counts.
    ctx.state.money += 500;
    const tractor = actions.buyMachine('tractor', 'yard35').machine;
    expect(step()).toBe('buyTractor');
    const trailer = actions.buyMachine('trailer', 'yardTipper').machine;
    expect(actions.attachTrailer(tractor.id,trailer.id).ok).toBe(true);
    expect(step()).toBe('sellTrailer');
    pickup.load = { topsoil: 0.5 };
    actions.weighIn(pickup.id);
    actions.tip(pickup.id, { bay: 'topsoil' });
    finish(ctx, pickup);
    attachedTrailer(ctx,tractor).load = { topsoil: 0.5 };
    actions.weighIn(tractor.id);
    actions.tip(tractor.id, { bay: 'topsoil' });
    finish(ctx, tractor);
    expect(step()).toBe('sellTrailer');
    for (let i = 0; i < 80 && pileTotal(attachedTrailer(ctx,tractor).load) < 1.2; i++) {
      actions.scoop(digger.id, { x: 60 + (i % 10) * 0.8, z: 64 + Math.floor(i / 10) * 0.8 });
      finish(ctx, digger);
      actions.dumpBucket(digger.id, { machineId: tractor.id });
    }
    expect(pileTotal(attachedTrailer(ctx,tractor).load)).toBeGreaterThanOrEqual(1);
    actions.weighIn(tractor.id);
    expect(actions.tip(tractor.id, { bay: 'topsoil' }).ok).toBe(true);
    finish(ctx, tractor);
    expect(step()).toBe('buildWorks');

    // Groundworks: a level area needs no gravel, so it's the one anyone can build.
    ctx.state.money += 300;
    const level = actions.buildWorks({ mode: 'level', ax: 30, az: 120, bx: 38, bz: 120, width: 8 });
    expect(level.ok, level.reason).toBe(true);
    expect(step()).toBe('buyExcavator');

    // The big machines: buying the truck first still works.
    ctx.state.money = 5000;
    const truck = actions.buyMachine('truck', 'rusty').machine;
    expect(step()).toBe('buyExcavator');
    const ex = actions.buyMachine('excavator', 'rusty').machine;
    expect(step()).toBe('sell');
    for (let i = 0; i < 40 && pileTotal(truck.load) < 3; i++) {
      actions.scoop(ex.id, { x: 90 + (i % 8) * 1.4, z: 90 + Math.floor(i / 8) * 1.4 });
      finish(ctx, ex);
      actions.dumpBucket(ex.id, { machineId: truck.id });
    }
    actions.weighIn(truck.id);
    actions.tip(truck.id, { bay: 'mixed' });
    finish(ctx, truck);
    expect(step()).toBe('earn');
    ctx.state.stats.totalEarned = 3000;
    actions.selectMachine(pickup.id); // any event re-checks the goal
    expect(step()).toBe('usedMachine');
  });

  it('carries on after the first Used machine: jobs, the yard, clean loads, a name, a Used fleet', () => {
    const game = createGame({ seed: 5 });
    const { ctx, actions } = game;
    const step = () => currentObjective(ctx)?.id;
    const pickup = game.state.machines.find((m) => m.type === 'pickup');
    const sell = (load) => {
      pickup.load = { ...load };
      actions.weighIn(pickup.id);
      pickup.load = {};
      return sellLoad(ctx, pickup.id, Object.keys(load)[0], load);
    };
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'usedMachine');
    game.state.money = 20000;
    actions.buyMachine('excavator', 'used');
    expect(step()).toBe('firstJob');

    // A job from the board, delivered clean.
    const offer = contractsState(ctx).offers[0];
    expect(acceptContract(ctx, offer.id).ok).toBe(true);
    expect(currentObjective(ctx).progress).toBe(0);
    sell({ [offer.material]: offer.tonnes / 2 });
    expect(currentObjective(ctx).progress).toBeGreaterThan(0.3);
    sell({ [offer.material]: offer.tonnes });
    expect(step()).toBe('yardBuilding');
    expect(buyBuilding(ctx, 'fuelTank').ok).toBe(true);
    expect(step()).toBe('cleanTonnes');

    // Clean tonnes: mixed loads don't count (the job's loads were clean, so they do).
    const soFar = careerMetric(ctx, 'cleanTonnes');
    sell({ gravel: 200 });
    sell({ gravel: 60, clay: 60 });
    expect(currentObjective(ctx).progress).toBeCloseTo((soFar + 200) / 300, 2);
    sell({ sand: 100 });
    expect(step()).toBe('goodName');

    // A name: reputation from jobs done on time.
    for (let i = 0; i < 10 && step() === 'goodName'; i++) {
      const o = contractsState(ctx).offers[0] ?? (game.dev.skipDays(1), contractsState(ctx).offers[0]);
      acceptContract(ctx, o.id);
      sell({ [o.material]: o.tonnes });
    }
    expect(step()).toBe('usedFleet');
    expect(currentObjective(ctx).progress).toBe(0.5); // the Used excavator counts, a road vehicle doesn't yet
    actions.buyMachine('truck', 'used');
    expect(step()).toBe('earnBig');
    game.state.stats.totalEarned = 15000;
    actions.selectMachine(pickup.id);
    expect(currentObjective(ctx)).toBeNull();
  });

  it('allows clean depot sales to replace customer jobs and reputation goals', () => {
    const game = createGame({ seed: 5 });
    const { ctx, actions } = game;
    const pickup = game.state.machines[0];
    const sell = tonnes => {
      pickup.load = { topsoil: tonnes };
      actions.weighIn(pickup.id);
      pickup.load = {};
      sellLoad(ctx, pickup.id, 'topsoil', { topsoil: tonnes });
    };
    ctx.state.objectives.index = game.data.objectives.steps.findIndex(s => s.id === 'firstJob');
    sell(30);
    expect(currentObjective(ctx).progress).toBeCloseTo(.5);
    sell(30);
    expect(currentObjective(ctx).id).toBe('yardBuilding');
    expect(contractsState(ctx).done).toBe(0);
    ctx.state.objectives.index = game.data.objectives.steps.findIndex(s => s.id === 'goodName');
    sell(440);
    expect(currentObjective(ctx).id).toBe('usedFleet');
    expect(contractsState(ctx).done).toBe(0);
  });

  it('shows how far you are with saving up for the next machine', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'buyTruck');
    game.state.money = game.data.machines.types.truck.tiers.rusty.price / 4;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.25);
  });

  it('reports progress for measurable goals', () => {
    const game = createGame({ seed: 1 });
    game.state.objectives.index = game.data.objectives.steps.findIndex((s) => s.id === 'earn');
    game.state.stats.totalEarned = 1500;
    expect(currentObjective(game.ctx).progress).toBeCloseTo(0.5);
  });
});

describe('the mentor', () => {
  it('texts the plan for each goal as it comes up, and one-off tips only once', () => {
    const game = createGame({ seed: 2 });
    const got = [];
    game.events.on('mentorMessage', (e) => got.push(e));
    game.ctx.state.objectives.introSeen = false;
    // Intro closed: the first goal's message.
    markIntroSeen(game.ctx);
    expect(got.at(-1)).toMatchObject({ from: 'Ray', kind: 'goal' });
    expect(got.at(-1).text).toMatch(/shovel/);
    // A goal done: the next goal's message.
    game.actions.shovelDig({ x: 30, z: 20 });
    expect(got.at(-1).text).toBe(game.data.objectives.steps[1].mentor);
    // A breakdown tip, once.
    game.events.emit('machineBrokeDown', { machineId: game.state.machines[0].id });
    game.events.emit('machineBrokeDown', { machineId: game.state.machines[0].id });
    expect(got.filter((m) => m.kind === 'tip')).toHaveLength(1);
    expect(game.state.mentor.seen.breakdown).toBe(true);
  });

  it('points at the planner for roads and ramps once you have a machine, once', () => {
    const game = createGame({ seed: 2 });
    const got = [];
    game.events.on('mentorMessage', (e) => got.push(e));
    game.events.emit('machineBought', { machineId: 9, type: 'pickup', tier: 'rusty', price: 1 });
    expect(got).toHaveLength(0);
    game.events.emit('machineBought', { machineId: 10, type: 'miniDigger', tier: 'rusty', price: 1 });
    game.events.emit('machineBought', { machineId: 11, type: 'dumper', tier: 'rusty', price: 1 });
    expect(got.filter((m) => m.kind === 'tip')).toHaveLength(1);
    expect(got.at(-1).text).toMatch(/haul road/);
  });

  it('every goal has a message from the mentor', () => {
    const game = createGame({ seed: 2 });
    for (const s of game.data.objectives.steps) expect(s.mentor, s.id).toBeTruthy();
  });
});

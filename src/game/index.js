// Creates a running game: state + event bus + tick loop + player actions.
// Knows nothing about the screen.
import {
  loadData, createEventBus, createRng, advanceClock, tickSeconds, ticksPerDay, ticksPerHour,
} from '../core/index.js';
import { marketHourly, chargeDailyInterest, fuelDaily, addMoney, recordMoney, bankDaily, overheadsDaily, newsDaily } from '../economy/index.js';
import { tickJobs, fixAllMachines } from '../machinery/index.js';
import { createNewState } from './state.js';
import { createActions } from './actions.js';
import { objectivesOnEvent, mentorOnEvent } from '../progression/index.js';
import { createGround } from '../ground/index.js';
import { logbookOnEvent } from './logbook.js';
import { contractsOnEvent, contractsDaily } from '../contracts/index.js';
import { weatherOnEvent, weatherState } from '../weather/index.js';
import { hireOnEvent } from '../hire/index.js';
import { classifiedsOnEvent } from '../classifieds/index.js';
import { staffOnEvent, staffTick } from '../staff/index.js';
import { careerOnEvent, careerState } from '../career/index.js';
import { happeningsDaily, happeningsHourly } from '../happenings/index.js';

export function createGame({ data = loadData(), seed = Math.floor(Math.random() * 2 ** 31), state } = {}) {
  const events = createEventBus();
  const ctx = { data, events, state: null, rng: null };
  ctx.rng = createRng(() => ctx.state);
  ctx.state = state ?? createNewState(data, seed);

  // The diggable ground of the current site (if it has one), rebuilt from its seed plus
  // the saved changes.
  const plotId = data.sites[ctx.state.currentSiteId]?.groundPlot;
  ctx.ground = plotId ? createGround(data.ground, plotId, { seed: ctx.state.seed ?? 1 }) : null;
  if (ctx.ground && ctx.state.ground) ctx.ground.load(ctx.state.ground);

  events.on('hourPassed', () => marketHourly(ctx));
  events.on('hourPassed', (e) => happeningsHourly(ctx, e));
  careerState(ctx);
  events.on('*', (type, payload) => careerOnEvent(ctx, type, payload));
  events.on('*', (type, payload) => objectivesOnEvent(ctx, type, payload));
  events.on('*', (type, payload) => mentorOnEvent(ctx, type, payload));
  events.on('*', (type, payload) => logbookOnEvent(ctx, type, payload));
  events.on('*', (type, payload) => contractsOnEvent(ctx, type, payload));
  events.on('*', (type) => weatherOnEvent(ctx, type));
  events.on('*', (type) => hireOnEvent(ctx, type));
  events.on('*', (type) => classifiedsOnEvent(ctx, type));
  events.on('*', (type) => staffOnEvent(ctx, type));
  weatherState(ctx);
  if (!ctx.state.contracts) contractsDaily(ctx); // (a new game, or an old save: fill the board)
  events.on('dayStarted', () => {
    bankDaily(ctx);
    overheadsDaily(ctx);
    chargeDailyInterest(ctx);
    fuelDaily(ctx);
    newsDaily(ctx);
    happeningsDaily(ctx);
  });
  events.on('moneyChanged', (e) => recordMoney(ctx, e));

  function tick() {
    tickJobs(ctx, tickSeconds(data));
    staffTick(ctx, tickSeconds(data));
    ctx.ground?.settle(4000);
    advanceClock(ctx);
  }

  function advance(ticks) {
    for (let i = 0; i < ticks; i++) tick();
  }

  const dev = {
    addMoney: (amount) => addMoney(ctx, amount, 'dev'),
    skipHours: (hours) => advance(hours * ticksPerHour(data)),
    skipDays: (days) => advance(days * ticksPerDay(data)),
    fixAllMachines: () => fixAllMachines(ctx),
    unlockAll() {
      ctx.state.flags.unlockAll = true;
      events.emit('unlocksChanged', {});
    },
  };

  return {
    ctx,
    data,
    events,
    get state() { return ctx.state; },
    tick,
    advance,
    // The state to save: the plain game state plus the ground's changes.
    snapshot() {
      if (ctx.ground) ctx.state.ground = ctx.ground.serialize();
      return ctx.state;
    },
    actions: createActions(ctx),
    dev,
  };
}

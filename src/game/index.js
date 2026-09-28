// Creates a running game: state + event bus + tick loop + player actions.
// Knows nothing about the screen.
import {
  loadData, createEventBus, createRng, advanceClock, tickSeconds, ticksPerDay, ticksPerHour,
} from '../core/index.js';
import { marketHourly, chargeDailyInterest, fuelDaily, addMoney } from '../economy/index.js';
import { tickJobs, fixAllMachines } from '../machinery/index.js';
import { createNewState } from './state.js';
import { createActions } from './actions.js';
import { objectivesOnEvent } from '../progression/index.js';

export function createGame({ data = loadData(), seed = Math.floor(Math.random() * 2 ** 31), state } = {}) {
  const events = createEventBus();
  const ctx = { data, events, state: null, rng: null };
  ctx.rng = createRng(() => ctx.state);
  ctx.state = state ?? createNewState(data, seed);

  events.on('hourPassed', () => marketHourly(ctx));
  events.on('*', (type, payload) => objectivesOnEvent(ctx, type, payload));
  events.on('dayStarted', () => {
    chargeDailyInterest(ctx);
    fuelDaily(ctx);
  });

  function tick() {
    tickJobs(ctx, tickSeconds(data));
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
    actions: createActions(ctx),
    dev,
  };
}

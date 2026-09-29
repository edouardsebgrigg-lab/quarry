// The step-by-step goals that take a new player from a shovel to a working business.
// Texts and rewards are in data/objectives.json; the checks for each step are here.
import { addMoney } from '../economy/index.js';
import { tierData } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';
import { barrowFill } from '../handtools/index.js';

const pickupLoad = (ctx) => Math.max(0, ...ctx.state.machines.filter((m) => m.type === 'pickup').map((m) => pileTotal(m.load)));
const machineOf = (ctx, id) => ctx.state.machines.find((m) => m.id === id);
const owns = (ctx, type) => ctx.state.machines.some((m) => m.type === type);

// Each check gets (ctx, eventType, payload, step) and returns true when the step is done.
const CHECKS = {
  firstShovel: (ctx, type) => type === 'shovelDug',
  fillBarrow: (ctx) => barrowFill(ctx) >= 0.9,
  loadPickup: (ctx, type, p, step) => pickupLoad(ctx) >= step.target,
  weighIn: (ctx, type) => type === 'weighedIn',
  firstSale: (ctx, type) => type === 'productSold',
  buyMiniDigger: (ctx) => owns(ctx, 'miniDigger'),
  buyTractor: (ctx) => owns(ctx, 'tractor'),
  buyExcavator: (ctx) => owns(ctx, 'excavator'),
  buyTruck: (ctx) => owns(ctx, 'truck'),
  firstScoop: (ctx, type, p) => type === 'rockDug' && p.tonnes > 0,
  sellTrailer: (ctx, type, p, step) => type === 'productSold' && machineOf(ctx, p.machineId)?.type === 'tractor' && p.tonnes >= step.target - 1e-9,
  sell: (ctx, type, p) => type === 'productSold' && machineOf(ctx, p.machineId)?.type === 'truck',
  firstMod: (ctx, type) => type === 'modBought',
  earn: (ctx, type, p, step) => ctx.state.stats.totalEarned >= step.target,
  usedMachine: (ctx, type, p) => type === 'machineBought' && p.tier !== 'rusty',
};

// How far along the current step is (0..1), or null if it has no measurable progress.
const saving = (ctx, type) => Math.min(1, Math.max(0, ctx.state.money) / tierData(ctx.data, type, 'rusty').price);
const PROGRESS = {
  fillBarrow: (ctx) => Math.min(1, barrowFill(ctx)),
  loadPickup: (ctx, step) => Math.min(1, pickupLoad(ctx) / step.target),
  buyMiniDigger: (ctx) => saving(ctx, 'miniDigger'),
  buyTractor: (ctx) => saving(ctx, 'tractor'),
  buyExcavator: (ctx) => saving(ctx, 'excavator'),
  buyTruck: (ctx) => saving(ctx, 'truck'),
  earn: (ctx, step) => Math.min(1, ctx.state.stats.totalEarned / step.target),
};

export function createObjectivesState() {
  return { index: 0, introSeen: false };
}

export function currentObjective(ctx) {
  const steps = ctx.data.objectives.steps;
  const o = ctx.state.objectives;
  if (!o || o.index >= steps.length) return null;
  const step = steps[o.index];
  return {
    ...step,
    number: o.index + 1,
    total: steps.length,
    progress: PROGRESS[step.id]?.(ctx, step) ?? null,
  };
}

let checking = false;

// Called for every game event. Completes the current step (and any following steps
// that are already satisfied) and pays out rewards.
export function objectivesOnEvent(ctx, type, payload) {
  if (checking || type === 'objectiveCompleted') return;
  checking = true;
  try {
    const steps = ctx.data.objectives.steps;
    const o = ctx.state.objectives;
    while (o && o.index < steps.length) {
      const step = steps[o.index];
      const check = CHECKS[step.id];
      if (!check || !check(ctx, type, payload, step)) break;
      o.index += 1;
      if (step.reward) addMoney(ctx, step.reward, 'objective');
      ctx.events.emit('objectiveCompleted', { id: step.id, title: step.title, reward: step.reward, next: steps[o.index] ?? null });
      type = 'objectiveCheck'; // later steps are only re-checked against the game state
    }
  } finally {
    checking = false;
  }
}

export function markIntroSeen(ctx) {
  ctx.state.objectives.introSeen = true;
}

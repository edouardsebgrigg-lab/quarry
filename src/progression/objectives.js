// The step-by-step goals that take a new player from an empty pit to a working business.
// Texts and rewards are in data/objectives.json; the checks for each step are here.
import { addMoney } from '../economy/index.js';
import { getStats } from '../machinery/index.js';
import { pileTotal } from '../quarry/index.js';

function fullestTruck(ctx) {
  let best = 0;
  for (const m of ctx.state.machines) {
    if (m.type !== 'truck') continue;
    best = Math.max(best, pileTotal(m.load) / getStats(ctx.data, m).capacity);
  }
  return best;
}

// Each check gets (ctx, eventType, payload, step) and returns true when the step is done.
const CHECKS = {
  buyExcavator: (ctx) => ctx.state.machines.some((m) => m.type === 'excavator'),
  buyTruck: (ctx) => ctx.state.machines.some((m) => m.type === 'truck'),
  firstScoop: (ctx, type, p) => type === 'rockDug' && p.tonnes > 0,
  loadTruck: (ctx, type) => (type === 'bucketDumped' || type === 'truckLoaded') && fullestTruck(ctx) >= 0.9,
  tip: (ctx, type) => type === 'rockHauled',
  sell: (ctx, type) => type === 'productSold',
  firstMod: (ctx, type) => type === 'modBought',
  earn: (ctx, type, p, step) => ctx.state.stats.totalEarned >= step.target,
  usedMachine: (ctx, type, p) => type === 'machineBought' && p.tier !== 'rusty',
};

// How far along the current step is (0..1), or null if it has no measurable progress.
const PROGRESS = {
  loadTruck: (ctx) => Math.min(1, fullestTruck(ctx)),
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

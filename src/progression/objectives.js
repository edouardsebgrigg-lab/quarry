// The step-by-step goals that take a new player from a shovel to a working business.
// Texts and rewards are in data/objectives.json; the checks for each step are here.
import { objectiveState, observeObjectives, recordObjective, finishJourney } from './journal.js';
import { addMoney } from '../economy/index.js';
import { machinePrice, getStats } from '../machinery/index.js';
import { attachedTrailer, combinationStats } from '../machinery/trailers.js';
import { pileTotal } from '../quarry/index.js';
import { barrowFill } from '../handtools/index.js';
import { mentorForStep } from './mentor.js';
import { contractsState, reputation } from '../contracts/index.js';
import { careerMetric, dealerPrice } from '../career/index.js';

const pickupLoad = (ctx) => Math.max(0, ...ctx.state.machines.filter((m) => m.type === 'pickup').map((m) => pileTotal(m.load)));
const owns = (ctx, type) => ctx.state.machines.some((m) => m.type === type && !m.rental);
const worksBuilt = (ctx) => Object.values(ctx.state.stats.works ?? {}).reduce((a, b) => a + b, 0);
const yardBuildings = (ctx) => Object.values(ctx.state.buildings?.[ctx.state.currentSiteId] ?? {}).filter((x) => x === true).length;
// A Used digger and a Used road vehicle: { digger, road } (true when you own one).
const usedFleet = (ctx) => {
  const owned = ctx.state.machines.filter(m=>!m.rental);
  return { digger:owned.some(m=>ctx.data.machines.types[m.type]?.kind==='digger' && (m.tier==='used' || getStats(ctx.data,m).mass>=3500)),
    road:owned.some(m=>ctx.data.machines.types[m.type]?.kind==='carrier' && ctx.data.machines.types[m.type].roadLegal &&
      (m.tier==='used' || combinationStats(ctx,m).capacity>=6)) };
};

// Each check gets (ctx, eventType, payload, step) and returns true when the step is done.
const CHECKS = {
  firstShovel: ctx => !!ctx.state.objectives.evidence?.shovel || pileTotal(ctx.state.tools.shovel.load)>0,
  fillBarrow: ctx => !!ctx.state.objectives.evidence?.barrowFull || barrowFill(ctx)>=.9,
  loadPickup: (ctx, type, p, step) => Math.max(pickupLoad(ctx),ctx.state.objectives.evidence?.pickupLoad??0) >= step.target,
  weighIn: ctx => !!ctx.state.objectives.evidence?.weighed,
  firstSale: ctx => !!ctx.state.objectives.evidence?.sold || ctx.state.stats.tonnesSold>0,
  buyMiniDigger: (ctx) => owns(ctx, 'miniDigger'),
  buyTractor: (ctx) => ctx.state.machines.some(m=>m.type==='tractor' && !m.rental && attachedTrailer(ctx,m)),
  buyExcavator: (ctx) => owns(ctx, 'excavator'),
  buyTruck: (ctx) => owns(ctx, 'truck'),
  firstScoop: ctx => !!ctx.state.objectives.evidence?.machineDug,
  sellTrailer: (ctx, type, p, step) => (ctx.state.objectives.evidence?.trailerSale??0) >= step.target-1e-9,
  sell: ctx => !!ctx.state.objectives.evidence?.truckSale,
  firstMod: ctx => !!ctx.state.objectives.evidence?.modified || ctx.state.machines.some(m=>m.mods?.length>0),
  earn: (ctx, type, p, step) => ctx.state.stats.totalEarned >= step.target,
  usedMachine: ctx => !!ctx.state.objectives.evidence?.upgraded || ctx.state.machines.some(m=>!m.rental&&m.tier!=='rusty'),
  buildWorks: (ctx) => worksBuilt(ctx) > 0,
  firstJob: (ctx, type, p, step) => (contractsState(ctx).done ?? 0) > 0 || careerMetric(ctx,'cleanTonnes') >= step.alternativeTonnes,
  yardBuilding: (ctx) => yardBuildings(ctx) > 0,
  cleanTonnes: (ctx, type, p, step) => careerMetric(ctx, 'cleanTonnes') >= step.target - 1e-9,
  goodName: (ctx, type, p, step) => reputation(ctx).level >= step.target || careerMetric(ctx,'cleanTonnes') >= step.alternativeTonnes,
  usedFleet: (ctx) => { const f = usedFleet(ctx); return f.digger && f.road; },
  earnBig: (ctx, type, p, step) => ctx.state.stats.totalEarned >= step.target,
};

// How far along the current step is (0..1), or null if it has no measurable progress.
export const entryModel = (data,type) => Object.entries(data.machines.types[type].tiers)
  .filter(([,s])=>!s.legacy).sort((a,b)=>a[1].price-b[1].price)[0]?.[0] ?? 'rusty';
const saving = (ctx, type) => {
  const price = machinePrice(ctx,type,entryModel(ctx.data,type)) + (type==='tractor' ? machinePrice(ctx,'trailer',entryModel(ctx.data,'trailer')) : 0);
  return Math.min(1, Math.max(0, ctx.state.money) / price);
};
const PROGRESS = {
  fillBarrow: (ctx) => Math.min(1, barrowFill(ctx)),
  loadPickup: (ctx, step) => Math.min(1, pickupLoad(ctx) / step.target),
  buyMiniDigger: (ctx) => saving(ctx, 'miniDigger'),
  buyTractor: (ctx) => saving(ctx, 'tractor'),
  buyExcavator: (ctx) => saving(ctx, 'excavator'),
  buyTruck: (ctx) => saving(ctx, 'truck'),
  earn: (ctx, step) => Math.min(1, ctx.state.stats.totalEarned / step.target),
  firstJob: (ctx, step) => {
    const active = contractsState(ctx).active;
    return Math.min(1, Math.max(careerMetric(ctx, 'cleanTonnes') / step.alternativeTonnes,
      ...active.map((a) => (a.delivered ?? 0) / a.tonnes)));
  },
  yardBuilding: (ctx) => {
    const cheapest = Math.min(...Object.values(ctx.data.buildings).map((b) => dealerPrice(ctx, b.price)));
    return Math.min(1, Math.max(0, ctx.state.money) / cheapest);
  },
  cleanTonnes: (ctx, step) => Math.min(1, careerMetric(ctx, 'cleanTonnes') / step.target),
  goodName: (ctx, step) => Math.min(1,Math.max(reputation(ctx).level / step.target,careerMetric(ctx,'cleanTonnes') / step.alternativeTonnes)),
  usedFleet: (ctx) => { const f = usedFleet(ctx); return (f.digger ? 0.5 : 0) + (f.road ? 0.5 : 0); },
  earnBig: (ctx, step) => Math.min(1, ctx.state.stats.totalEarned / step.target),
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

const checking = new WeakSet();

// Called for every game event. Completes the current step (and any following steps
// that are already satisfied) and pays out rewards.
export function objectivesOnEvent(ctx, type, payload) {
  if (checking.has(ctx) || type === 'objectiveCompleted' || type === 'journeyCompleted') return;
  objectiveState(ctx);
  observeObjectives(ctx,type,payload);
  checking.add(ctx);
  try {
    const steps = ctx.data.objectives.steps;
    const o = ctx.state.objectives;
    while (o && o.index < steps.length) {
      const step = steps[o.index];
      const check = CHECKS[step.id];
      if (!check || !check(ctx, type, payload, step)) break;
      recordObjective(ctx,step);
      o.index += 1;
      if (step.reward) addMoney(ctx, step.reward, 'objective');
      ctx.events.emit('objectiveCompleted', { id: step.id, title: step.title, reward: step.reward, next: steps[o.index] ?? null });
      type = 'objectiveCheck'; // later steps are only re-checked against the game state
    }
    finishJourney(ctx);
  } finally {
    checking.delete(ctx);
  }
}

export function markIntroSeen(ctx) {
  ctx.state.objectives.introSeen = true;
  mentorForStep(ctx, ctx.data.objectives.steps[ctx.state.objectives.index]);
}

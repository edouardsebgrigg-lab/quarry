// Your company's career: milestones to work towards in any order (data/milestones.json), each
// paying a cash reward and some switching on a perk. The counters the milestones need that the
// rest of the game doesn't keep (clean-load streaks, gravel dug, road built, the best day...)
// are kept here, from game events. Sends `milestoneReached` ({ id, title, reward, perk, perkName }).
import { addMoney } from '../economy/index.js';
import { getDate } from '../core/index.js';
import { contractsState, reputation } from '../contracts/index.js';
import { currentWeather } from '../weather/index.js';
import { creditRating } from '../economy/index.js';

const COUNTERS = {
  cleanStreak: 0, bestCleanStreak: 0, cleanLoads: 0, cleanTonnes: 0, gravelDug: 0, roadMetres: 0,
  rainLoads: 0, loansCleared: 0, day: null, dayEarnings: 0, bestDay: 0, hiresDone: 0, regularWeeks: 0,
};

export function careerState(ctx) {
  const c = (ctx.state.career ??= { reached: {}, perks: [], seen: 0 });
  c.reached ??= {};
  c.perks ??= [];
  for (const [k, v] of Object.entries(COUNTERS)) if (!(k in c)) c[k] = v;
  c.seen ??= 0;
  return c;
}

// Milestones reached since you last looked at the Milestones app (for the laptop's badge).
export function unseenMilestones(ctx) {
  const c = careerState(ctx);
  return Math.max(0, Object.keys(c.reached).length - c.seen);
}
export function markMilestonesSeen(ctx) {
  const c = careerState(ctx);
  c.seen = Object.keys(c.reached).length;
}

const round2 = (n) => Math.round(n * 100) / 100;
const today = (ctx) => getDate(ctx.state, ctx.data).day;

// Is this sale a clean load: the right bay and the depot's top grade?
export function isCleanSale(ctx, sale) {
  const top = ctx.data.depot.grades[0];
  return sale.bayId !== ctx.data.depot.mixedProduct && sale.productId === sale.bayId && sale.purity >= top.minPurity - 1e-9;
}

// Every number a milestone can be measured by.
const METRICS = {
  tonnesSold: (ctx) => ctx.state.stats.tonnesSold ?? 0,
  tonnesDug: (ctx) => ctx.state.stats.tonnesDug ?? 0,
  totalEarned: (ctx) => ctx.state.stats.totalEarned ?? 0,
  cleanTonnes: (ctx, c) => c.cleanTonnes,
  cleanLoads: (ctx, c) => c.cleanLoads,
  bestCleanStreak: (ctx, c) => c.bestCleanStreak,
  rainLoads: (ctx, c) => c.rainLoads,
  bestDay: (ctx, c) => c.bestDay,
  gravelDug: (ctx, c) => c.gravelDug,
  worksBuilt: (ctx) => Object.values(ctx.state.stats.works ?? {}).reduce((a, b) => a + b, 0),
  roadMetres: (ctx, c) => c.roadMetres,
  rampsBuilt: (ctx) => ctx.state.stats.works?.ramp ?? 0,
  yardBuildings: (ctx) => Object.values(ctx.state.buildings?.[ctx.state.currentSiteId] ?? {}).filter((x) => x === true).length,
  fleetSize: (ctx) => ctx.state.machines.length,
  usedMachines: (ctx) => ctx.state.machines.filter((m) => m.tier === 'used').length,
  jobsDone: (ctx) => contractsState(ctx).done ?? 0,
  hiresDone: (ctx, c) => c.hiresDone,
  regularWeeks: (ctx, c) => c.regularWeeks,
  creditScore: (ctx) => creditRating(ctx).score,
  staffCount: (ctx) => ctx.state.staff?.workers.length ?? 0,
  reputation: (ctx) => reputation(ctx).level,
  loansCleared: (ctx, c) => c.loansCleared,
};

export const careerMetricNames = () => Object.keys(METRICS);

export function careerMetric(ctx, name) {
  const f = METRICS[name];
  return f ? f(ctx, careerState(ctx)) : 0;
}

// The milestones with where you are on each: { ...def, value, progress (0..1), reached, day }.
export function milestones(ctx) {
  const c = careerState(ctx);
  return (ctx.data.milestones?.list ?? []).map((m) => {
    const value = careerMetric(ctx, m.metric);
    const day = c.reached[m.id] ?? null;
    return { ...m, value, progress: Math.min(1, value / m.target), reached: day !== null, day };
  });
}

let checking = false;

// Pays out any milestones you've now reached.
export function checkMilestones(ctx) {
  if (checking) return [];
  checking = true;
  const done = [];
  try {
    const c = careerState(ctx);
    const perks = ctx.data.milestones?.perks ?? {};
    for (const m of ctx.data.milestones?.list ?? []) {
      if (c.reached[m.id] !== undefined) continue;
      if (careerMetric(ctx, m.metric) < m.target - 1e-9) continue;
      c.reached[m.id] = today(ctx);
      if (m.perk && perks[m.perk] && !c.perks.includes(m.perk)) c.perks.push(m.perk);
      if (m.reward) addMoney(ctx, m.reward, 'milestone');
      const e = { id: m.id, title: m.title, reward: m.reward ?? 0, perk: m.perk ?? null, perkName: m.perk ? perks[m.perk]?.name ?? null : null };
      done.push(e);
      ctx.events.emit('milestoneReached', e);
    }
  } finally {
    checking = false;
  }
  return done;
}

function addEarnings(ctx, c, amount) {
  const day = today(ctx);
  if (c.day !== day) {
    c.day = day;
    c.dayEarnings = 0;
  }
  c.dayEarnings = round2(c.dayEarnings + amount);
  c.bestDay = Math.max(c.bestDay, c.dayEarnings);
}

// Keeps the counters from game events, then checks the milestones.
const QUIET = new Set(['moneyChanged', 'hourPassed', 'milestoneReached', 'marketUpdated']);

export function careerOnEvent(ctx, type, e) {
  const c = careerState(ctx);
  switch (type) {
    case 'productSold':
      if (isCleanSale(ctx, e)) {
        c.cleanStreak += 1;
        c.cleanLoads += 1;
        c.cleanTonnes = round2(c.cleanTonnes + e.tonnes);
        c.bestCleanStreak = Math.max(c.bestCleanStreak, c.cleanStreak);
      } else {
        c.cleanStreak = 0;
      }
      if ((currentWeather(ctx).rain ?? 0) > 0) c.rainLoads += 1;
      addEarnings(ctx, c, e.revenue);
      break;
    case 'contractCompleted':
      addEarnings(ctx, c, e.bonus ?? 0);
      break;
    case 'rockDug':
    case 'shovelDug':
      c.gravelDug = round2(c.gravelDug + (e.materials?.gravel ?? 0));
      break;
    case 'worksBuilt':
      if (e.mode === 'road') c.roadMetres = round2(c.roadMetres + (e.length ?? 0));
      break;
    case 'loanRepaid':
      c.loansCleared += 1;
      break;
    case 'machineReturned':
      c.hiresDone += 1;
      break;
    case 'standingWeekDone':
      c.regularWeeks += 1;
      addEarnings(ctx, c, e.bonus ?? 0);
      break;
    default:
  }
  if (!QUIET.has(type)) checkMilestones(ctx);
}

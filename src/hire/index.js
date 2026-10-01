// Hiring out machines. Now and then a contractor asks to hire a kind of machine you own, for a
// few days at a day rate. Send an idle one and it leaves your yard (while it's away it counts as
// being at another site, so the yard, the map and the inspector leave it out), comes back when the
// hire ends with some wear, and the hire is paid then. A busy, broken or loaded machine can't go,
// nor your last road vehicle. From data/hire.json; its own random numbers.
import { addMoney } from '../economy/index.js';
import { getDate, createRng } from '../core/index.js';
import { getMachine, machineName } from '../machinery/index.js';

export const AWAY = 'hire'; // (the "site" a machine on hire is at)

export function hireState(ctx) {
  ctx.state.hire ??= { enquiry: null, nextId: 1, rngState: (((ctx.state.seed ?? 1) * 1597334677) >>> 0) || 11 };
  return ctx.state.hire;
}

const today = (ctx) => getDate(ctx.state, ctx.data).day;
const roadLegal = (ctx, m) => !!ctx.data.machines.types[m.type]?.roadLegal;
const loaded = (m) => Object.values(m.load ?? {}).some((t) => t > 0.01);

// What a kind of machine hires for a day (from the average of its prices).
export function dayRate(ctx, type) {
  const tiers = Object.values(ctx.data.machines.types[type]?.tiers ?? {});
  if (!tiers.length) return 0;
  const avg = tiers.reduce((t, x) => t + x.price, 0) / tiers.length;
  return Math.round(avg * ctx.data.hire.dayRateOfPrice);
}

// Why a machine can't go out on hire now (null if it can).
export function cantHire(ctx, m) {
  if (m.onHire) return 'It’s already out on hire';
  if (m.broken) return 'It’s broken down';
  if (m.job) return 'It’s busy';
  if (loaded(m)) return 'Empty it first';
  if (roadLegal(ctx, m) && ctx.state.machines.filter((x) => roadLegal(ctx, x) && !x.onHire).length <= 1) {
    return 'You need a road vehicle at home';
  }
  return null;
}

// The machines you could send for the current enquiry.
export function hireCandidates(ctx) {
  const e = hireState(ctx).enquiry;
  if (!e) return [];
  return ctx.state.machines.filter((m) => m.type === e.type && !cantHire(ctx, m));
}

export function machinesOnHire(ctx) {
  return ctx.state.machines.filter((m) => m.onHire);
}

function returnMachine(ctx, m) {
  const h = m.onHire;
  m.onHire = null;
  m.siteId = h.home;
  const wear = ctx.data.hire.wearPerDay * h.days;
  m.condition = Math.max(5, m.condition - wear);
  const total = h.rate * h.days;
  addMoney(ctx, total, 'hire');
  ctx.events.emit('machineReturned', { machineId: m.id, name: machineName(ctx.data, m), client: h.client, total, wear });
}

// Each morning: machines whose hire has ended come home (and are paid for), a stale enquiry goes,
// and maybe a new one comes in for a kind of machine you have.
export function hireDaily(ctx) {
  const cfg = ctx.data.hire;
  if (!cfg) return;
  const h = hireState(ctx);
  const day = today(ctx);
  for (const m of ctx.state.machines) if (m.onHire && day > m.onHire.until) returnMachine(ctx, m);
  if (h.enquiry && h.enquiry.expires < day) h.enquiry = null;
  if (h.enquiry || ctx.state.machines.length < cfg.fromMachines) return;
  const rng = createRng(() => h);
  if (!rng.chance(cfg.chancePerDay)) return;
  const kinds = cfg.types.filter((t) => ctx.state.machines.some((m) => m.type === t && !cantHire(ctx, m)));
  if (!kinds.length) return;
  const type = rng.pick(kinds);
  const days = cfg.days[0] + Math.floor(rng.next() * (cfg.days[1] - cfg.days[0] + 1));
  const rate = dayRate(ctx, type);
  h.enquiry = { id: h.nextId++, client: rng.pick(cfg.clients), type, days, rate, total: rate * days, expires: day + cfg.offerDays - 1 };
  ctx.events.emit('hireEnquiry', { ...h.enquiry, typeName: ctx.data.machines.types[type].name });
}

export function acceptHire(ctx, machineId) {
  const h = hireState(ctx);
  const e = h.enquiry;
  if (!e) return { ok: false, reason: 'That enquiry has gone' };
  const m = getMachine(ctx, machineId);
  if (!m || m.type !== e.type) return { ok: false, reason: `They want a ${ctx.data.machines.types[e.type].name.toLowerCase()}` };
  const why = cantHire(ctx, m);
  if (why) return { ok: false, reason: why };
  const day = today(ctx);
  m.onHire = { client: e.client, days: e.days, rate: e.rate, until: day + e.days - 1, home: m.siteId };
  m.siteId = AWAY;
  h.enquiry = null;
  if (ctx.state.player.selectedMachineId === m.id) ctx.state.player.selectedMachineId = ctx.state.machines.find((x) => !x.onHire)?.id ?? null;
  ctx.events.emit('machineHiredOut', { machineId: m.id, name: machineName(ctx.data, m), client: e.client, days: e.days, total: e.total, until: m.onHire.until });
  return { ok: true, machine: m };
}

export function declineHire(ctx) {
  const h = hireState(ctx);
  if (!h.enquiry) return { ok: false, reason: 'That enquiry has gone' };
  h.enquiry = null;
  return { ok: true };
}

export function hireOnEvent(ctx, type) {
  if (type === 'dayStarted') hireDaily(ctx);
}

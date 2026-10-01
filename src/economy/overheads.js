// Running costs: every week the machines are insured, at a share of what each one cost new.
// A bigger fleet costs more to keep, so selling what you don't use is worth it.
// The cover is your choice (data/economy.json insurance.covers): none, basic or full. Better
// cover costs more each week and pays more of every repair bill. A change of cover takes effect
// when the policy renews (the next weekly charge), so it can't be switched on for one repair.
import { spendMoney } from './money.js';
import { getDate } from '../core/index.js';

export function insuranceState(ctx) {
  const cfg = ctx.data.economy.insurance;
  ctx.state.insurance ??= { cover: cfg.default ?? 'basic', next: null };
  return ctx.state.insurance;
}

// The cover in force now: { id, name, weeklyRate, repairShare, text }.
export function insuranceCover(ctx, id = insuranceState(ctx).cover) {
  const cfg = ctx.data.economy.insurance;
  const c = cfg.covers?.[id];
  return c ? { id, ...c } : { id: 'basic', name: 'Basic', weeklyRate: cfg.weeklyRate, repairShare: 1, text: '' };
}

// What you pay of a repair bill under the cover in force (the insurer pays the rest).
export function repairShare(ctx) {
  return insuranceCover(ctx).repairShare;
}

// Choose the cover from the next renewal (choosing the cover you have cancels a change).
export function setInsuranceCover(ctx, id) {
  if (!ctx.data.economy.insurance.covers?.[id]) return { ok: false, reason: 'No such cover' };
  const s = insuranceState(ctx);
  s.next = id === s.cover ? null : id;
  return { ok: true, from: s.next ? nextRenewal(ctx) : null };
}

// The day the policy next renews (the weekly charge).
export function nextRenewal(ctx) {
  const { day } = getDate(ctx.state, ctx.data);
  const every = ctx.data.economy.insurance.everyDays;
  return day + (every - ((day - 1) % every));
}

export function weeklyInsurance(ctx, coverId) {
  const rate = insuranceCover(ctx, coverId).weeklyRate;
  let total = 0;
  for (const m of ctx.state.machines) if (!m.rental) total += (ctx.data.machines.types[m.type]?.tiers[m.tier]?.price ?? 0) * rate;
  return Math.round(total * 100) / 100;
}

// Each morning: on the first day of a new week, the insurance.
export function overheadsDaily(ctx) {
  const { day } = getDate(ctx.state, ctx.data);
  const every = ctx.data.economy.insurance.everyDays;
  if (day <= 1 || (day - 1) % every !== 0) return 0;
  const s = insuranceState(ctx);
  if (s.next) { // (renewal: the new cover starts now)
    s.cover = s.next;
    s.next = null;
    ctx.events.emit('insuranceRenewed', { cover: s.cover });
  }
  const amount = weeklyInsurance(ctx);
  if (amount <= 0) return 0;
  spendMoney(ctx, amount, 'insurance');
  ctx.events.emit('overheadsCharged', { amount, machines: ctx.state.machines.filter(m => !m.rental).length, day });
  return amount;
}

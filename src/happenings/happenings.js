// Things that happen (data/happenings.json), each a small decision for the player:
//  - the council's site inspector: announced the day before, fines machines that are broken
//    or badly worn, and gives your reputation a lift if every machine is in good order;
//  - a rush order on the jobs board: smaller, due sooner, twice the bonus, open today only;
//  - a dealer's offer: one machine you don't own yet is cheaper for a few days.
// They use their own random numbers, so they change no other luck in the game.
import { createRng, getDate } from '../core/index.js';
import { spendMoney } from '../economy/index.js';
import { contractsState, postRushOrder } from '../contracts/index.js';

export function happeningsState(ctx) {
  ctx.state.happenings ??= { rngState: (((ctx.state.seed ?? 1) * 3266489917) >>> 0) || 11, inspection: null, dealerOffer: null };
  return ctx.state.happenings;
}

const today = (ctx) => getDate(ctx.state, ctx.data).day;
const siteMachines = (ctx) => ctx.state.machines.filter((m) => m.siteId === ctx.state.currentSiteId);

// ---- the inspector

// When the next visit is: { day, hour, announced } or null.
export function nextInspection(ctx) {
  return happeningsState(ctx).inspection;
}

// Which machines would fail an inspection now, and whether all are in good order.
export function inspectionReport(ctx) {
  const cfg = ctx.data.happenings.inspector;
  const ms = siteMachines(ctx);
  const poor = ms.filter((m) => m.broken || m.condition < cfg.badCondition);
  const good = ms.length > 0 && ms.every((m) => !m.broken && m.condition >= cfg.goodCondition);
  return { poor: poor.map((m) => m.id), fine: poor.length * cfg.finePerMachine, good };
}

function scheduleInspection(ctx, rng, from) {
  const cfg = ctx.data.happenings.inspector;
  const [lo, hi] = cfg.everyDays;
  const day = Math.max(cfg.firstDay, from + lo + Math.floor(rng.next() * (hi - lo + 1)));
  happeningsState(ctx).inspection = { day, hour: cfg.hour, announced: false };
}

function inspect(ctx) {
  const cfg = ctx.data.happenings.inspector;
  const h = happeningsState(ctx);
  const r = inspectionReport(ctx);
  let reputationGain = 0;
  if (r.fine > 0) spendMoney(ctx, r.fine, 'fine');
  else if (r.good) {
    const c = contractsState(ctx);
    const before = c.reputation;
    c.reputation = Math.min(ctx.data.contracts.reputation.max, c.reputation + cfg.reputationBonus);
    reputationGain = c.reputation - before;
  }
  h.inspection = null;
  ctx.events.emit('inspection', { poor: r.poor, fine: r.fine, good: r.good && r.fine === 0, reputationGain });
}

// ---- the dealer's offer

// The offer running now: { type, tier, discount, until } or null.
export function dealerOffer(ctx) {
  const o = happeningsState(ctx).dealerOffer;
  return o && o.until >= today(ctx) ? o : null;
}

// A machine's list price after any offer on it.
export function offerPrice(ctx, type, tier, price) {
  const o = dealerOffer(ctx);
  return o && o.type === type && o.tier === tier ? Math.round(price * (1 - o.discount)) : price;
}

function startDealerOffer(ctx, rng) {
  const cfg = ctx.data.happenings.dealerOffer;
  const owned = new Set(ctx.state.machines.map((m) => `${m.type}.${m.tier}`));
  // Something you don't have yet, and not the cheapest things you'd buy anyway.
  const choices = [];
  for (const [type, t] of Object.entries(ctx.data.machines.types)) {
    if (t.shop === false) continue;
    for (const tier of Object.keys(t.tiers)) if (!owned.has(`${type}.${tier}`) && t.tiers[tier].price >= 400) choices.push({ type, tier });
  }
  if (!choices.length) return;
  const pick = rng.pick(choices);
  const offer = { ...pick, discount: cfg.discount, until: today(ctx) + cfg.days - 1 };
  happeningsState(ctx).dealerOffer = offer;
  const price = ctx.data.machines.types[pick.type].tiers[pick.tier].price;
  ctx.events.emit('dealerOffer', { ...offer, price, offerPrice: offerPrice(ctx, pick.type, pick.tier, price), days: cfg.days });
}

// ---- each morning and each hour

export function happeningsDaily(ctx) {
  const data = ctx.data.happenings;
  if (!data) return;
  const h = happeningsState(ctx);
  const rng = createRng(() => h);
  const day = today(ctx);

  // The inspector comes once you have a few machines about.
  if (!h.inspection && ctx.state.machines.length >= data.inspector.minMachines) scheduleInspection(ctx, rng, day);
  if (h.inspection && !h.inspection.announced && day >= h.inspection.day - 1) {
    h.inspection.announced = true;
    ctx.events.emit('inspectionAnnounced', { day: h.inspection.day, hour: h.inspection.hour, ...inspectionReport(ctx), finePerMachine: data.inspector.finePerMachine });
  }

  // The dealer's offer: one at a time.
  if (h.dealerOffer && h.dealerOffer.until < day) {
    ctx.events.emit('dealerOfferEnded', { type: h.dealerOffer.type, tier: h.dealerOffer.tier });
    h.dealerOffer = null;
  }
  if (!h.dealerOffer && day >= data.dealerOffer.firstDay && rng.chance(data.dealerOffer.chancePerDay)) startDealerOffer(ctx, rng);

  // A rush order, once you've shown you can deliver.
  const r = data.rushOrder;
  if ((contractsState(ctx).done ?? 0) >= r.minJobsDone && rng.chance(r.chancePerDay)) postRushOrder(ctx, r);
}

export function happeningsHourly(ctx, { day, hour }) {
  const i = happeningsState(ctx).inspection;
  if (i && (day > i.day || (day === i.day && hour >= i.hour))) inspect(ctx);
}

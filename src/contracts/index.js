// The jobs board: local customers want a set tonnage of one clean material by a deadline, and pay
// a bonus on top of the depot price when the last of it is delivered. Offers turn up each
// morning and go stale after a couple of days; you can have a couple on the go at once. Loads
// only count if they're clean (the depot's top grade) and sold into that material's bay.
// Contracts grow with the business (bigger tonnages once you've earned more).
// Regular customers: once you have a name (reputation 4), a client may offer a standing order:
// so many tonnes of one material every week for a few weeks, paid each week the quota is met,
// with a reputation knock for a week you miss. One at a time; see `standing` in contracts.json.
import { addMoney } from '../economy/index.js';
import { getDate, createRng } from '../core/index.js';
import { basePrice } from '../economy/market.js';

const round1 = (n) => Math.round(n * 10) / 10;

export function contractsState(ctx) {
  // (its own random numbers, so the jobs board doesn't change any other luck in the game)
  ctx.state.contracts ??= { offers: [], active: [], done: 0, failed: 0, nextId: 1, rngState: ((ctx.state.seed ?? 1) * 2654435761) >>> 0 };
  ctx.state.contracts.reputation ??= 0;
  ctx.state.contracts.standing ??= { offer: null, active: null };
  return ctx.state.contracts;
}

const today = (ctx) => getDate(ctx.state, ctx.data).day;

// Reputation (0 to 10): finishing jobs on time builds it, letting one down costs more. It pays:
// bigger bonuses and more offers on the board.
export function reputation(ctx) {
  const r = ctx.data.contracts.reputation;
  const level = Math.max(0, Math.min(r.max, contractsState(ctx).reputation));
  return { level, name: r.names[Math.floor(level)] ?? r.names[r.names.length - 1], bonusBoost: level * r.bonusPerLevel };
}
function offerCount(ctx) {
  const r = ctx.data.contracts.reputation;
  const level = contractsState(ctx).reputation;
  let n = ctx.data.contracts.maxOffers;
  for (const [atLeast, count] of r.offersAt) if (level >= atLeast) n = count;
  return n;
}

function makeOffer(ctx) {
  const cfg = ctx.data.contracts;
  const c = contractsState(ctx);
  const rng = createRng(() => c);
  const bag = Object.entries(cfg.materials).flatMap(([m, v]) => Array(v.weight).fill(m));
  const material = rng.pick(bag);
  const [lo, hi] = cfg.materials[material].tonnes;
  const grow = (ctx.state.stats.totalEarned ?? 0) * cfg.tonnesPerEarned;
  const tonnes = Math.min(cfg.maxTonnes, round1(rng.range(lo, hi) + grow * rng.range(0.6, 1)));
  const days = Math.round(rng.range(cfg.days[0], cfg.days[1]));
  const bonus = Math.round(tonnes * basePrice(ctx.data, material) * (rng.range(cfg.bonusRate[0], cfg.bonusRate[1]) + reputation(ctx).bonusBoost));
  return { id: c.nextId++, client: rng.pick(cfg.clients), material, tonnes, days, bonus, expires: today(ctx) + cfg.offerDays };
}

// A rush order (from data/happenings.json): a normal offer, but smaller, due sooner, with a
// bigger bonus, and only open today. It goes on the board on top of the usual offers.
export function postRushOrder(ctx, { days, bonusMult, tonnesMult }) {
  const c = contractsState(ctx);
  const o = makeOffer(ctx);
  o.tonnes = Math.max(0.5, round1(o.tonnes * tonnesMult));
  o.days = days;
  o.bonus = Math.round(o.bonus * bonusMult);
  o.expires = today(ctx);
  o.rush = true;
  c.offers.unshift(o);
  ctx.events.emit('rushOrder', { id: o.id, client: o.client, material: o.material, tonnes: o.tonnes, days: o.days, bonus: o.bonus });
  return o;
}

// Top the board up to its size, dropping stale offers and failing contracts past their deadline.
export function contractsDaily(ctx) {
  const c = contractsState(ctx);
  const day = today(ctx);
  c.offers = c.offers.filter((o) => o.expires >= day);
  for (const a of [...c.active]) {
    if (day > a.deadline) {
      c.active = c.active.filter((x) => x !== a);
      c.failed += 1;
      c.reputation = Math.max(0, c.reputation - ctx.data.contracts.reputation.perFailure);
      ctx.events.emit('contractFailed', { id: a.id, client: a.client, material: a.material, delivered: a.delivered, tonnes: a.tonnes });
    }
  }
  while (c.offers.length < offerCount(ctx)) c.offers.push(makeOffer(ctx));
  standingDaily(ctx);
}

// ---- regular customers (standing orders)

function standingDaily(ctx) {
  const cfg = ctx.data.contracts.standing;
  if (!cfg) return;
  const c = contractsState(ctx);
  const s = c.standing;
  const day = today(ctx);
  if (s.offer && s.offer.expires < day) s.offer = null;
  const a = s.active;
  if (a && day > a.weekEnd) {
    if (!a.paidThisWeek) {
      a.weeksMissed += 1;
      c.reputation = Math.max(0, c.reputation - cfg.reputationPerMiss);
      ctx.events.emit('standingWeekMissed', { client: a.client, material: a.material, delivered: a.delivered, tonnes: a.tonnesPerWeek });
    }
    if (a.weeksDone + a.weeksMissed >= a.weeks) {
      s.active = null;
      ctx.events.emit('standingEnded', { client: a.client, material: a.material, weeksDone: a.weeksDone, weeks: a.weeks });
    } else {
      a.week += 1;
      a.weekEnd = day + cfg.weekDays - 1;
      a.delivered = 0;
      a.paidThisWeek = false;
    }
  }
  if (s.active || s.offer || c.reputation < cfg.fromReputation) return;
  const rng = createRng(() => c);
  if (!rng.chance(cfg.chancePerDay)) return;
  const o = makeOffer(ctx); // (a client and material, as on the board)
  const tonnesPerWeek = round1(rng.range(cfg.tonnesPerWeek[0], cfg.tonnesPerWeek[1]) + (ctx.state.stats.totalEarned ?? 0) * ctx.data.contracts.tonnesPerEarned * 0.5);
  const weeks = Math.round(rng.range(cfg.weeks[0], cfg.weeks[1]));
  const weeklyBonus = Math.round(tonnesPerWeek * basePrice(ctx.data, o.material) * (cfg.bonusRate + reputation(ctx).bonusBoost));
  s.offer = { client: o.client, material: o.material, tonnesPerWeek, weeks, weeklyBonus, expires: day + cfg.offerDays - 1 };
  ctx.events.emit('standingOffer', { ...s.offer });
}

export function acceptStandingOrder(ctx) {
  const cfg = ctx.data.contracts.standing;
  const s = contractsState(ctx).standing;
  if (!s.offer) return { ok: false, reason: 'That offer has gone' };
  if (s.active) return { ok: false, reason: 'You already have a regular customer' };
  const day = today(ctx);
  s.active = { ...s.offer, week: 1, weekEnd: day + cfg.weekDays - 1, delivered: 0, paidThisWeek: false, weeksDone: 0, weeksMissed: 0 };
  delete s.active.expires;
  s.offer = null;
  ctx.events.emit('standingAccepted', { client: s.active.client, material: s.active.material, tonnesPerWeek: s.active.tonnesPerWeek, weeks: s.active.weeks });
  return { ok: true, order: s.active };
}

export function declineStandingOrder(ctx) {
  const s = contractsState(ctx).standing;
  if (!s.offer) return { ok: false, reason: 'That offer has gone' };
  s.offer = null;
  return { ok: true };
}

// A clean load toward this week's quota; pays the week's bonus the moment the quota is met.
function standingOnSale(ctx, tonnes) {
  const c = contractsState(ctx);
  const a = c.standing.active;
  a.delivered = round1(a.delivered + tonnes);
  ctx.events.emit('standingProgress', { delivered: a.delivered, tonnes: a.tonnesPerWeek });
  if (!a.paidThisWeek && a.delivered + 1e-9 >= a.tonnesPerWeek) {
    a.paidThisWeek = true;
    a.weeksDone += 1;
    c.reputation = Math.min(ctx.data.contracts.reputation.max, c.reputation + ctx.data.contracts.standing.reputationPerWeek);
    addMoney(ctx, a.weeklyBonus, 'contract');
    ctx.events.emit('standingWeekDone', { client: a.client, material: a.material, bonus: a.weeklyBonus, week: a.week, weeks: a.weeks });
  }
}

export function acceptContract(ctx, offerId) {
  const cfg = ctx.data.contracts;
  const c = contractsState(ctx);
  const o = c.offers.find((x) => x.id === offerId);
  if (!o) return { ok: false, reason: 'That offer has gone' };
  if (c.active.length >= cfg.maxActive) return { ok: false, reason: `You can take on ${cfg.maxActive} jobs at a time` };
  c.offers = c.offers.filter((x) => x !== o);
  const job = { ...o, delivered: 0, deadline: today(ctx) + o.days - 1 };
  delete job.expires;
  c.active.push(job);
  ctx.events.emit('contractAccepted', { id: job.id, client: job.client, material: job.material, tonnes: job.tonnes });
  return { ok: true, contract: job };
}

// A clean load sold into a bay counts toward the soonest-due job for that material.
export function contractsOnSale(ctx, sale) {
  // Regional buyers buy for themselves, not for an unrelated depot contract.
  if (sale.buyerId) return;
  const c = contractsState(ctx);
  const clean = sale.purity >= ctx.data.depot.grades[0].minPurity - 1e-9 && sale.productId === sale.bayId;
  if (!clean) return;
  const target = sale.deliveryTarget;
  const job = c.active.filter((a) => a.material === sale.productId && (!target || (target.kind === 'job' && a.id === target.id))).sort((a, b) => a.deadline - b.deadline)[0];
  // (a regular customer's quota still open this week competes by its week's end)
  const st = c.standing.active;
  const standingOpen = st && st.material === sale.productId && !st.paidThisWeek &&
    (!target || (target.kind === 'standing' && st.client === target.client && st.material === target.material));
  if (standingOpen && (!job || st.weekEnd < job.deadline)) {
    standingOnSale(ctx, sale.tonnes);
    return;
  }
  if (!job) return;
  job.delivered = round1(job.delivered + sale.tonnes);
  ctx.events.emit('contractProgress', { id: job.id, delivered: job.delivered, tonnes: job.tonnes });
  if (job.delivered + 1e-9 >= job.tonnes) {
    c.active = c.active.filter((a) => a !== job);
    c.done += 1;
    c.reputation = Math.min(ctx.data.contracts.reputation.max, c.reputation + ctx.data.contracts.reputation.perJob);
    addMoney(ctx, job.bonus, 'contract');
    ctx.events.emit('contractCompleted', { id: job.id, client: job.client, material: job.material, bonus: job.bonus });
  }
}

export function contractsOnEvent(ctx, type, e) {
  if (type === 'dayStarted') contractsDaily(ctx);
  else if (type === 'productSold') contractsOnSale(ctx, e);
}

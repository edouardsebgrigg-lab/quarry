// The jobs board: local customers want a set tonnage of one clean material by a deadline, and pay
// a bonus on top of the depot price when the last of it is delivered. Offers turn up each
// morning and go stale after a couple of days; you can have a couple on the go at once. Loads
// only count if they're clean (the depot's top grade) and sold into that material's bay.
// Contracts grow with the business (bigger tonnages once you've earned more).
import { addMoney } from '../economy/index.js';
import { getDate, createRng } from '../core/index.js';
import { basePrice } from '../economy/market.js';

const round1 = (n) => Math.round(n * 10) / 10;

export function contractsState(ctx) {
  // (its own random numbers, so the jobs board doesn't change any other luck in the game)
  ctx.state.contracts ??= { offers: [], active: [], done: 0, failed: 0, nextId: 1, rngState: ((ctx.state.seed ?? 1) * 2654435761) >>> 0 };
  return ctx.state.contracts;
}

const today = (ctx) => getDate(ctx.state, ctx.data).day;

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
  const bonus = Math.round(tonnes * basePrice(ctx.data, material) * rng.range(cfg.bonusRate[0], cfg.bonusRate[1]));
  return { id: c.nextId++, client: rng.pick(cfg.clients), material, tonnes, days, bonus, expires: today(ctx) + cfg.offerDays };
}

// Top the board up to its size, dropping stale offers and failing contracts past their deadline.
export function contractsDaily(ctx) {
  const cfg = ctx.data.contracts;
  const c = contractsState(ctx);
  const day = today(ctx);
  c.offers = c.offers.filter((o) => o.expires >= day);
  for (const a of [...c.active]) {
    if (day > a.deadline) {
      c.active = c.active.filter((x) => x !== a);
      c.failed += 1;
      ctx.events.emit('contractFailed', { id: a.id, client: a.client, material: a.material, delivered: a.delivered, tonnes: a.tonnes });
    }
  }
  while (c.offers.length < cfg.maxOffers) c.offers.push(makeOffer(ctx));
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
  const c = contractsState(ctx);
  const clean = sale.purity >= ctx.data.depot.grades[0].minPurity - 1e-9 && sale.productId === sale.bayId;
  if (!clean) return;
  const job = c.active.filter((a) => a.material === sale.productId).sort((a, b) => a.deadline - b.deadline)[0];
  if (!job) return;
  job.delivered = round1(job.delivered + sale.tonnes);
  ctx.events.emit('contractProgress', { id: job.id, delivered: job.delivered, tonnes: job.tonnes });
  if (job.delivered + 1e-9 >= job.tonnes) {
    c.active = c.active.filter((a) => a !== job);
    c.done += 1;
    addMoney(ctx, job.bonus, 'contract');
    ctx.events.emit('contractCompleted', { id: job.id, client: job.client, material: job.material, bonus: job.bonus });
  }
}

export function contractsOnEvent(ctx, type, e) {
  if (type === 'dayStarted') contractsDaily(ctx);
  else if (type === 'productSold') contractsOnSale(ctx, e);
}

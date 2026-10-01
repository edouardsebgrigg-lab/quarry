// The classifieds (Wolds Trader): private sellers' second-hand machines, listed for a few days,
// cheaper than the dealer for the condition they claim. Not every seller is honest: the real
// condition can be worse than the advert says. A mechanic's look (a small fee) tells you the
// truth before you buy; buy without one and you get what's there. Listings start once you've
// bought your first machine. From data/classifieds.json, with its own random numbers.
import { getDate, createRng } from '../core/index.js';
import { canAfford, spendMoney } from '../economy/index.js';
import { createMachine, isTierUnlocked, machinePrice } from '../machinery/index.js';

export function classifiedsState(ctx) {
  ctx.state.classifieds ??= { listings: [], nextId: 1, rngState: (((ctx.state.seed ?? 1) * 3266489917) >>> 0) || 13 };
  return ctx.state.classifieds;
}

const today = (ctx) => getDate(ctx.state, ctx.data).day;
const round = (n) => Math.round(n);

// What the dealer would charge for the same machine (for comparison on the listing).
export const dealerPriceFor = (ctx, l) => machinePrice(ctx, l.type, l.tier);

function makeListing(ctx, rng) {
  const cfg = ctx.data.classifieds;
  const kinds = [];
  for (const type of cfg.types) {
    for (const tier of Object.keys(ctx.data.machines.types[type]?.tiers ?? {})) {
      if (isTierUnlocked(ctx, type, tier)) kinds.push([type, tier]);
    }
  }
  if (!kinds.length) return null;
  const [type, tier] = rng.pick(kinds);
  const td = ctx.data.machines.types[type].tiers[tier];
  const top = Math.min(cfg.condition[1], td.startCondition + 4);
  const actual = round(rng.range(cfg.condition[0], top));
  const honest = rng.chance(cfg.honesty);
  const claimed = honest ? actual : Math.min(top, round(actual + rng.range(cfg.overclaim[0], cfg.overclaim[1])));
  // (priced on the claimed condition, against the dealer's machine at its delivered condition)
  const price = round(td.price * (claimed / td.startCondition) ** 0.8 * rng.range(cfg.priceFactor[0], cfg.priceFactor[1]));
  const days = cfg.listingDays[0] + Math.floor(rng.next() * (cfg.listingDays[1] - cfg.listingDays[0] + 1));
  const s = classifiedsState(ctx);
  return {
    id: s.nextId++, type, tier, seller: rng.pick(cfg.sellers), note: rng.pick(cfg.notes[honest ? 'honest' : 'dodgy']),
    claimed, actual, price, listed: today(ctx), expires: today(ctx) + days - 1, inspected: false,
  };
}

// Each morning: old adverts come down, and a few new ones go up (once you've bought a machine).
export function classifiedsDaily(ctx) {
  const cfg = ctx.data.classifieds;
  if (!cfg) return;
  const s = classifiedsState(ctx);
  const day = today(ctx);
  s.listings = s.listings.filter((l) => l.expires >= day);
  if (ctx.state.machines.length < cfg.fromMachines) return;
  const rng = createRng(() => s);
  const n = cfg.newPerDay[0] + Math.floor(rng.next() * (cfg.newPerDay[1] - cfg.newPerDay[0] + 1));
  let added = 0;
  for (let i = 0; i < n && s.listings.length < cfg.maxListings; i++) {
    const l = makeListing(ctx, rng);
    if (!l) break;
    s.listings.push(l);
    added += 1;
  }
  if (added) ctx.events.emit('classifiedsListed', { count: added });
}

// What a listing shows: the seller's claim, or the truth once a mechanic has looked.
export function listingCondition(l) {
  return l.inspected ? l.actual : l.claimed;
}

export function inspectListing(ctx, id) {
  const fee = ctx.data.classifieds.inspectionFee;
  const l = classifiedsState(ctx).listings.find((x) => x.id === id);
  if (!l) return { ok: false, reason: 'That advert has gone' };
  if (l.inspected) return { ok: false, reason: 'Already looked over' };
  if (!canAfford(ctx, fee)) return { ok: false, reason: `A look over costs $${fee}` };
  spendMoney(ctx, fee, 'inspection');
  l.inspected = true;
  ctx.events.emit('listingInspected', { id, claimed: l.claimed, actual: l.actual });
  return { ok: true, actual: l.actual, honest: l.actual >= l.claimed };
}

export function buyListing(ctx, id) {
  const s = classifiedsState(ctx);
  const l = s.listings.find((x) => x.id === id);
  if (!l) return { ok: false, reason: 'That advert has gone' };
  if (!canAfford(ctx, l.price)) return { ok: false, reason: 'You can’t afford it' };
  spendMoney(ctx, l.price, 'machine');
  const machine = createMachine(ctx.state, ctx.data, l.type, l.tier, ctx.state.currentSiteId);
  machine.condition = l.actual;
  s.listings = s.listings.filter((x) => x !== l);
  ctx.events.emit('machineBought', { machineId: machine.id, type: l.type, tier: l.tier, price: l.price, secondHand: true });
  if (!l.inspected && l.actual < l.claimed) {
    ctx.events.emit('listingNotAsDescribed', { machineId: machine.id, seller: l.seller, claimed: l.claimed, actual: l.actual });
  }
  return { ok: true, machine, condition: l.actual };
}

export function classifiedsOnEvent(ctx, type) {
  if (type === 'dayStarted') classifiedsDaily(ctx);
}

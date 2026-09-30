// Local news that moves demand: roadworks want gravel, a housing estate wants sand, a wet week
// stops the landscapers buying topsoil. A story runs for a few days, one per material at a time,
// and while it runs the depot pays more (or less) for that material. Stories come from
// `data/market.json` (news); they use their own random numbers, so they change no other luck.
import { createRng, getDate } from '../core/index.js';

const MAX_LOG = 20;

export function newsState(ctx) {
  ctx.state.news ??= { active: [], log: [], rngState: (((ctx.state.seed ?? 1) * 2246822519) >>> 0) || 7 };
  return ctx.state.news;
}

// The price multiplier the news puts on a material (1 when nothing is happening).
export function newsMultiplier(ctx, productId) {
  let m = 1;
  for (const a of ctx.state.news?.active ?? []) if (a.product === productId) m *= 1 + a.change;
  return m;
}

// Stories running now, soonest to end first, with the days they have left.
export function activeNews(ctx) {
  const day = getDate(ctx.state, ctx.data).day;
  return [...newsState(ctx).active]
    .sort((a, b) => a.until - b.until)
    .map((a) => ({ ...a, daysLeft: a.until - day + 1 }));
}

// Each morning: stories that have run their course end, and maybe a new one breaks.
export function newsDaily(ctx) {
  const cfg = ctx.data.market.news;
  if (!cfg) return null;
  const n = newsState(ctx);
  const day = getDate(ctx.state, ctx.data).day;
  const ended = n.active.filter((a) => a.until < day);
  n.active = n.active.filter((a) => a.until >= day);
  for (const a of ended) ctx.events.emit('marketNewsEnded', { id: a.id, product: a.product });
  const rng = createRng(() => n);
  if (n.active.length >= cfg.maxActive || !rng.chance(cfg.chancePerDay)) return null;
  const busy = new Set(n.active.map((a) => a.product));
  const choices = cfg.stories.filter((s) => !busy.has(s.product) && s.id !== n.log[n.log.length - 1]?.id);
  if (!choices.length) return null;
  const story = rng.pick(choices);
  const days = story.days[0] + Math.floor(rng.next() * (story.days[1] - story.days[0] + 1));
  const item = { id: story.id, product: story.product, change: story.change, from: day, until: day + days - 1, source: story.source, headline: story.headline };
  n.active.push(item);
  n.log.push({ id: item.id, day, product: item.product, change: item.change });
  if (n.log.length > MAX_LOG) n.log.splice(0, n.log.length - MAX_LOG);
  ctx.events.emit('marketNews', { ...item, days });
  return item;
}

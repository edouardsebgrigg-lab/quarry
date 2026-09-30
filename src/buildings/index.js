// Fixed yard facilities: commission existing structures rather than place new footprints.
import { canAfford, spendMoney } from '../economy/money.js';

export function ownsBuilding(ctx, id, siteId = ctx.state.currentSiteId) {
  return ctx.state.buildings?.[siteId]?.[id] === true;
}

export function buildingMultiplier(ctx, id, effect, siteId = ctx.state.currentSiteId) {
  return ownsBuilding(ctx, id, siteId) ? ctx.data.buildings[id][effect] ?? 1 : 1;
}

export function buyBuilding(ctx, id) {
  const cfg = ctx.data.buildings[id];
  if (!cfg) return { ok: false, reason: 'Unknown building' };
  const siteId = ctx.state.currentSiteId;
  if (ctx.data.sites[siteId]?.groundPlot !== 'home') return { ok: false, reason: 'These facilities belong to your home yard' };
  if (ownsBuilding(ctx, id)) return { ok: false, reason: 'Already commissioned at this site' };
  if (!canAfford(ctx, cfg.price)) return { ok: false, reason: 'Not enough money' };
  const sites = (ctx.state.buildings ??= {});
  (sites[siteId] ??= {})[id] = true;
  spendMoney(ctx, cfg.price, `building:${id}`);
  ctx.events.emit('buildingBought', { buildingId: id, siteId, cost: cfg.price });
  return { ok: true, buildingId: id, cost: cfg.price };
}

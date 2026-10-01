// Yard inventory is already-dug material. Transfers never emit productSold or create tonnes.
import { ownsBuilding } from './index.js';
import { pileTotal, addToPile, takeProportional } from '../quarry/index.js';
import { loadCarrier } from '../machinery/trailers.js';

export const stockpileLoad = (ctx, bayId, siteId = ctx.state.currentSiteId) => ctx.state.stockpiles?.[siteId]?.[bayId] ?? {};
export const stockpileConfig = (ctx, bayId) => ctx.data.buildings.stockpiles?.bays.find(b => b.id === bayId);
export function stockpileRoom(ctx, bayId, siteId = ctx.state.currentSiteId, exceptMachine = null) {
  const b = stockpileConfig(ctx, bayId);
  if (!b || !ownsBuilding(ctx, 'stockpiles', siteId)) return 0;
  const reserved = ctx.state.machines.reduce((t, m) => t + (m.id !== exceptMachine && m.siteId === siteId && m.job?.type === 'tip' && m.job.params.stockpileBay === bayId ? pileTotal(loadCarrier(ctx,m)?.load) : 0), 0);
  return Math.max(0, b.capacity - pileTotal(stockpileLoad(ctx, bayId, siteId)) - reserved);
}
export function whyCannotStore(ctx, bayId, tonnes, siteId = ctx.state.currentSiteId, exceptMachine = null) {
  if (!stockpileConfig(ctx, bayId)) return 'Unknown stockpile bay';
  if (!ownsBuilding(ctx, 'stockpiles', siteId)) return 'Commission the stockpile bays in the Yard buildings shop first';
  if (tonnes > stockpileRoom(ctx, bayId, siteId, exceptMachine) + 1e-9) return 'Stockpile bay is full: make room before tipping';
  return null;
}
function changed(ctx, bayId, siteId) {
  const load = stockpileLoad(ctx, bayId, siteId);
  ctx.events.emit('stockpileChanged', { siteId, bayId, tonnes: pileTotal(load), materials: { ...load } });
}
export function storeStockpile(ctx, bayId, load, siteId = ctx.state.currentSiteId, exceptMachine = null) {
  if (Object.entries(load).some(([id,t]) => !ctx.data.ground.materials[id] || !Number.isFinite(t) || t < 0)) return { ok: false, reason: 'Invalid stockpile material' };
  const tonnes = pileTotal(load);
  const reason = whyCannotStore(ctx, bayId, tonnes, siteId, exceptMachine);
  if (reason) return { ok: false, reason };
  ctx.state.stockpiles ??= {};
  const site = ctx.state.stockpiles[siteId] ??= {};
  addToPile(site[bayId] ??= {}, takeProportional(load, tonnes));
  changed(ctx, bayId, siteId);
  return { ok: true, tonnes };
}
// Limit in loose m³, preserving the bay's material proportions and hence purity.
export function scoopStockpile(ctx, bayId, maxVolume, siteId = ctx.state.currentSiteId) {
  if (!Number.isFinite(maxVolume) || maxVolume <= 0 || !stockpileConfig(ctx, bayId) || !ownsBuilding(ctx, 'stockpiles', siteId)) return { tonnes: {}, total: 0, volume: 0 };
  const load = stockpileLoad(ctx, bayId, siteId);
  const volume = Object.entries(load).reduce((v, [id, t]) => v + t / (ctx.data.ground.materials[id].density / ctx.data.ground.materials[id].swell), 0);
  const share = volume > 0 ? Math.min(1, Math.max(0, maxVolume) / volume) : 0;
  const tonnes = takeProportional(load, pileTotal(load) * share);
  const total = pileTotal(tonnes);
  if (total > 0) changed(ctx, bayId, siteId);
  return { tonnes, total, volume: volume * share };
}

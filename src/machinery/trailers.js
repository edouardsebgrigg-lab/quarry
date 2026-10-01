import { getStats, machineKind } from './stats.js';
import { pileTotal } from '../quarry/index.js';
const machine = (ctx, value) => typeof value === 'string' ? ctx.state.machines.find(m => m.id === value) : value;

export function attachedTrailer(ctx, value) {
  const tow = machine(ctx, value);
  return tow?.trailerId ? ctx.state.machines.find(m => m.id === tow.trailerId && m.type === 'trailer' && m.attachedTo === tow.id) ?? null : null;
}
export function loadCarrier(ctx, value) {
  const m = machine(ctx, value);
  return m?.type === 'tractor' ? attachedTrailer(ctx, m) : m ?? null;
}
export const deliveryMachine = loadCarrier;

export function combinationStats(ctx, value) {
  const m = machine(ctx, value);
  if (!m) return {};
  const stats = getStats(ctx.data, m);
  if (m.type !== 'tractor') return stats;
  const trailer = attachedTrailer(ctx, m);
  if (!trailer) return { ...stats, capacity: 0, trailerMass: 0, trailerBraked: false };
  const ts = getStats(ctx.data, trailer);
  // A trailer's nominal payload remains its own. Combination room also respects gross towing.
  const capacity = Math.max(0, Math.min(ts.capacity, ((stats.maxTowMass ?? Infinity) - ts.mass) / 1000));
  return { ...stats, capacity, tipTime: ts.tipTime, trailerMass: ts.mass,
    bedVolume: ts.bedVolume,
    trailerBraked: !!ts.brakes && stats.trailerBraking !== false, trailerModelId: ts.modelId,
    trailerModelScale: ts.modelScale, trailerTier: trailer.tier, trailerStats: ts,
    grossTrailerMass: ts.mass + pileTotal(trailer.load) * 1000,
    overloaded: ts.mass + pileTotal(trailer.load) * 1000 > (stats.maxTowMass ?? Infinity) + .01 };
}

export function cargoVolume(ctx, load) {
  return Object.entries(load ?? {}).reduce((total, [id, tonnes]) => {
    const material = ctx.data.ground.materials[id];
    return total + tonnes / (material ? material.density / material.swell : 1.5);
  }, 0);
}

// Tonnes of an incoming mixture that fit both the bed's volume and its weight limit.
export function cargoRoom(ctx, value, incoming = {}) {
  const owner = machine(ctx, value), carrier = loadCarrier(ctx, owner);
  if (!carrier) return 0;
  const stats = combinationStats(ctx, owner);
  const weightRoom = Math.max(0, (stats.capacity ?? 0) - pileTotal(carrier.load));
  if (!stats.bedVolume || pileTotal(incoming) < 1e-9) return weightRoom;
  const volumeRoom = Math.max(0, stats.bedVolume - cargoVolume(ctx, carrier.load));
  const density = pileTotal(incoming) / Math.max(1e-9, cargoVolume(ctx, incoming));
  return Math.min(weightRoom, volumeRoom * density);
}

export function canDeliver(ctx, value) {
  const m = machine(ctx, value), carrier = loadCarrier(ctx, m);
  return !!m && !!carrier && !!ctx.data.machines.types[m.type]?.roadLegal
    && machineKind(ctx.data, m.type) !== 'trailer' && machineKind(ctx.data, m.type) !== 'transport'
    && getStats(ctx.data, carrier).capacity > 0 && !carrier.broken;
}

export function trailerCompatibility(ctx, tractorValue, trailerValue) {
  const tow = machine(ctx, tractorValue), trailer = machine(ctx, trailerValue);
  if (!tow || tow.type !== 'tractor') return { ok: false, reason: 'Choose a tractor' };
  if (!trailer || machineKind(ctx.data, trailer.type) !== 'trailer') return { ok: false, reason: 'Choose a trailer' };
  const ts = getStats(ctx.data, tow), bs = getStats(ctx.data, trailer);
  const gross = bs.mass + pileTotal(trailer.load) * 1000;
  if (gross > ts.maxTowMass + .01) return { ok: false, reason: `Trailer weighs ${(gross / 1000).toFixed(1)} t; this tractor can tow ${(ts.maxTowMass / 1000).toFixed(1)} t gross` };
  return { ok: true, payload: Math.max(0, Math.min(bs.capacity, (ts.maxTowMass - bs.mass) / 1000)), grossMass: gross };
}

export function attachTrailer(ctx, tractorId, trailerId) {
  const tow = machine(ctx, tractorId), trailer = machine(ctx, trailerId);
  const result = trailerCompatibility(ctx, tow, trailer);
  if (!result.ok) return result;
  if (tow.trailerId) return { ok: false, reason: 'Unhitch the current trailer first' };
  if (trailer.attachedTo) return { ok: false, reason: 'That trailer is already hitched' };
  if (tow.siteId !== trailer.siteId) return { ok: false, reason: 'Bring both to the same site' };
  if (tow.job || tow.operator || tow.away || tow.onHire || trailer.job || trailer.away || trailer.onHire) return { ok: false, reason: 'Finish the current work first' };
  if (tow.broken || trailer.broken) return { ok: false, reason: 'Repair both machines before hitching' };
  const locate = ctx.machinePlacement;
  const a = locate?.(tow.id) ?? ctx.state.positions?.machines?.[tow.id] ?? ctx.state.world?.machines?.[tow.id];
  const b = locate?.(trailer.id) ?? ctx.state.positions?.machines?.[trailer.id] ?? ctx.state.world?.machines?.[trailer.id];
  if (a && b && Math.hypot(a.x - b.x, a.z - b.z) > 10) return { ok: false, reason: 'Drive the tractor within 10 m of the trailer' };
  if (Math.abs(ctx.machineSpeed?.(tow.id) ?? 0) > .5) return { ok: false, reason: 'Stop the tractor before hitching' };
  tow.trailerId = trailer.id;
  trailer.attachedTo = tow.id;
  ctx.events.emit('trailerAttached', { machineId: tow.id, trailerId: trailer.id });
  return { ok: true, ...result };
}

export function detachTrailer(ctx, tractorId) {
  const tow = machine(ctx, tractorId), trailer = attachedTrailer(ctx, tow);
  if (!trailer) return { ok: false, reason: 'No trailer is hitched' };
  if (tow.job || tow.operator || tow.away || tow.onHire || trailer.job) return { ok: false, reason: 'Finish the current work before unhitching' };
  if (Math.abs(ctx.machineSpeed?.(tow.id) ?? 0) > .5) return { ok: false, reason: 'Stop the tractor before unhitching' };
  tow.trailerId = null;
  trailer.attachedTo = null;
  if (ctx.state.depot?.tickets) delete ctx.state.depot.tickets[tow.id];
  ctx.events.emit('trailerDetached', { machineId: tow.id, trailerId: trailer.id });
  return { ok: true, trailer };
}

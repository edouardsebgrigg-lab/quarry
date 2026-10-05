import { groundAt } from '../quarry/land.js';
import { stockpileRoom, stockpileConfig, storeStockpile, scoopStockpile } from '../buildings/index.js';
// Owning machines: create, buy, sell, fit mods.
import { canAfford, spendMoney, addMoney, isInDebt, chargeFuel } from '../economy/index.js';
import { pileTotal, addToPile, takeProportional } from '../quarry/index.js';
import { tierData, typeName, tierName, getStats, isDigger } from './stats.js';
import { applyWear } from './wear.js';
import { dealerPrice } from '../career/index.js';
import { offerPrice } from '../happenings/index.js';
import { loadCarrier, combinationStats, canDeliver, cargoRoom } from './trailers.js';
import { hasBucketLoad } from './digging.js';

export function createMachine(state, data, type, tier, siteId) {
  const td = tierData(data, type, tier);
  if (!td) throw new Error(`Unknown machine ${type}/${tier}`);
  state.counters[type] = (state.counters[type] ?? 0) + 1;
  const machine = {
    id: `m${state.nextMachineId++}`,
    type,
    tier,
    modelId: td.modelId ?? `${type}_${tier}`,
    number: state.counters[type],
    siteId,
    condition: td.startCondition,
    broken: false,
    mods: [],
    job: null,
    load: {}, // material in a digger's bucket or a carrier's bed
    ...(type === 'tractor' ? { trailerId: null } : type === 'trailer' ? { attachedTo: null } : {}),
  };
  state.machines.push(machine);
  return machine;
}

export function getMachine(ctx, id) {
  return ctx.state.machines.find((m) => m.id === id) ?? null;
}

export function machineName(data, m) {
  return `${getStats(data, m).modelName ?? `${tierName(data, m.tier)} ${typeName(data, m.type)}`} #${m.number}`;
}

export function machinesAt(ctx, siteId) {
  return ctx.state.machines.filter((m) => m.siteId === siteId);
}

export function isTierUnlocked(ctx, type, tier) {
  if (!tierData(ctx.data, type, tier)) return false;
  return !!(
    ctx.data.machines.tiers[tier]?.unlocked
    || ctx.state.unlocks[`${type}.${tier}`]
    || ctx.state.flags.unlockAll
  );
}

function notAffordable(ctx) {
  return isInDebt(ctx) ? 'Pay off your debt first' : 'Not enough money';
}

// What the dealer charges for a machine now: the list price, less any offer on it this week,
// less your trade account if you have one.
export function machinePrice(ctx, type, tier) {
  const td = tierData(ctx.data, type, tier);
  return td ? dealerPrice(ctx, offerPrice(ctx, type, tier, td.price)) : Infinity;
}

export function buyMachine(ctx, type, tier) {
  const td = tierData(ctx.data, type, tier);
  if (!td) return { ok: false, reason: 'Unknown machine' };
  if (ctx.data.machines.types[type].shop === false) return { ok: false, reason: 'Not for sale' };
  if (!isTierUnlocked(ctx, type, tier)) return { ok: false, reason: 'Not unlocked yet' };
  const price = machinePrice(ctx, type, tier);
  if (!canAfford(ctx, price)) return { ok: false, reason: notAffordable(ctx) };
  spendMoney(ctx, price, 'machine');
  const machine = createMachine(ctx.state, ctx.data, type, tier, ctx.state.currentSiteId);
  ctx.events.emit('machineBought', { machineId: machine.id, type, tier, price });
  return { ok: true, machine };
}

export function resaleValue(ctx, m) {
  if (m.rental) return 0;
  const price = tierData(ctx.data, m.type, m.tier).price;
  const conditionFactor = 0.4 + 0.6 * (m.condition / 100);
  const brokenFactor = m.broken ? 0.5 : 1;
  return Math.round(price * ctx.data.economy.resaleBase * conditionFactor * brokenFactor);
}

export function sellMachine(ctx, id) {
  const m = getMachine(ctx, id);
  if (!m) return { ok: false, reason: 'No such machine' };
  if (m.rental) return { ok: false, reason: 'Return rented equipment through the hire desk' };
  if (m.attachedTo || m.trailerId) return { ok: false, reason: 'Unhitch the trailer before selling' };
  if (pileTotal(m.load) > 0.001) return { ok: false, reason: 'Empty the machine before selling' };
  if (m.job) return { ok: false, reason: 'Machine is busy' };
  if (m.onHire) return { ok: false, reason: 'It’s out on hire' };
  if (m.operator) return { ok: false, reason: 'Someone’s working it: give them another job first (laptop: Staff)' };
  // Keep one road vehicle, or you'd have no way to get anything to the depot.
  if (canDeliver(ctx, m) && ctx.state.machines.filter(x => !x.rental && !x.onHire && canDeliver(ctx, x)).length <= 1) {
    return { ok: false, reason: 'You need at least one road vehicle to get loads to the depot' };
  }
  const value = resaleValue(ctx, m);
  const name = machineName(ctx.data, m);
  ctx.state.machines = ctx.state.machines.filter((x) => x !== m);
  addMoney(ctx, value, 'machineSale');
  if (ctx.state.player.selectedMachineId === id) {
    ctx.state.player.selectedMachineId = ctx.state.machines[0]?.id ?? null;
  }
  ctx.events.emit('machineSold', { machineId: id, name, value });
  return { ok: true, value };
}

export function modsFor(ctx, m) {
  return Object.entries(ctx.data.mods)
    .filter(([, mod]) => mod.machineType === m.type)
    .map(([id, mod]) => ({ id, ...mod, fitted: m.mods.includes(id) }));
}

export function buyMod(ctx, machineId, modId) {
  const m = getMachine(ctx, machineId);
  const mod = ctx.data.mods[modId];
  if (!m || !mod) return { ok: false, reason: 'Unknown machine or upgrade' };
  if (m.rental) return { ok: false, reason: 'Return rented equipment unchanged' };
  if (mod.machineType !== m.type) return { ok: false, reason: 'Does not fit this machine' };
  if (m.mods.includes(modId)) return { ok: false, reason: 'Already fitted' };
  const price = dealerPrice(ctx, mod.price);
  if (!canAfford(ctx, price)) return { ok: false, reason: notAffordable(ctx) };
  spendMoney(ctx, price, 'mod');
  m.mods.push(modId);
  ctx.events.emit('modBought', { machineId, modId, price });
  return { ok: true };
}

// Empties a digger's bucket into a machine's bed (target { machineId }) or onto the ground
// as a heap (target { x, z }, on your own land). `share` (0..1) pours only part of it (a
// Direct-mode bucket opening slowly). What doesn't fit in a bed stays in the bucket.
// Returns { ok, tonnes } (what came out).
export function dumpBucket(ctx, diggerId, target = {}, share = 1) {
  const ex = getMachine(ctx, diggerId);
  if (!ex || !isDigger(ctx.data, ex.type)) return { ok: false, reason: 'Not a digger' };
  const amount = pileTotal(ex.load) * Math.min(1, Math.max(0, share));
  if (!hasBucketLoad(ex.load)) return { ok: false, reason: 'The bucket is empty' };
  if (amount <= 1e-9) return { ok: true, tonnes: 0 };
  let moved = 0;
  if (target.stockpileBay) {
    if (!stockpileConfig(ctx, target.stockpileBay)) return { ok: false, reason: 'Unknown stockpile bay' };
    moved = Math.min(amount, stockpileRoom(ctx, target.stockpileBay, ex.siteId));
    if (moved <= 1e-9) return { ok: false, reason: 'Stockpile bay is full or not commissioned' };
    const shareLoad = takeProportional(ex.load, moved);
    const r = storeStockpile(ctx, target.stockpileBay, shareLoad, ex.siteId);
    if (!r.ok) return r;
  } else if (target.machineId) {
    const vehicle = getMachine(ctx, target.machineId);
    const bed = loadCarrier(ctx, vehicle);
    const cap = bed ? combinationStats(ctx, vehicle).capacity ?? 0 : 0;
    if (!cap) return { ok: false, reason: 'That has nowhere to put it' };
    if (bed.job) return { ok: false, reason: 'Wait for it to finish' };
    const room = cargoRoom(ctx, vehicle, ex.load);
    if (room <= 1e-9) return { ok: false, reason: `The ${typeName(ctx.data, bed.type).toLowerCase()} is full` };
    moved = Math.min(room, amount);
    if (pileTotal(ex.load) - moved < 0.01 && room >= pileTotal(ex.load) - 1e-9) moved = pileTotal(ex.load); // the last few crumbs go in too
    addToPile(bed.load, takeProportional(ex.load, moved));
  } else {
    const ground=groundAt(ctx,target.x,target.z);
    if (!ground?.workable(target.x, target.z)) return { ok: false, reason: 'You can only dump on your own land' };
    const all = pileTotal(ex.load) - amount < 0.01; // the last few crumbs come out too
    const out = all ? ex.load : takeProportional(ex.load, amount);
    if (all) ex.load = {};
    moved = ground.deposit({ x: target.x, z: target.z, tonnes: out, radius: target.radius ?? 0.7 });
  }
  if (!hasBucketLoad(ex.load)) ex.load = {};
  ctx.events.emit('bucketDumped', { machineId: diggerId, truckId: target.machineId ?? null, tonnes: moved });
  return { ok: true, tonnes: moved };
}

// Direct control: the bucket's teeth are in the ground and moving. Cuts a small bowl at
// { x, z } down to `bottomY` (radius `radius`), but only as much as still fits in the bucket.
// Fuel and wear are charged by the share of a full bucket. Returns { ok, tonnes, full }.
export function bucketCut(ctx, diggerId, { x, z, bottomY, radius, stockpileBay, from, to, attack = 1, moisture = 0, tool = 'bucket' }) {
  const m = getMachine(ctx, diggerId);
  if (!m || !isDigger(ctx.data, m.type)) return { ok: false, reason: 'Not a digger' };
  if (m.broken) return { ok: false, reason: `${machineName(ctx.data, m)} is broken down. Repair it first.` };
  if (m.job && !(m.job.type === 'dig' && m.job.params.physical)) return { ok: false, reason: `${machineName(ctx.data, m)} is busy` };
  const ground=stockpileBay?ctx.ground:groundAt(ctx,x,z);
  if (!stockpileBay && !ground?.workable(x, z)) return { ok: false, reason: 'You can only dig on your own land' };
  const stats = getStats(ctx.data, m);
  const breaking = m.attachment === 'breaker';
  if (breaking && stockpileBay) return {ok:true,tonnes:0,full:false,blocked:true,resistance:0};
  if (breaking && !stockpileBay) {
    const surface = ground.materialResponseAt(x,z,{moisture});
    if (surface.loose || surface.material !== 'rock') return {ok:true,tonnes:0,full:false,blocked:true,resistance:surface.resistance};
  }
  const room = stats.bucketVolume - ground.looseVolume(m.load);
  if (room < 0.002) return { ok: true, tonnes: 0, full: true };
  const r = stockpileBay ? scoopStockpile(ctx, stockpileBay, room * attack, m.siteId)
    : from && to ? ground.cutSweep({ from, to, width: stats.bucketWidth ?? Math.max(0.35, Math.cbrt(stats.bucketVolume)), maxVolume: room, force: stats.breakoutForce ?? 60, attack, moisture, tool: m.attachment === 'breaker' ? 'breaker' : tool })
      : ground.dig({ x, z, radius, bottomY, maxVolume: room });
  if (r.total <= 0) return { ok: true, tonnes: 0, full: false, resistance: r.resistance ?? 0, blocked: !!r.blocked };
  if (breaking) {
    // A hammer leaves rubble on the ground for a bucket to collect; it has no scoop.
    const dx = Math.max(ground.x0+ground.cellSize*2,Math.min(ground.x0+ground.nx*ground.cellSize-ground.cellSize*2,x));
    ground.deposit({x:dx,z,tonnes:r.tonnes,radius:.6});
  } else addToPile(m.load, r.tonnes);
  const share = r.volume / stats.bucketVolume;
  chargeFuel(ctx, stats.fuelPerJob * share, m.siteId);
  if (!stockpileBay) ctx.state.stats.tonnesDug += r.total;
  ctx.events.emit(stockpileBay ? 'stockpileScooped' : 'rockDug', { machineId: m.id, tonnes: r.total, materials: { ...r.tonnes }, x, z, direct: true });
  applyWear(ctx, m, stats, share);
  return { ok: true, tonnes: r.total, full: room - r.volume < 0.002, resistance: r.resistance ?? 0, blocked: !!r.blocked };
}

// Dev helper: every machine back to perfect condition.
export function fixAllMachines(ctx) {
  for (const m of ctx.state.machines) {
    m.condition = 100;
    m.broken = false;
  }
  ctx.events.emit('machinesFixed', {});
}

export function setDiggerAttachment(ctx, machineId, attachment) {
  const m = getMachine(ctx, machineId);
  if (!m || !isDigger(ctx.data, m.type)) return { ok: false, reason: 'Choose a digger' };
  if (m.rental) return { ok: false, reason: 'Return rented equipment unchanged' };
  if (m.job || hasBucketLoad(m.load)) return { ok: false, reason: 'Finish work and empty the bucket before changing attachments' };
  const choices = tierData(ctx.data, m.type, m.tier).attachments ?? ['standard', 'trench', 'grading'];
  if (!choices.includes(attachment)) return { ok: false, reason: 'This attachment does not fit' };
  m.attachment = attachment;
  ctx.events.emit('diggerAttachmentChanged', { machineId, attachment });
  return { ok: true };
}

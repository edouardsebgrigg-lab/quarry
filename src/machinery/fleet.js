// Owning machines: create, buy, sell, fit mods.
import { canAfford, spendMoney, addMoney, isInDebt } from '../economy/index.js';
import {
  pileTotal, addToPile, takeProportional, facePileRoom, addToFacePile,
} from '../quarry/index.js';
import { tierData, typeName, tierName, getStats } from './stats.js';

export function createMachine(state, data, type, tier, siteId) {
  const td = tierData(data, type, tier);
  if (!td) throw new Error(`Unknown machine ${type}/${tier}`);
  state.counters[type] = (state.counters[type] ?? 0) + 1;
  const machine = {
    id: `m${state.nextMachineId++}`,
    type,
    tier,
    number: state.counters[type],
    siteId,
    condition: td.startCondition,
    broken: false,
    mods: [],
    job: null,
    load: {}, // rock in an excavator's bucket or a truck's bed
  };
  state.machines.push(machine);
  return machine;
}

export function getMachine(ctx, id) {
  return ctx.state.machines.find((m) => m.id === id) ?? null;
}

export function machineName(data, m) {
  return `${tierName(data, m.tier)} ${typeName(data, m.type)} #${m.number}`;
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

export function buyMachine(ctx, type, tier) {
  const td = tierData(ctx.data, type, tier);
  if (!td) return { ok: false, reason: 'Unknown machine' };
  if (!isTierUnlocked(ctx, type, tier)) return { ok: false, reason: 'Not unlocked yet' };
  if (!canAfford(ctx, td.price)) return { ok: false, reason: notAffordable(ctx) };
  spendMoney(ctx, td.price, 'machine');
  const machine = createMachine(ctx.state, ctx.data, type, tier, ctx.state.currentSiteId);
  ctx.events.emit('machineBought', { machineId: machine.id, type, tier, price: td.price });
  return { ok: true, machine };
}

export function resaleValue(ctx, m) {
  const price = tierData(ctx.data, m.type, m.tier).price;
  const conditionFactor = 0.4 + 0.6 * (m.condition / 100);
  const brokenFactor = m.broken ? 0.5 : 1;
  return Math.round(price * ctx.data.economy.resaleBase * conditionFactor * brokenFactor);
}

export function sellMachine(ctx, id) {
  const m = getMachine(ctx, id);
  if (!m) return { ok: false, reason: 'No such machine' };
  if (m.job) return { ok: false, reason: 'Machine is busy' };
  const sameType = machinesAt(ctx, m.siteId).filter((x) => x.type === m.type);
  if (sameType.length <= 1) {
    return { ok: false, reason: `You need at least one ${typeName(ctx.data, m.type).toLowerCase()}` };
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
  if (mod.machineType !== m.type) return { ok: false, reason: 'Does not fit this machine' };
  if (m.mods.includes(modId)) return { ok: false, reason: 'Already fitted' };
  if (!canAfford(ctx, mod.price)) return { ok: false, reason: notAffordable(ctx) };
  spendMoney(ctx, mod.price, 'mod');
  m.mods.push(modId);
  ctx.events.emit('modBought', { machineId, modId, price: mod.price });
  return { ok: true };
}

// Empties an excavator's bucket into a truck (if given and it has room),
// otherwise onto the site's face pile. Returns where it went.
export function dumpBucket(ctx, excavatorId, truckId = null) {
  const ex = getMachine(ctx, excavatorId);
  if (!ex || ex.type !== 'excavator') return { ok: false, reason: 'Not an excavator' };
  const amount = pileTotal(ex.load);
  if (amount < 0.01) return { ok: false, reason: 'The bucket is empty' };
  const truck = truckId ? getMachine(ctx, truckId) : null;
  let intoTruck = 0;
  if (truck && truck.type === 'truck') {
    const room = Math.max(0, getStats(ctx.data, truck).capacity - pileTotal(truck.load));
    intoTruck = Math.min(room, amount);
    addToPile(truck.load, takeProportional(ex.load, intoTruck));
  }
  const rest = pileTotal(ex.load);
  let spilled = 0;
  if (rest > 0.001) {
    const fit = Math.min(rest, facePileRoom(ctx, ex.siteId));
    addToFacePile(ctx, ex.siteId, takeProportional(ex.load, fit));
    spilled = rest - fit;
    ex.load = {};
  }
  ctx.events.emit('bucketDumped', { machineId: excavatorId, truckId: intoTruck > 0 ? truckId : null, intoTruck, spilled });
  if (spilled > 0.01) ctx.events.emit('message', { level: 'warn', text: `Face pile full: ${spilled.toFixed(1)} t spilled` });
  return { ok: true, intoTruck, toPile: rest - spilled };
}

// Dev helper: every machine back to perfect condition.
export function fixAllMachines(ctx) {
  for (const m of ctx.state.machines) {
    m.condition = 100;
    m.broken = false;
  }
  ctx.events.emit('machinesFixed', {});
}

// Machine stats: tier numbers from data/machines.json, modified by fitted mods.

export function tierData(data, type, tier) {
  return data.machines.types[type]?.tiers[tier] ?? null;
}

export function typeName(data, type) {
  return data.machines.types[type].name;
}

export function tierName(data, tier) {
  return data.machines.tiers[tier]?.name ?? tier;
}

export function applyMods(data, base, modIds) {
  const stats = { ...base };
  for (const modId of modIds) {
    const mod = data.mods[modId];
    if (!mod) continue;
    for (const [stat, effect] of Object.entries(mod.effects)) {
      if (effect.mul !== undefined) stats[stat] *= effect.mul;
      if (effect.add !== undefined) stats[stat] += effect.add;
    }
  }
  return stats;
}

export function getStats(data, machine) {
  const stats = applyMods(data, tierData(data, machine.type, machine.tier), machine.mods ?? []);
  if (machine.attachment === 'trench') {
    stats.bucketWidth = (stats.bucketWidth ?? .9) * .45;
    stats.bucketVolume *= .55;
  } else if (machine.attachment === 'grading') {
    stats.bucketWidth = (stats.bucketWidth ?? .9) * 1.5;
    stats.breakoutForce = (stats.breakoutForce ?? 55) * .65;
  } else if (machine.attachment === 'breaker') {
    stats.bucketWidth = .2;
    stats.breakoutForce = (stats.breakoutForce ?? 55) * 2;
    stats.tool = 'breaker';
  }
  return stats;
}

// Is this kind of machine allowed on public roads?
export function isRoadLegal(data, type) {
  return !!data.machines.types[type]?.roadLegal;
}

// What a machine does: 'digger' (digs with a bucket) or 'carrier' (carries a load and tips
// or unloads it).
export const machineKind = (data, type) => data.machines.types[type]?.kind ?? null;
export const isDigger = (data, type) => machineKind(data, type) === 'digger';

// Does it carry material in a bed (and tip or unload it)?
export const hasBed = (data, machine) => getStats(data, machine).capacity > 0;

// Seconds to empty a carrier: tipped (a fixed time) or shovelled off by hand (per tonne).
export function unloadSeconds(stats, tonnes) {
  if (stats.unloadPerTonne) return stats.unloadTime + stats.unloadPerTonne * tonnes;
  return stats.tipTime;
}

// Top speed (km/h) of a carrier from its speed stat (the driving physics use the same rule).
export const topSpeedKmh = (stats) => (stats.speed ?? 0) * 1.4 * 3.6;

// Player-facing stat lines, used by the shop and the upgrade card.
export function describeStats(data, type, stats) {
  if (isDigger(data, type)) {
    return [
      { key: 'digRate', label: 'Dig rate', value: (stats.bucketVolume / stats.cycleTime) * 60, unit: 'm³/min', better: 'higher' },
      { key: 'bucketVolume', label: 'Bucket', value: stats.bucketVolume, unit: 'm³', better: 'higher' },
      { key: 'reach', label: 'Reach', value: stats.reach, unit: 'm', better: 'higher' },
      { key: 'breakoutForce', label: 'Digging force', value: stats.breakoutForce ?? 55, unit: 'kN', better: 'higher' },
      { key: 'hydraulicSpeed', label: 'Hydraulics', value: stats.hydraulicSpeed ?? 1, unit: '×', better: 'higher' },
      { key: 'fuelPerJob', label: 'Fuel per bucket', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  if (type === 'tractor') return [
    { key: 'tow', label: 'Gross tow limit', value: stats.maxTowMass / 1000, unit: 't', better: 'higher' },
    { key: 'topSpeed', label: 'Top speed', value: topSpeedKmh(stats), unit: 'km/h', better: 'higher' },
    { key: 'power', label: 'Power', value: stats.enginePower, unit: 'kW', better: 'higher' },
  ];
  if (type === 'trailer') return [
    { key: 'capacity', label: 'Payload', value: stats.capacity, unit: 't', better: 'higher' },
    { key: 'mass', label: 'Empty weight', value: stats.mass / 1000, unit: 't', better: 'lower' },
    { key: 'tipTime', label: 'Tip time', value: stats.tipTime, unit: 's', better: 'lower' },
  ];
  if (machineKind(data, type) === 'transport') return [
    { key: 'topSpeed', label: 'Top speed', value: topSpeedKmh(stats), unit: 'km/h', better: 'higher' },
    { key: 'power', label: 'Power', value: stats.enginePower, unit: 'kW', better: 'higher' },
  ];
  if (machineKind(data, type) === 'carrier') {
    return [
      { key: 'capacity', label: 'Load', value: stats.capacity, unit: 't', better: 'higher' },
      { key: 'topSpeed', label: 'Top speed', value: topSpeedKmh(stats), unit: 'km/h', better: 'higher' },
      { key: 'fuelPerJob', label: 'Fuel per load', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  return [];
}

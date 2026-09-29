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
  return applyMods(data, tierData(data, machine.type, machine.tier), machine.mods);
}

// Is this kind of machine allowed on public roads?
export function isRoadLegal(data, type) {
  return !!data.machines.types[type]?.roadLegal;
}

// Does it carry material in a bed (and tip or unload it)?
export const hasBed = (data, machine) => getStats(data, machine).capacity > 0;

// Player-facing stat lines, used by the shop and the upgrade card.
export function describeStats(type, stats) {
  if (type === 'excavator') {
    return [
      { key: 'digRate', label: 'Dig rate', value: (stats.bucketVolume / stats.cycleTime) * 60, unit: 'm³/min', better: 'higher' },
      { key: 'bucketVolume', label: 'Bucket', value: stats.bucketVolume, unit: 'm³', better: 'higher' },
      { key: 'reach', label: 'Reach', value: stats.reach, unit: 'm', better: 'higher' },
      { key: 'fuelPerJob', label: 'Fuel per bucket', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  if (type === 'truck' || type === 'pickup') {
    return [
      { key: 'capacity', label: 'Load', value: stats.capacity, unit: 't', better: 'higher' },
      { key: 'topSpeed', label: 'Top speed', value: stats.speed * 1.4 * 3.6, unit: 'km/h', better: 'higher' },
      { key: 'fuelPerJob', label: 'Fuel per load', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  return [];
}

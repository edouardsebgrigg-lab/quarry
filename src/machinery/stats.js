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

// Haul timing for a truck on a site. All in seconds.
export function haulTiming(stats, siteData) {
  const drive = siteData.haulDistance / stats.speed;
  const total = stats.loadTime + 2 * drive;
  return {
    total,
    loadEnd: (0.6 * stats.loadTime) / total,
    arriveYard: (0.6 * stats.loadTime + drive) / total,
    unloadEnd: (stats.loadTime + drive) / total,
  };
}

// Player-facing stat lines, used by the shop and the upgrade card.
export function describeStats(type, stats, siteData) {
  if (type === 'excavator') {
    return [
      { key: 'digRate', label: 'Dig rate', value: (stats.bucket / stats.cycleTime) * 60, unit: 't/min', better: 'higher' },
      { key: 'bucket', label: 'Bucket', value: stats.bucket, unit: 't', better: 'higher' },
      { key: 'maxHardness', label: 'Max rock hardness', value: stats.maxHardness, unit: '', better: 'higher' },
      { key: 'fuelPerJob', label: 'Fuel per scoop', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  if (type === 'truck') {
    const trip = haulTiming(stats, siteData).total;
    return [
      { key: 'haulRate', label: 'Haul rate', value: (stats.capacity / trip) * 60, unit: 't/min', better: 'higher' },
      { key: 'capacity', label: 'Load', value: stats.capacity, unit: 't', better: 'higher' },
      { key: 'tripTime', label: 'Round trip', value: trip, unit: 's', better: 'lower' },
      { key: 'fuelPerJob', label: 'Fuel per trip', value: stats.fuelPerJob, unit: 'L', better: 'lower' },
    ];
  }
  return [];
}

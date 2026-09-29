// Wear and breakdowns. Each job lowers condition; lower condition means a
// higher chance of breaking down at the end of a job.

export function breakdownChance(stats, condition) {
  const worn = 1 - Math.max(0, Math.min(100, condition)) / 100;
  return stats.breakdownBase + stats.breakdownWear * worn * worn;
}

// `share` is how much of a whole job this was (a Direct-mode digger wears a little with
// every bite, adding up to one job per bucketful).
export function applyWear(ctx, machine, stats, share = 1) {
  machine.condition = Math.max(0, machine.condition - stats.wearPerJob * share);
  const breaks = machine.condition <= 0 || ctx.rng.chance(breakdownChance(stats, machine.condition) * share);
  if (breaks) {
    machine.broken = true;
    ctx.events.emit('machineBrokeDown', { machineId: machine.id });
  }
  return breaks;
}

export function serviceCost(stats, machine) {
  return (100 - machine.condition) * stats.serviceCostPerPoint;
}

// Wear and breakdowns. Each job lowers condition; lower condition means a
// higher chance of breaking down at the end of a job.

export function breakdownChance(stats, condition) {
  const worn = 1 - Math.max(0, Math.min(100, condition)) / 100;
  return stats.breakdownBase + stats.breakdownWear * worn * worn;
}

export function applyWear(ctx, machine, stats) {
  machine.condition = Math.max(0, machine.condition - stats.wearPerJob);
  const breaks = machine.condition <= 0 || ctx.rng.chance(breakdownChance(stats, machine.condition));
  if (breaks) {
    machine.broken = true;
    ctx.events.emit('machineBrokeDown', { machineId: machine.id });
  }
  return breaks;
}

export function serviceCost(stats, machine) {
  return (100 - machine.condition) * stats.serviceCostPerPoint;
}

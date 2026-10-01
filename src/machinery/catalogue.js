// Model identity is independent from an owned machine's condition and fitted attachments.
export function modelDescriptor(data, machine) {
  const spec = data.machines.types[machine.type]?.tiers[machine.tier] ?? {};
  return { ...spec, modelId: machine.modelId ?? spec.modelId ?? `${machine.type}_${machine.tier}`, modelFamily: spec.modelFamily ?? machine.type };
}

export function catalogueModels(data, kind) {
  return Object.entries(data.machines.types).flatMap(([type, config]) =>
    config.shop === false || (kind && config.kind !== kind) ? [] : Object.entries(config.tiers)
      .filter(([, stats]) => !stats.legacy)
      .map(([tier, stats]) => ({ type, tier, kind: config.kind, name: stats.modelName ?? config.name, ...stats })));
}

// Idempotent upgrade: old tractor/trailer bundles retain their load, wear, placement and ticket.
// A null trailerId means deliberately unhitched and must never recreate the old bundle.
export function migrateFleet(state) {
  state.machines ??= [];
  state.counters ??= {};
  state.nextMachineId ??= 1;
  const ids = new Set(state.machines.map(m => m.id));
  for (const m of [...state.machines]) {
    m.modelId ??= `${m.type}_${m.tier}`;
    if (m.type !== 'tractor') continue;
    const existingTrailer = state.machines.find(t => t.id === m.trailerId && t.type === 'trailer');
    if (existingTrailer && m.mods?.includes('sideboards')) {
      existingTrailer.mods ??= [];
      if (!existingTrailer.mods.includes('sideboards')) existingTrailer.mods.push('sideboards');
      m.mods = m.mods.filter(id => id !== 'sideboards');
    }
    if (Object.hasOwn(m, 'trailerId')) continue;
    if (!['rusty', 'used'].includes(m.tier)) { m.trailerId = null; continue; }
    let id;
    do { id = `m${state.nextMachineId++}`; } while (ids.has(id));
    ids.add(id);
    const number = state.counters.trailer = (state.counters.trailer ?? 0) + 1;
    const trailer = { id, type: 'trailer', tier: m.tier, modelId: `trailer_${m.tier}`, number, siteId: m.siteId,
      condition: m.condition, broken: false, mods: (m.mods ?? []).filter(id => id === 'sideboards'), job: null, load: { ...m.load }, attachedTo: m.id };
    state.machines.push(trailer);
    m.trailerId = id;
    m.mods = (m.mods ?? []).filter(id => id !== 'sideboards');
    m.load = {};
    const saved = state.positions ?? state.world;
    const pose = saved?.machines?.[m.id];
    if (pose) saved.machines[id] = { x: pose.x - Math.cos(pose.yaw ?? 0) * 4.62,
      z: pose.z + Math.sin(pose.yaw ?? 0) * 4.62, yaw: pose.trailerYaw ?? pose.yaw ?? 0 };
    // Tickets remain identified by the driven tractor, with the trailer recorded as load owner.
    if (state.depot?.tickets?.[m.id]) state.depot.tickets[m.id].carrierId = id;
  }
  return state;
}

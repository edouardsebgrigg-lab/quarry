// Save migrations: migrations[n] turns a version-n save state into version n + 1.
// Bump data/game.json "saveVersion" and add an entry here whenever the state shape changes.
export const migrations = {
  // v6: clock rates are explicit. createGame rebases this legacy rate to today's
  // balance while preserving day/hour, active orders, staff and finance deadlines.
  5: (state) => ({ ...state, time: { ...state.time, ticksPerDay: state.time.ticksPerDay ?? 1200 } }),
  // v2: machines carry rock (excavator bucket / truck bed).
  1: (state) => ({
    ...state,
    machines: state.machines.map((m) => ({ ...m, load: m.load ?? {} })),
  }),
  // v3: the getting-started goals. Older saves are past the tutorial.
  2: (state) => ({ ...state, objectives: state.objectives ?? { index: 999, introSeen: true } }),
  // v4: hand tools (shovel and wheelbarrow), topsoil and clay on the market, and hand-digging
  // goals before the machine ones (a save part-way through the old goals keeps its place).
  3: (state) => {
    const oldSteps = ['buyExcavator', 'buyTruck', 'firstScoop', 'loadTruck', 'tip', 'sell', 'firstMod', 'earn', 'usedMachine'];
    const newSteps = ['firstShovel', 'fillBarrow', 'tipBarrow', 'firstSale', ...oldSteps];
    const products = { ...state.market.products };
    for (const id of ['topsoil', 'clay']) {
      products[id] ??= { trend: 1, velocity: 0, saturation: 0, history: [] };
    }
    const o = state.objectives;
    const index = o.index < oldSteps.length ? newSteps.indexOf(oldSteps[o.index]) : o.index;
    return {
      ...state,
      tools: state.tools ?? { shovel: { load: {} }, barrow: { load: {} } },
      market: { ...state.market, products },
      objectives: { ...o, index },
    };
  },
  // v5: the countryside map, with the field, the village and the depot. Everything about the old
  // gravel pit (its pits, face pile and yard) is gone, so older saves can't carry on.
  4: () => {
    throw new Error('This save is from before the new map (the old gravel pit) and can\'t be loaded any more. Please start a new game.');
  },
};

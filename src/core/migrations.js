// Save migrations: migrations[n] turns a version-n save state into version n + 1.
// Bump data/game.json "saveVersion" and add an entry here whenever the state shape changes.
export const migrations = {
  // v2: machines carry rock (excavator bucket / truck bed).
  1: (state) => ({
    ...state,
    machines: state.machines.map((m) => ({ ...m, load: m.load ?? {} })),
  }),
  // v3: the getting-started goals. Older saves are past the tutorial.
  2: (state) => ({ ...state, objectives: state.objectives ?? { index: 999, introSeen: true } }),
};

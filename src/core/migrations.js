// Save migrations: migrations[n] turns a version-n save state into version n + 1.
// Bump data/game.json "saveVersion" and add an entry here whenever the state shape changes.
export const migrations = {
  // v2: machines carry rock (excavator bucket / truck bed).
  1: (state) => ({
    ...state,
    machines: state.machines.map((m) => ({ ...m, load: m.load ?? {} })),
  }),
};

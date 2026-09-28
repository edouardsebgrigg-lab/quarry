// Seeded random numbers (mulberry32). The seed lives in the game state
// (state.rngState) so saving and loading keeps the sequence repeatable.

export function createRng(getState) {
  function next() {
    const s = getState();
    let t = (s.rngState = (s.rngState + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    // Normal distribution (mean 0, std dev 1).
    gauss() {
      const u = Math.max(next(), 1e-12);
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}

import { describe, it, expect } from 'vitest';
import { findBasins, waterLevel } from './basins.js';

// A flat 20 × 20 patch at height 0 with a pit dug in it (1 m deep in the middle, 0.5 m round it)
// and a trench that runs off the edge.
function ground() {
  const nx = 20, nz = 20;
  const height = (i, j) => {
    if (i >= 8 && i <= 11 && j >= 8 && j <= 11) return i >= 9 && i <= 10 && j >= 9 && j <= 10 ? -1 : -0.5;
    if (j === 3 && i <= 6) return -0.4; // (the trench: open at i = 0, the patch's edge)
    return 0;
  };
  return { nx, nz, height, ...findBasins(height, nx, nz) };
}

describe('where rainwater stands', () => {
  it('fills a pit up to its rim, with the floor at its lowest point', () => {
    const g = ground();
    const k = 9 * g.nx + 9;
    expect(g.spill[k]).toBeCloseTo(0);
    expect(g.floor[k]).toBeCloseTo(-1);
    // (the shallow ledge is part of the same hollow: same floor)
    expect(g.floor[8 * g.nx + 8]).toBeCloseTo(-1);
  });

  it('a trench open to the edge drains, and so does level ground', () => {
    const g = ground();
    expect(g.spill[3 * g.nx + 3]).toBeCloseTo(-0.4);
    expect(waterLevel(g.spill[3 * g.nx + 3], g.floor[3 * g.nx + 3], 0.5)).toBe(null);
    expect(waterLevel(g.spill[15 * g.nx + 15], g.floor[15 * g.nx + 15], 0.5)).toBe(null);
  });

  it('a shower leaves a puddle in the bottom; a wet week fills it to the rim and no higher', () => {
    const g = ground();
    const k = 9 * g.nx + 9;
    expect(waterLevel(g.spill[k], g.floor[k], 0.2)).toBeCloseTo(-0.8);
    expect(waterLevel(g.spill[k], g.floor[k], 3)).toBeCloseTo(0);
    expect(waterLevel(g.spill[k], g.floor[k], 0)).toBe(null);
  });

  it('copes with a whole field quickly', () => {
    const t0 = performance.now();
    const n = 304;
    const b = findBasins((i, j) => Math.sin(i * 0.21) * Math.cos(j * 0.17) * 0.3, n, n);
    expect(b.spill.length).toBe(n * n);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

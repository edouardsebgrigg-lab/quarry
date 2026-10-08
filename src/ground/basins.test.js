import { describe, it, expect } from 'vitest';
import { findBasins, basinSteps, waterLevel } from './basins.js';

// A flat 20 × 20 patch at height 0 with a pit dug in it (1 m deep in the middle, 0.5 m round it)
// and a trench that runs off the edge.
function ground(options) {
  const nx = 20, nz = 20;
  const height = (i, j) => {
    if (i >= 8 && i <= 11 && j >= 8 && j <= 11) return i >= 9 && i <= 10 && j >= 9 && j <= 10 ? -1 : -0.5;
    if (j === 3 && i <= 6) return -0.4; // (the trench: open at i = 0, the patch's edge)
    return 0;
  };
  return { nx, nz, height, ...findBasins(height, nx, nz, options) };
}
const level = (g, i, j, share = 1) => waterLevel(g.floor[j * g.nx + i], g.rise[j * g.nx + i], share);

describe('where rainwater stands', () => {
  it('a pit fills from its lowest point, and never above its rim', () => {
    // (the 4 deep cells take 4 × 0.1 m of water... from all 16 cells: 1.6 m over one cell)
    const g = ground({ rain: 0.1 });
    expect(g.spill[9 * g.nx + 9]).toBeCloseTo(0);
    expect(g.floor[9 * g.nx + 9]).toBeCloseTo(-1);
    expect(g.floor[8 * g.nx + 8]).toBeCloseTo(-1); // (the shallow ledge is part of the same hollow)
    expect(level(g, 9, 9)).toBeCloseTo(-0.6); // (1.6 m over the 4 deep cells: 0.4 m deep)
    expect(level(g, 8, 8)).toBeCloseTo(-0.6); // (the same level, though the ledge stands dry)
    expect(level(ground({ rain: 10 }), 9, 9)).toBeCloseTo(0);
  });

  it('rises with the rain', () => {
    const g = ground({ rain: 0.1 });
    expect(level(g, 9, 9, 0.5)).toBeCloseTo(-0.8);
    expect(level(g, 9, 9, 0)).toBe(null);
  });

  it('a trench open to the edge drains, and so does level ground', () => {
    const g = ground({ rain: 1 });
    expect(g.spill[3 * g.nx + 3]).toBeCloseTo(-0.4);
    expect(level(g, 3, 3)).toBe(null);
    expect(level(g, 15, 15)).toBe(null);
  });

  it('a dug pit keeps the rain; a dip in whole turf soaks most of it up', () => {
    // (the pit is dug ground; a natural dip of the same shape at j = 15 is still turf)
    const nx = 20, nz = 24;
    const height = (i, j) => (i >= 8 && i <= 11 && ((j >= 4 && j <= 7) || (j >= 15 && j <= 18)) ? -1 : 0);
    const holds = (i, j) => (j < 12 && height(i, j) < 0 ? 1 : 0.15);
    const b = findBasins(height, nx, nz, { holds, rain: 0.5 });
    expect(b.rise[5 * nx + 9]).toBeCloseTo(0.5);
    expect(b.rise[16 * nx + 9]).toBeCloseTo(0.075);
  });

  it('a pit dug in a gentle dip fills before the dip around it', () => {
    // (a 10 cm dip, 12 cells across, all turf, with a 1 m pit of 2 × 2 dug cells in its middle)
    const nx = 20, nz = 20;
    const dip = (i, j) => i >= 4 && i <= 15 && j >= 4 && j <= 15;
    const pit = (i, j) => i >= 9 && i <= 10 && j >= 9 && j <= 10;
    const height = (i, j) => (pit(i, j) ? -1.1 : dip(i, j) ? -0.1 : 0);
    const holds = (i, j) => (pit(i, j) ? 1 : 0.15);
    const b = findBasins(height, nx, nz, { holds, rain: 0.3 });
    const k = 9 * nx + 9;
    // (water: 4 × 0.3 + 140 × 0.045 = 7.5 m over one cell, into 4 pit cells: 1.875 m, so it
    // brims over the pit and spreads a little into the dip)
    expect(b.floor[k]).toBeCloseTo(-1.1);
    expect(waterLevel(b.floor[k], b.rise[k], 1)).toBeGreaterThan(-0.1);
    expect(waterLevel(b.floor[k], b.rise[k], 1)).toBeLessThan(-0.05);
    // (in a lighter shower the water stays down in the pit)
    expect(waterLevel(b.floor[k], b.rise[k], 0.3)).toBeLessThan(-0.5);
  });

  it('can be worked out a little at a time, on a copy of the heights', () => {
    const n = 120;
    const heights = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = Math.sin(i * 0.3) * Math.cos(j * 0.23);
    const whole = findBasins(heights, n, n, { rain: 0.2 });
    const steps = basinSteps(heights, n, n, { rain: 0.2 });
    let pauses = 0;
    let r = steps.next();
    heights.fill(5); // (the ground changing meanwhile doesn't upset the sum under way)
    while (!r.done) {
      pauses += 1;
      r = steps.next();
    }
    expect(pauses).toBeGreaterThan(3);
    expect(r.value.spill).toEqual(whole.spill);
    expect(r.value.floor).toEqual(whole.floor);
    expect(r.value.rise).toEqual(whole.rise);
  });

  it('copes with a whole field quickly', () => {
    const t0 = performance.now();
    const n = 304;
    const b = findBasins((i, j) => Math.sin(i * 0.21) * Math.cos(j * 0.17) * 0.3, n, n, { rain: 0.5 });
    expect(b.spill.length).toBe(n * n);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

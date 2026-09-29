import { describe, it, expect } from 'vitest';
import { loadData } from '../core/index.js';
import { createGround } from './ground.js';

const data = loadData();
const make = () => createGround(data.ground, 'home', { x0: 0, z0: 0, seed: 7 });
const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
const settleAll = (g) => {
  let guard = 0;
  while (g.busy() && guard++ < 5000) g.settle(20000);
  return guard;
};

describe('ground', () => {
  it('starts as a gently rolling field with topsoil on top', () => {
    const g = make();
    for (const [x, z] of [[10, 10], [75, 75], [140, 30]]) {
      expect(Math.abs(g.heightAt(x, z))).toBeLessThan(0.5);
      expect(g.surfaceAt(x, z)).toBe('topsoil');
    }
  });

  it('digs the layers from the top down and keeps every tonne', () => {
    const g = make();
    const before = sum(g.totals());
    const shallow = g.dig({ x: 50, z: 50, radius: 1, bottomY: g.heightAt(50, 50) - 0.15 });
    expect(Object.keys(shallow.tonnes)).toEqual(['topsoil']);
    const deep = g.dig({ x: 50, z: 50, radius: 1.2, bottomY: g.heightAt(50, 50) - 2.5 });
    expect(deep.tonnes.clay ?? 0).toBeGreaterThan(0);
    expect(deep.tonnes.sand ?? 0).toBeGreaterThan(0);
    expect(sum(g.totals()) + shallow.total + deep.total).toBeCloseTo(before, 1);
  });

  it('never digs more than the bucket holds', () => {
    const g = make();
    const r = g.dig({ x: 30, z: 30, radius: 0.8, bottomY: -3, maxTonnes: 0.25 });
    expect(r.total).toBeLessThanOrEqual(0.2501);
    expect(r.total).toBeGreaterThan(0.2);
  });

  it('dumped material keeps its weight and settles into a cone at its natural slope', () => {
    const g = make();
    const before = sum(g.totals());
    const base = g.heightAt(80, 80);
    g.deposit({ x: 80, z: 80, tonnes: { gravel: 6 }, radius: 0.5 });
    expect(sum(g.totals())).toBeCloseTo(before + 6, 2);
    settleAll(g);
    expect(sum(g.totals())).toBeCloseTo(before + 6, 2);
    const top = g.heightAt(80, 80) - base;
    expect(top).toBeGreaterThan(0.4); // a real heap, not a smear
    // No slope on the heap steeper than gravel can stand (35°), give or take a cell.
    const tan = Math.tan((35 * Math.PI) / 180);
    for (let d = 0.5; d < 3; d += 0.5) {
      const drop = g.heightAt(80 + d, 80) - g.heightAt(80 + d + 0.5, 80);
      expect(drop).toBeLessThan(tan * 0.5 + 0.08);
    }
    expect(g.surfaceAt(80, 80)).toBe('gravel');
  });

  it('undercut walls cave in, keeping every tonne', () => {
    const g = make();
    const before = sum(g.totals());
    let dug = 0;
    // A narrow, deep hole: its sandy walls can't stand vertical.
    for (let k = 0; k < 12; k++) dug += g.dig({ x: 60, z: 60, radius: 0.5, bottomY: g.heightAt(60, 60) - 0.6 }).total;
    settleAll(g);
    expect(sum(g.totals()) + dug).toBeCloseTo(before, 1);
    const hole = g.heightAt(60, 60);
    const rim = g.heightAt(62, 60);
    expect(rim - hole).toBeLessThan(2 * Math.tan((70 * Math.PI) / 180) + 0.5);
  });

  it('saves only what changed and loads back the same ground', () => {
    const g = make();
    g.dig({ x: 20, z: 20, radius: 1, bottomY: -1 });
    g.deposit({ x: 25, z: 20, tonnes: { topsoil: 1.2, clay: 0.4 } });
    settleAll(g);
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    expect(Object.keys(saved.chunks).length).toBeLessThan(5);
    const h = make();
    h.load(saved);
    for (const [x, z] of [[20, 20], [25, 20], [22, 21], [100, 100]]) expect(h.heightAt(x, z)).toBeCloseTo(g.heightAt(x, z), 2);
    expect(h.surfaceAt(25, 20)).toBe(g.surfaceAt(25, 20));
  });
});

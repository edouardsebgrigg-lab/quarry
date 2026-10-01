import { describe, it, expect } from 'vitest';
import { loadData } from '../core/index.js';
import { createGround } from './ground.js';

const data = loadData();
const make = () => createGround(data.ground, 'home', { x0: 0, z0: 0, seed: 7 });
const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
const total = (g) => sum(g.totals());
const strip = (o = {}) => ({ ax: 40, az: 60, bx: 60, bz: 60, width: 4, mode: 'road', surface: 'gravel', surfaceThickness: 0.12, maxGrade: 0.12, sourceRadius: 30, ...o });
// Heaps of gravel to build with, made the way a player makes them (tipped on the field).
const heap = (g, x, z, tonnes = 30) => { g.deposit({ x, z, tonnes: { gravel: tonnes }, radius: 2.5 }); };
// Total height over a patch (the heap's volume, roughly): it drops when material is taken from it.
const patch = (g, cx, cz, r = 5) => { let t = 0; for (let x = cx - r; x <= cx + r; x += 0.5) for (let z = cz - r; z <= cz + r; z += 0.5) t += g.heightAt(x, z); return t; };
const settleAll = (g) => { let n = 0; while (g.busy() && n++ < 3000) g.settle(20000); };

describe('earthworks: planning', () => {
  it('a plan changes nothing', () => {
    const g = make();
    heap(g, 50, 82);
    const t = total(g);
    const h = g.heightAt(50, 60);
    const plan = g.planWorks(strip());
    expect(plan.length).toBeCloseTo(20);
    expect(g.heightAt(50, 60)).toBe(h);
    expect(total(g)).toBe(t);
  });

  it('reports the surface gravel and the fill it needs from heaps, and says when there is not enough', () => {
    const g = make();
    const plan = g.planWorks(strip());
    expect(plan.ok).toBe(false);
    expect(plan.reason).toBe('gravel');
    expect(plan.heapGravelNeeded).toBeGreaterThan(5); // 20 x 4 m x 0.12 m of loose gravel is about 10 m³
    heap(g, 50, 82, 60);
    expect(g.planWorks(strip()).ok).toBe(true);
  });

  it('refuses a slope steeper than the limit, the edge of the land, and rock', () => {
    const g = make();
    heap(g, 50, 82);
    g.dig({ x: 60, z: 60, radius: 3, bottomY: g.heightAt(60, 60) - 1.2 }); // a hollow at the far end
    expect(g.planWorks(strip({ maxGrade: 0.05 })).reason).toBe('steep');
    expect(g.planWorks(strip({ ax: 2, az: 60, bx: 20, bz: 60 })).reason).toMatch(/edge/);
    expect(g.planWorks(strip({ ax: 40, az: 60, bx: 60, bz: 60, mode: 'level', width: 30 })).reason).toBeTruthy();
  });
});

describe('earthworks: building', () => {
  it('builds a gravel road to the planned surface and never creates or loses a tonne', () => {
    const g = make();
    heap(g, 50, 80, 60);
    const before = total(g);
    const plan = g.planWorks(strip());
    expect(plan.ok).toBe(true);
    const built = g.buildWorks(strip());
    expect(built.ok).toBe(true);
    expect(total(g)).toBeCloseTo(before, 4);
    // the surface follows the plan along the strip, and it is gravel
    for (const u of [0.1, 0.5, 0.9]) {
      const x = 40 + 20 * u;
      const want = plan.pA + (plan.pB - plan.pA) * u;
      expect(g.heightAt(x, 60)).toBeCloseTo(want, 1);
      expect(g.surfaceAt(x, 60)).toBe('gravel');
    }
    expect(g.cellBuilt(Math.floor(50 / g.cellSize), Math.floor(60 / g.cellSize))).toBe(true);
  });

  it('takes what it needs from a heap within reach, and heaps the leftover cut beside the road, not lost', () => {
    const g = make();
    heap(g, 50, 82, 60);
    const heapBefore = patch(g, 50, 82);
    const before = total(g);
    const plan = g.planWorks(strip());
    expect(plan.heapGravelNeeded).toBeGreaterThan(0);
    const built = g.buildWorks(strip());
    expect(built.ok).toBe(true);
    expect(patch(g, 50, 82)).toBeLessThan(heapBefore - 0.5); // the heap was used
    expect(built.spoilTonnes).toBeGreaterThan(0); // leftover cut, heaped beside the road
    settleAll(g);
    expect(total(g)).toBeCloseTo(before, 4);
  });

  it('a ramp climbs out of a pit and holds its shape (no slumping) after settling', () => {
    const g = make();
    g.dig({ x: 80, z: 60, radius: 5, bottomY: g.heightAt(80, 60) - 1.4 }); // a pit
    // tip loose gravel by the pit for fill and surfacing
    heap(g, 92, 82, 120);
    const before = total(g);
    const spec = strip({ ax: 78, az: 60, bx: 100, bz: 60, mode: 'ramp', maxGrade: 0.2, width: 4 });
    const plan = g.planWorks(spec);
    expect(plan.ok, plan.reason).toBe(true);
    expect(plan.grade).toBeGreaterThan(0.03);
    const built = g.buildWorks(spec);
    expect(built.ok).toBe(true);
    const profile = [80, 86, 92, 98].map((x) => g.heightAt(x, 60));
    settleAll(g);
    [80, 86, 92, 98].forEach((x, i) => expect(g.heightAt(x, 60)).toBeCloseTo(profile[i], 1));
    expect(total(g)).toBeCloseTo(before, 4);
    // rising all the way along
    for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeGreaterThan(profile[i - 1] - 0.02);
  });

  it('a level area flattens to one height', () => {
    const g = make();
    heap(g, 60, 90, 80);
    const before = total(g);
    const spec = { ax: 40, az: 50, bx: 52, bz: 50, width: 12, mode: 'level', surface: null, maxGrade: 0.01, sourceRadius: 40 };
    const plan = g.planWorks(spec);
    if (!plan.ok) expect(['fill', 'gravel']).toContain(plan.reason);
    else {
      g.buildWorks(spec);
      const hs = [[42, 46], [46, 50], [50, 54], [44, 52]].map(([x, z]) => g.heightAt(x, z));
      expect(Math.max(...hs) - Math.min(...hs)).toBeLessThan(0.05);
      expect(total(g)).toBeCloseTo(before, 4);
    }
  });

  it('a built surface persists through save and load', () => {
    const g = make();
    heap(g, 50, 82, 60);
    g.buildWorks(strip());
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    const g2 = make();
    g2.load(saved);
    expect(g2.heightAt(50, 60)).toBeCloseTo(g.heightAt(50, 60), 2);
    expect(g2.surfaceAt(50, 60)).toBe('gravel');
    expect(g2.cellBuilt(Math.floor(50 / g2.cellSize), Math.floor(60 / g2.cellSize))).toBe(true);
    expect(total(g2)).toBeCloseTo(total(g), 1);
  });

  it('digging into a road breaks it up: it stops counting as built', () => {
    const g = make();
    heap(g, 50, 82, 60);
    g.buildWorks(strip());
    const i = Math.floor(50 / g.cellSize);
    const j = Math.floor(60 / g.cellSize);
    expect(g.cellBuilt(i, j)).toBe(true);
    g.dig({ x: 50, z: 60, radius: 0.6, bottomY: g.heightAt(50, 60) - 0.3 });
    expect(g.cellBuilt(i, j)).toBe(false);
  });
});

describe('earthworks: the plan says what will happen', () => {
  it('predicts the spoil and the heap material the build then really uses', () => {
    const g = make();
    heap(g, 50, 82, 60);
    const plan = g.planWorks(strip());
    expect(plan.surfaceTonnes).toBeGreaterThan(5);
    expect(plan.heapTonnes).toBeGreaterThan(0);
    const built = g.buildWorks(strip());
    expect(built.spoilTonnes).toBeCloseTo(plan.spoilTonnes, 3);
  });
});

describe('earthworks: the spoil', () => {
  it('is heaped clear of the road and its sides, on your land, and settles without burying the road', () => {
    const g = make();
    heap(g, 50, 84, 60);
    const before = total(g);
    const plan = g.buildWorks(strip());
    expect(plan.ok).toBe(true);
    expect(plan.spoilTonnes).toBeGreaterThan(5);
    expect(Math.abs(plan.spoilAt.z - 60)).toBeGreaterThan(2 + 6); // beyond the strip and its cut/fill zone
    settleAll(g);
    // the road surface is still the planned height along its whole length, and nothing is piled beside it
    for (const x of [42, 50, 58]) expect(g.surfaceAt(x, 60)).toBe('gravel');
    for (const dz of [3, 4, 5, 6, 7]) for (const s of [-1, 1]) expect(g.heightAt(50, 60 + s * dz)).toBeLessThan(0.5);
    expect(total(g)).toBeCloseTo(before, 4);
  });

  it('goes to the far side, or the end, when the near side is at the edge of the land', () => {
    const g = make();
    // a road close to the west edge: no room to spoil on that side of it
    heap(g, 20, 104, 60);
    const plan = g.buildWorks(strip({ ax: 12, az: 96, bx: 30, bz: 96 }));
    expect(plan.ok, plan.reason).toBe(true);
    if (plan.spoilTonnes > 0) {
      expect(plan.spoilAt.x).toBeGreaterThan(g.x0 + 5);
      expect(plan.spoilAt.z).toBeGreaterThan(g.z0 + 5);
    }
  });
});

describe('earthworks: material supply preview', () => {
  const flatGround = () => {
    const cfg = structuredClone(data.ground);
    cfg.plots.home.surfaceRoll = 0;
    return createGround(cfg, 'home', { x0: 0, z0: 0, seed: 7 });
  };
  it('balances every material in the preview and conserves it through a mixed-fill build', () => {
    const g = flatGround();
    heap(g, 40, 60, 8); // Raised start requires genuine fill as well as a surface.
    g.deposit({ x: 50, z: 82, radius: 2.5, tonnes: { gravel: 60, sand: 60, clay: 20 } });
    const before = g.totals(), saved = JSON.stringify(g.serialize());
    const p = g.planWorks(strip());
    expect(p.ok, p.reason).toBe(true);
    expect(JSON.stringify(g.serialize())).toBe(saved);
    expect(p.materials.fill.bankVolume.fromHeaps).toBeGreaterThan(0);
    expect(p.materials.fill.tonnes.sand).toBeGreaterThan(0);
    expect(p.materials.surface.looseVolume.missing).toBe(0);
    expect(p.materials.fill.bankVolume.missing).toBeCloseTo(0, 6);
    for (const m of Object.keys(data.ground.materials)) {
      const available = (p.materials.cut[m] ?? 0) + (p.materials.heaps[m] ?? 0);
      const surface = m === p.materials.surface.material ? p.materials.surface.tonnes.required : 0;
      const used = surface + (p.materials.fill.tonnes[m] ?? 0) + (p.materials.spoil[m] ?? 0);
      expect(available, m).toBeCloseTo(used, 5);
    }
    const built = g.buildWorks(strip());
    expect(built.ok, built.reason).toBe(true);
    expect(built.materials).toEqual(p.materials);
    const after = g.totals();
    for (const m of Object.keys(before)) expect(after[m], m).toBeCloseTo(before[m], 3);
  });
  it('reports both shortages before building, and adding precisely the missing supply makes it feasible', () => {
    const g = flatGround();
    heap(g, 40, 60, 5);
    const saved = JSON.stringify(g.serialize()), p = g.planWorks(strip());
    expect(p.reason).toBe('gravel');
    expect(p.materials.surface.tonnes.missing).toBeGreaterThan(0);
    expect(p.materials.fill.bankVolume.missing).toBeGreaterThan(0);
    expect(g.buildWorks(strip()).ok).toBe(false);
    expect(JSON.stringify(g.serialize())).toBe(saved);
    heap(g, 50, 82, p.materials.surface.tonnes.missing + .002);
    const q = g.planWorks(strip());
    expect(q.reason).toBe('fill');
    expect(q.materials.surface.looseVolume.missing).toBeCloseTo(0, 6);
    const needed = q.materials.fill.bankVolume.missing;
    g.deposit({ x: 52, z: 84, radius: 2.5, tonnes: { topsoil: needed * data.ground.materials.topsoil.density + .002 } });
    const ready = g.planWorks(strip());
    expect(ready.ok, ready.reason).toBe(true);
    expect(ready.materials.fill.bankVolume.missing).toBeCloseTo(0, 6);
    const before = g.totals();
    expect(g.buildWorks(strip()).ok).toBe(true);
    for (const [m, tonnes] of Object.entries(before)) expect(g.totals()[m], m).toBeCloseTo(tonnes, 3);
  });
  it('reports usable supply rather than counting occupied or out-of-reach heaps', () => {
    const g = flatGround();
    heap(g, 50, 80, 80);
    heap(g, 50, 102, 100); // Outside the strip's 30 m sourcing reach.
    const p = g.planWorks(strip({ obstacles: [{ x: 50, z: 80, r: 5 }] }));
    expect(p.reason).toBe('gravel');
    expect(p.materials.surface.looseVolume.fromHeaps).toBe(0);
    expect(p.materials.heaps).toEqual({});
    expect(p.materials.surface.tonnes.missing).toBeCloseTo(p.surfaceTonnes, 6);
    expect(p.materials.sourceRadius).toBe(30);
  });
});

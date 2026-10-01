import { describe, expect, it } from 'vitest';
import { loadData } from '../core/index.js';
import { createGround } from './ground.js';

const source = loadData().ground;
function config(top = 'topsoil') {
  const data = structuredClone(source);
  data.plots.home.width = 16;
  data.plots.home.depth = 16;
  data.plots.home.surfaceRoll = 0;
  data.plots.home.rockDepth = 0.4;
  data.plots.home.strata.forEach(s => { s.thickness = [s.material === top ? 1 : 0, s.material === top ? 1 : 0]; });
  return data;
}
const make = (top = 'topsoil') => createGround(config(top), 'home', { seed: 7 });
const stroke = g => ({ from: { x: 4.25, z: 4.25, y: -0.3 }, to: { x: 5.25, z: 4.25, y: -0.3 }, width: 0.7, force: 100, maxVolume: 1 });
const settle = g => { let n = 0; while (g.busy() && n++ < 5000) g.settle(2000); expect(g.busy()).toBe(false); };
const conserved = (before, after, extracted = {}) => {
  for (const material of Object.keys(before)) expect((after[material] ?? 0) + (extracted[material] ?? 0)).toBeCloseTo(before[material], 3);
};

describe('material earth physics', () => {
  it('cuts along the teeth travel and keeps the shoulders intact', () => {
    const g = make();
    const before = g.totals();
    const r = g.cutSweep(stroke(g));
    expect(r.total).toBeGreaterThan(0);
    expect(g.heightAt(4.75, 4.25)).toBeLessThan(-0.1);
    expect(g.heightAt(4.75, 5.25)).toBe(0);
    expect(g.heightAt(6.25, 4.25)).toBe(0);
    conserved(before, g.totals(), r.tonnes);
  });

  it('limits the whole sweep by remaining loose bucket volume and weight', () => {
    const g = make();
    const r = g.cutSweep({ ...stroke(g), maxVolume: 0.012, maxTonnes: 0.02 });
    expect(r.volume).toBeLessThanOrEqual(0.01200001);
    expect(r.total).toBeLessThanOrEqual(0.02000001);
    expect(r.volume).toBeGreaterThan(0.011);
  });

  it('does not mine stationary teeth or teleport strokes', () => {
    const g = make();
    const s = stroke(g);
    const before = g.totals();
    expect(g.cutSweep({ ...s, to: s.from }).total).toBe(0);
    expect(g.cutSweep({ ...s, to: { ...s.to, x: 14.25 } }).blocked).toBe('movement');
    conserved(before, g.totals());
  });

  it('gives weak machines smaller bites and distinguishes cohesive clay from sand', () => {
    const weak = make('clay'), strong = make('clay'), sand = make('sand');
    const a = weak.cutSweep({ ...stroke(weak), force: 8 });
    const b = strong.cutSweep({ ...stroke(strong), force: 100 });
    const c = sand.cutSweep({ ...stroke(sand), force: 8 });
    expect(a.volume).toBeLessThan(b.volume / 2);
    expect(c.volume).toBeGreaterThan(a.volume);
    expect(strong.materialResponseAt(8, 8).flow).toBeLessThan(sand.materialResponseAt(8, 8).flow);
    const dry = strong.materialResponseAt(8, 8);
    strong.setMoisture(1);
    const wet = strong.materialResponseAt(8, 8);
    expect(wet.traction).toBeLessThan(dry.traction);
    expect(wet.cohesion).toBeLessThan(dry.cohesion);
  });

  it('requires a breaker for finite intact rock and conserves the extracted rubble', () => {
    const g = make();
    g.dig({ x: 4.75, z: 4.25, radius: 2, bottomY: -10 });
    const before = g.totals();
    const s = { ...stroke(g), from: { x: 4.25, z: 4.25, y: -2 }, to: { x: 4.75, z: 4.25, y: -2 }, force: 900 };
    expect(g.cutSweep(s).blocked).toBe('rock');
    const r = g.cutSweep({ ...s, tool: 'breaker' });
    expect(r.tonnes.rock).toBeGreaterThan(0);
    expect(Object.keys(r.tonnes)).toEqual(['rock']);
    conserved(before, g.totals(), r.tonnes);
    g.deposit({ x: 10.25, z: 10.25, tonnes: r.tonnes });
    conserved(before, g.totals());
    const restored = make(); restored.load(g.serialize());
    conserved(g.totals(), restored.totals());
    let extracted = 0;
    for (let n = 0; n < 12; n++) extracted += g.cutSweep({ ...s, tool: 'breaker' }).total;
    expect(extracted).toBeGreaterThan(0);
    expect(g.cutSweep({ ...s, tool: 'breaker' }).total).toBe(0);
  });

  it('moves rut material into shoulders while compaction changes grip, not mass', () => {
    const g = make();
    g.deposit({ x: 8.25, z: 8.25, tonnes: { clay: 1, sand: 1 }, radius: 2 });
    const before = g.totals(), h = g.heightAt(8.25, 8.25);
    const r = g.applyTraffic({ x: 8.25, z: 8.25, width: 1.5, weight: 10, distance: 2, moisture: 1, slip: 0.5 });
    expect(r.moved).toBeGreaterThan(0);
    expect(r.compaction).toBeGreaterThan(0);
    expect(g.heightAt(8.25, 8.25)).toBeLessThan(h);
    conserved(before, g.totals());
    const restored = make(); restored.load(g.serialize());
    expect(restored.cellCompaction(16, 16)).toBeCloseTo(g.cellCompaction(16, 16), 6);
    conserved(before, restored.totals());
  });

  it('resumes settling after a save and keeps exact per-material mass', () => {
    const g = make();
    g.deposit({ x: 8.25, z: 8.25, tonnes: { sand: 3, clay: 0.7, rock: 0.1 }, radius: 0.5 });
    const before = g.totals();
    g.settle(2);
    expect(g.busy()).toBe(true);
    const restored = make(); restored.load(JSON.parse(JSON.stringify(g.serialize())));
    expect(restored.busy()).toBe(true);
    conserved(before, restored.totals());
    settle(restored);
    conserved(before, restored.totals());
    const settled = make(); settled.load(restored.serialize());
    expect(settled.busy()).toBe(false);
    expect(settled.totals()).toEqual(restored.totals());
  });

  it('remaps saved material/layer IDs when configuration order changes', () => {
    const g = make();
    g.deposit({ x: 8.25, z: 8.25, tonnes: { sand: 1, clay: 0.3 }, radius: 1 });
    const saved = g.serialize();
    const data = config();
    data.materials = Object.fromEntries(Object.entries(data.materials).reverse());
    data.plots.home.strata.reverse();
    const restored = createGround(data, 'home', { seed: 7 }); restored.load(saved);
    conserved(g.totals(), restored.totals());
    expect(restored.surfaceAt(8.25, 8.25)).toBe(g.surfaceAt(8.25, 8.25));
  });

  it('reads the original millimetre/byte terrain saves and queues disturbed cells', () => {
    const heights = new Uint16Array(32 * 32 * 5), shares = new Uint8Array(32 * 32 * 6);
    const pack = data => btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
    for (let n = 0; n < 1024; n++) heights[n * 5 + 3] = 1000;
    const k = 16 * 32 + 16;
    heights[k * 5 + 4] = 400;
    shares[k * 6 + 2] = 255; shares[k * 6 + 5] = 1;
    for (const format of [undefined, 1]) {
      const restored = make(); restored.load({ format, chunks: { 0: pack(heights) + '|' + pack(shares) } });
      expect(restored.cellHeight(16, 16)).toBeCloseTo(0.4, 6);
      expect(restored.surfaceAt(8.25, 8.25)).toBe('sand');
      expect(restored.busy()).toBe(true);
    }
  });

  it('reads full-chunk Float32 format 2 saves without losing their composition', () => {
    const heights = new Float32Array(1024 * 8), mixes = new Float32Array(1024 * 10), flags = new Uint8Array(1024);
    const pack = data => btoa(String.fromCharCode(...new Uint8Array(data.buffer)));
    for (let n = 0; n < 1024; n++) { heights[n * 8 + 3] = 1; heights[n * 8 + 5] = -1; }
    const k = 16 * 32 + 16;
    heights[k * 8 + 4] = 0.4; mixes[k * 10 + 2] = 1; flags[k] = 129;
    const restored = make();
    restored.load({ ...restored.serialize(), format: 2, chunks: { 0: { heights: pack(heights), mix: pack(mixes), flags: pack(flags) } } });
    expect(restored.cellHeight(16, 16)).toBeCloseTo(0.4, 6);
    expect(restored.surfaceAt(8.25, 8.25)).toBe('sand');
    expect(restored.busy()).toBe(true);
    expect(restored.totals().sand).toBeCloseTo(0.4 * 0.25 * source.materials.sand.density / source.materials.sand.swell, 6);
  });

  it('reads sparse byte-plane/RLE format 3 saves with absolute heights', () => {
    // One row is already in byte-plane order. A literal block is valid RLE data.
    const literal = data => {
      const bytes = new Uint8Array(data.buffer);
      return btoa(String.fromCharCode(bytes.length - 1, ...bytes));
    };
    const heights = Float32Array.from([0, 0, 0, 1, 0.4, -1, 0.3, 0]);
    const mixes = new Float32Array(10); mixes[2] = 1;
    const restored = make();
    restored.load({ ...restored.serialize(), format: 3, chunks: { 0: {
      count: 1, cells: literal(Uint32Array.of(528)), heights: literal(heights), mix: literal(mixes), flags: literal(Uint8Array.of(129)),
    } } });
    expect(restored.cellHeight(16, 16)).toBeCloseTo(0.4, 6);
    expect(restored.cellCompaction(16, 16)).toBe(heights[6]);
    expect(restored.surfaceAt(8.25, 8.25)).toBe('sand');
    expect(restored.busy()).toBe(true);
  });

  it('uses saved generation parameters when noisy layer order/configuration changes', () => {
    const g = createGround(source, 'home', { seed: 7 });
    g.dig({ x: 8.25, z: 8.25, radius: 1, bottomY: -1.7 });
    g.deposit({ x: 10.25, z: 10.25, tonnes: { sand: 0.2, clay: 0.4, rock: 0.1 } });
    const data = structuredClone(source);
    data.materials = Object.fromEntries(Object.entries(data.materials).reverse());
    data.plots.home.strata.reverse();
    data.plots.home.strata.forEach(s => { s.thickness = [2, 3]; });
    data.plots.home.surfaceRoll = 1;
    const restored = createGround(data, 'home', { seed: 7 }); restored.load(g.serialize());
    expect(restored.totals()).toEqual(g.totals());
    expect(restored.heightAt(8.25, 8.25)).toBe(g.heightAt(8.25, 8.25));
    const again = createGround(source, 'home', { seed: 7 }); again.load(restored.serialize());
    expect(again.totals()).toEqual(g.totals());
    expect(again.cellGeology(100, 100)).toEqual(g.cellGeology(100, 100));
  });

  it('keeps field-wide traffic saves below 1 MiB of UTF16 storage and exactly restores every material', () => {
    const g = createGround(source, 'home', { seed: 7 });
    g.applyTraffic({ x: 76, z: 76, width: 300, weight: 10, distance: 2 });
    const saved = JSON.stringify(g.serialize());
    expect(saved.length * 2).toBeLessThan(1024 * 1024);
    const restored = createGround(source, 'home', { seed: 7 }); restored.load(JSON.parse(saved));
    expect(restored.totals()).toEqual(g.totals());
    expect(restored.cellCompaction(150, 150)).toBe(g.cellCompaction(150, 150));
  });

  it('keeps a small active cut sparse and permits reloading over edited terrain', () => {
    const g = make();
    g.cutSweep(stroke(g));
    const saved = JSON.parse(JSON.stringify(g.serialize()));
    expect(Object.values(saved.chunks).reduce((n, c) => n + c.count, 0)).toBeLessThan(40);
    const restored = make();
    restored.deposit({ x: 10.25, z: 10.25, tonnes: { rock: 5 } });
    restored.load(saved);
    expect(restored.totals()).toEqual(g.totals());
    expect(restored.cellHeight(20, 20)).toBe(g.cellHeight(20, 20));
    expect(restored.busy()).toBe(g.busy());
  });

  it('restores sparse cells in partial chunks at plot edges', () => {
    const data = config(); data.plots.home.width = 20.5; data.plots.home.depth = 17.5;
    const g = createGround(data, 'home', { seed: 7 });
    g.deposit({ x: 19.75, z: 16.75, tonnes: { rock: 0.4, clay: 0.2 }, radius: 0.5 });
    const restored = createGround(data, 'home', { seed: 7 }); restored.load(g.serialize());
    expect(restored.totals()).toEqual(g.totals());
    expect(restored.cellHeight(39, 33)).toBe(g.cellHeight(39, 33));
    expect(restored.busy()).toBe(true);
  });

  it('rejects invalid compressed lengths instead of silently changing terrain', () => {
    const g = make(); g.cutSweep(stroke(g));
    const saved = g.serialize();
    Object.values(saved.chunks)[0].heights = btoa(String.fromCharCode(255, 0));
    expect(() => make().load(saved)).toThrow('Invalid saved terrain data');
  });

  it('keeps compacted rubble fill as rock through road building, saving and excavation', () => {
    const data = config();
    data.plots.home.width = 40; data.plots.home.depth = 40;
    const g = createGround(data, 'home', { seed: 7 });
    g.dig({ x: 20, z: 20, radius: 3, bottomY: -0.8 });
    g.deposit({ x: 20, z: 29, tonnes: { rock: 40 }, radius: 2 });
    const before = g.totals();
    const spec = { ax: 12, az: 20, bx: 28, bz: 20, width: 3, mode: 'road', maxGrade: 1, sourceRadius: 15 };
    const plan = g.planWorks(spec);
    expect(plan.ok).toBe(true);
    expect(plan.heapFillNeeded).toBeGreaterThan(0);
    g.buildWorks(spec);
    conserved(before, g.totals());
    const restored = createGround(data, 'home', { seed: 7 }); restored.load(g.serialize());
    conserved(before, restored.totals());
    const r = restored.dig({ x: 20, z: 20, radius: 1, bottomY: -0.6 });
    expect(r.tonnes.rock).toBeGreaterThan(0);
    conserved(before, restored.totals(), r.tonnes);
  });
});

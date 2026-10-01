import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/index.js';
import { WORKS_MODES, worksCost } from './index.js';

const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
const total = (g) => sum(g.totals());
const road = (o = {}) => ({ mode: 'road', ax: 40, az: 60, bx: 60, bz: 60, width: 4, ...o });
const heap = (g, x, z, tonnes = 60) => g.deposit({ x, z, tonnes: { gravel: tonnes }, radius: 2.5 });

function setup(money = 500, flat = false) {
  const data = structuredClone(loadData());
  if (flat) data.ground.plots.home.surfaceRoll = 0;
  data.milestones.list = []; // (their rewards would change the money these tests check)
  const game = createGame({ seed: 3, data });
  game.state.money = money;
  const g = game.ctx.ground;
  return { game, g, a: game.actions };
}

describe('earthworks: what it costs and what it needs', () => {
  it('has a road, a ramp and a level area, each with a price', () => {
    const { game } = setup();
    for (const m of WORKS_MODES) expect(worksCost(game.data, m, 80)).toBeGreaterThan(0);
  });

  it('a plan changes neither the ground nor your money', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    const t = total(g);
    const before = g.heightAt(50, 60);
    const plan = a.planWorks(road());
    expect(plan.ok).toBe(true);
    expect(plan.cost).toBeGreaterThan(0);
    expect(game.state.money).toBe(500);
    expect(g.heightAt(50, 60)).toBe(before);
    expect(total(g)).toBe(t);
  });

  it('building charges the price once, keeps every tonne, and counts it', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    const t = total(g);
    const plan = a.planWorks(road());
    const events = [];
    game.events.on('worksBuilt', (e) => events.push(e));
    const r = a.buildWorks(road());
    expect(r.ok).toBe(true);
    expect(game.state.money).toBe(500 - plan.cost);
    expect(total(g)).toBeCloseTo(t, 4);
    expect(events).toHaveLength(1);
    expect(game.state.stats.works.road).toBe(1);
    expect(g.surfaceAt(50, 60)).toBe('gravel');
  });

  it('refuses when you can\'t afford it, and changes nothing', () => {
    const { game, g, a } = setup(5);
    heap(g, 50, 82);
    const t = total(g);
    const h = g.heightAt(50, 60);
    const r = a.buildWorks(road());
    expect(r.ok).toBe(false);
    expect(r.affordable).toBe(false);
    expect(r.reason).toMatch(/costs/i);
    expect(game.state.money).toBe(5);
    expect(g.heightAt(50, 60)).toBe(h);
    expect(total(g)).toBe(t);
  });

  it('says how much gravel is missing instead of making some up', () => {
    const { game, g, a } = setup();
    const t = total(g);
    const r = a.buildWorks(road());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not enough gravel/i);
    expect(game.state.money).toBe(500);
    expect(total(g)).toBe(t);
  });

  it('gives an actionable compacted-fill shortfall while keeping failed plans and builds read only', () => {
    const { game, g, a } = setup(500, true);
    heap(g, 40, 60, 5);
    const initial = a.planWorks(road());
    expect(initial.materials.fill.bankVolume.missing).toBeGreaterThan(0);
    heap(g, 50, 82, initial.materials.surface.tonnes.missing + .002);
    const before = JSON.stringify(game.snapshot());
    const p = a.planWorks(road());
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/\d+\.\d m³ more after compaction/);
    expect(p.reason).toContain('within 30 m');
    expect(p.materials.fill.bankVolume.missing).toBeGreaterThan(0);
    expect(a.buildWorks(road()).ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('quantifies the run needed for the same rise and flags routes beyond a single build', () => {
    const { game, g, a } = setup(500, true);
    g.dig({ x: 60, z: 60, radius: 3, bottomY: g.heightAt(60, 60) - 2.6 });
    const p = a.planWorks(road());
    expect(p.reason).toContain('For the same rise');
    expect(p.gradeGuidance.minimumRun).toBeCloseTo(p.gradeGuidance.rise / .1, 6);
    expect(p.gradeGuidance.extraRun).toBeGreaterThan(0);
    expect(p.gradeGuidance.withinMaxLength).toBe(true);
    heap(g, 40, 60, 20);
    const before = JSON.stringify(game.snapshot()), q = a.planWorks(road());
    expect(q.gradeGuidance.withinMaxLength).toBe(false);
    expect(q.reason).toContain('Reduce the rise');
    expect(a.buildWorks(road()).ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('refuses a too-steep ramp and too short or too long strips, with the reason', () => {
    const { g, a } = setup();
    heap(g, 50, 82);
    g.dig({ x: 60, z: 60, radius: 3, bottomY: g.heightAt(60, 60) - 2.6 });
    expect(a.planWorks(road({ bx: 60 })).reason).toMatch(/too steep/i);
    expect(a.planWorks(road({ bx: 42 })).reason).toMatch(/too short/i);
    expect(a.planWorks(road({ bx: 95 })).reason).toMatch(/too long/i);
    expect(a.planWorks(road({ ax: 2, bx: 20 })).reason).toMatch(/edge/i);
  });

  it('won\'t build under a machine or barrow', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    const r = a.planWorks(road({ obstacles: [{ x: 50, z: 61, r: 1.5, label: 'The pickup' }] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/move the pickup/i);
    expect(a.planWorks(road({ obstacles: [{ x: 50, z: 60, r: 1.2, label: 'The wheelbarrow' }] })).ok).toBe(false);
    expect(a.planWorks(road({ obstacles: [{ x: 50, z: 70, r: 1.5, label: 'The pickup' }] })).ok).toBe(true);
    expect(game.state.money).toBe(500);
  });

  it('allows standing 1 m off a road edge and machinery 3 m off a flat road edge', () => {
    const { g, a } = setup(500, true);
    heap(g, 50, 82);
    const plan = a.planWorks(road({ obstacles: [{ x: 50, z: 65, r: 1.5, label: 'The pickup' }] }));
    expect(plan.ok, plan.reason).toBe(true);
    expect(plan.touchesChangedCell({ x: 50, z: 63, r: 0.35 })).toBe(false);
    expect(a.buildWorks(road({ obstacles: [{ x: 50, z: 65, r: 1.5, label: 'The pickup' }] })).ok).toBe(true);
  });

  it('refuses a machine on a changed cell without changing money, material or saved state', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    const before = JSON.stringify(game.snapshot());
    const r = a.buildWorks(road({ obstacles: [{ x: 50, z: 60, r: 0.35, label: 'The pickup' }] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/move the pickup/i);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('protects changed batter cells outside the road edge and emits plain data', () => {
    const { game, g, a } = setup(1000, true);
    // A raised start makes the road's side fill reach beyond its nominal width.
    heap(g, 40, 60, 20);
    heap(g, 50, 82, 1000);
    const spec = road();
    const p = a.planWorks(spec);
    expect(p.ok, p.reason).toBe(true);
    expect(p.touchesChangedCell({ x: 41, z: 62.25 })).toBe(true);
    expect(a.buildWorks({ ...spec, obstacles: [{ x: 41, z: 62.25, r: 0.1 }] }).ok).toBe(false);
    const events = [];
    game.events.on('worksBuilt', e => events.push(e));
    expect(a.buildWorks(spec).ok).toBe(true);
    expect(events[0].touchesChangedCell).toBeUndefined();
    expect(JSON.parse(JSON.stringify(events[0]))).toEqual(events[0]);
  });

  it('rejects nonfinite widths without mutation', () => {
    const { game, a } = setup();
    const before = JSON.stringify(game.snapshot());
    for (const width of [NaN, Infinity]) expect(a.buildWorks(road({ width })).ok).toBe(false);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });

  it('does not borrow gravel farther than the configured reach from the strip', () => {
    const { g, a } = setup();
    heap(g, 50, 100); // in the old midpoint circle, over 30 m from the strip
    const before = g.totals();
    expect(a.buildWorks(road()).ok).toBe(false);
    expect(g.totals()).toEqual(before);
  });

  it('a built road is still there after saving and loading, and unpaid plans leave no trace', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    a.planWorks(road()); // (just looking)
    expect(a.buildWorks(road()).ok).toBe(true);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const game2 = createGame({ seed: 3, state: saved });
    const g2 = game2.ctx.ground;
    expect(g2.surfaceAt(50, 60)).toBe('gravel');
    expect(g2.heightAt(50, 60)).toBeCloseTo(g.heightAt(50, 60), 2);
    expect(g2.cellBuilt(Math.floor(50 / g2.cellSize), Math.floor(60 / g2.cellSize))).toBe(true);
    expect(game2.state.money).toBe(game.state.money);
  });

  it('builds a ramp out of a pit and a level area, each paid for once', () => {
    const { game, g, a } = setup(1000);
    g.dig({ x: 80, z: 60, radius: 5, bottomY: g.heightAt(80, 60) - 1.4 });
    heap(g, 92, 82, 120);
    const ramp = { mode: 'ramp', ax: 78, az: 60, bx: 100, bz: 60, width: 4 };
    const p = a.planWorks(ramp);
    expect(p.ok, p.reason).toBe(true);
    expect(a.buildWorks(ramp).ok).toBe(true);
    const spent = game.state.money;
    expect(spent).toBe(1000 - p.cost);
    expect(g.heightAt(98, 60)).toBeGreaterThan(g.heightAt(80, 60) + 0.5);
    const pad = { mode: 'level', ax: 20, az: 110, bx: 30, bz: 110, width: 8 };
    const q = a.planWorks(pad);
    expect(q.ok, q.reason).toBe(true);
    expect(a.buildWorks(pad).ok).toBe(true);
    expect(game.state.money).toBe(spent - q.cost);
  });
});


describe('T9: safe heap sourcing and spare spoil', () => {
  const cutPlan = a => {
    const spec = { mode: 'level', ax: 40, az: 60, bx: 60, bz: 60, width: 8 };
    return { spec, p: a.planWorks(spec) };
  };
  it('previews and builds the same alternative spoil spot when the first is occupied', () => {
    const { a, g } = setup(1000, true);
    heap(g, 50, 60, 30);
    const { spec, p } = cutPlan(a);
    expect(p.ok, p.reason).toBe(true);
    expect(p.spoilTonnes).toBeGreaterThan(0);
    const obstacles = [{ ...p.spoilAt, r: 1.5, label: 'the pickup' }];
    const alt = a.planWorks({ ...spec, obstacles });
    expect(alt.ok, alt.reason).toBe(true);
    expect(alt.spoilAt).not.toEqual(p.spoilAt);
    const before = total(g);
    const done = a.buildWorks({ ...spec, obstacles });
    expect(done.ok, done.reason).toBe(true);
    expect(done.spoilAt).toEqual(alt.spoilAt);
    expect(total(g)).toBeCloseTo(before, 4);
  });
  it('refuses all blocked spoil spots without changing any saved state', () => {
    const { game, a, g } = setup(1000, true);
    heap(g, 50, 60, 30);
    const { spec, p } = cutPlan(a);
    const off = 4 + 6 + p.spoilRadius;
    const obstacles = [[50, 60 + off], [50, 60 - off], [40 - off, 60], [60 + off, 60]]
      .map(([x, z]) => ({ x, z, r: 1, label: 'the pickup' }));
    const before = JSON.stringify(game.snapshot());
    const done = a.buildWorks({ ...spec, obstacles });
    expect(done.ok).toBe(false);
    expect(done.reason).toMatch(/No room for the spare spoil: move the pickup/);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });
  it('leaves occupied heap cells at their original height while sourcing elsewhere', () => {
    const { a, g } = setup(1000, true);
    heap(g, 50, 80, 80);
    heap(g, 55, 82, 40);
    const obstacles = [{ x: 50, z: 80, r: 1, label: 'the pickup' }];
    const before = g.heightAt(50, 80);
    const tonnes = total(g);
    const done = a.buildWorks(road({ obstacles }));
    expect(done.ok, done.reason).toBe(true);
    expect(g.heightAt(50, 80)).toBe(before);
    expect(total(g)).toBeCloseTo(tonnes, 4);
  });
  it('refuses without mutation when the only source heap is wholly occupied', () => {
    const { game, a, g } = setup(1000, true);
    heap(g, 50, 80, 80);
    const before = JSON.stringify(game.snapshot());
    const done = a.buildWorks(road({ obstacles: [{ x: 50, z: 80, r: 5 }] }));
    expect(done.ok).toBe(false);
    expect(done.reason).toMatch(/Not enough gravel/);
    expect(JSON.stringify(game.snapshot())).toBe(before);
  });
});

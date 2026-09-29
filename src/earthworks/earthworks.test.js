import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { WORKS_MODES, worksCost } from './index.js';

const sum = (rec) => Object.values(rec).reduce((a, b) => a + b, 0);
const total = (g) => sum(g.totals());
const road = (o = {}) => ({ mode: 'road', ax: 40, az: 60, bx: 60, bz: 60, width: 4, ...o });
const heap = (g, x, z, tonnes = 60) => g.deposit({ x, z, tonnes: { gravel: tonnes }, radius: 2.5 });

function setup(money = 500) {
  const game = createGame({ seed: 3 });
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

  it('refuses a too-steep ramp and too short or too long strips, with the reason', () => {
    const { g, a } = setup();
    heap(g, 50, 82);
    g.dig({ x: 60, z: 60, radius: 3, bottomY: g.heightAt(60, 60) - 2.6 });
    expect(a.planWorks(road({ bx: 60 })).reason).toMatch(/too steep/i);
    expect(a.planWorks(road({ bx: 42 })).reason).toMatch(/too short/i);
    expect(a.planWorks(road({ bx: 95 })).reason).toMatch(/too long/i);
    expect(a.planWorks(road({ ax: 2, bx: 20 })).reason).toMatch(/edge/i);
  });

  it('won\'t build under a machine or you', () => {
    const { game, g, a } = setup();
    heap(g, 50, 82);
    const r = a.planWorks(road({ obstacles: [{ x: 50, z: 61, r: 1.5, label: 'The pickup' }] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/pickup is in the way/i);
    expect(a.planWorks(road({ obstacles: [{ x: 50, z: 70, r: 1.5, label: 'The pickup' }] })).ok).toBe(true);
    expect(game.state.money).toBe(500);
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

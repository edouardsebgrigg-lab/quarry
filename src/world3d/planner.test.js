import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { createPlanner } from './planner.js';

// The planner's flow with a stand-in camera: aim, click, wheel, right click.
function setup(money = 500) {
  const data = loadData();
  data.milestones.list = []; // (their rewards would change the money these tests check)
  const game = createGame({ seed: 3, data });
  game.state.money = money;
  const ground = game.ctx.ground;
  ground.deposit({ x: 52, z: 84, tonnes: { gravel: 70 }, radius: 2.5 });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1.6, 0.1, 500);
  const notes = [];
  const planner = createPlanner({ scene, camera, game, heightAt: (x, z) => ground.heightAt(x, z), notify: (t, l) => notes.push([t, l]), obstacles: () => [] });
  const tot = () => Object.values(ground.totals()).reduce((a, b) => a + b, 0);
  const aim = (x, z) => {
    camera.position.set(50, ground.heightAt(50, 50) + 1.65, 50);
    camera.lookAt(x, ground.heightAt(x, z), z);
    camera.updateMatrixWorld(true);
  };
  const step = (o = {}) => planner.update(0.1, o);
  return { game, ground, planner, notes, tot, aim, step, camera: () => camera };
}

describe('the earthworks planner', () => {
  it('sets a start and an end, then builds only on the third click', () => {
    const { game, ground, planner, aim, step, tot } = setup();
    const t = tot();
    planner.toggle();
    expect(planner.active).toBe(true);
    aim(40, 60); step({ clicked: true });
    expect(planner.state.a).toMatchObject({ x: 40, z: 60 });
    aim(60, 60); step(); // hovering: a preview, nothing set yet
    expect(planner.state.b).toBe(null);
    expect(planner.state.plan.ok).toBe(true);
    expect(game.state.money).toBe(500);
    step({ clicked: true });
    expect(planner.state.b).toMatchObject({ x: 60, z: 60 });
    expect(game.state.money).toBe(500); // (still only a plan)
    expect(tot()).toBeCloseTo(t, 3);
    const cost = planner.state.plan.cost;
    step({ clicked: true });
    expect(game.state.money).toBe(500 - cost);
    expect(ground.surfaceAt(50, 60)).toBe('gravel');
    expect(tot()).toBeCloseTo(t, 3);
    // still planning, with the points cleared for the next one
    expect(planner.active).toBe(true);
    expect(planner.state.a).toBe(null);
  });

  it('the wheel changes the width within its limits; right click steps back, then cancels', () => {
    const { planner, aim, step } = setup();
    planner.toggle();
    aim(40, 60); step({ clicked: true });
    aim(60, 60); step({ clicked: true });
    const w = planner.state.width;
    step({ wheel: -100 });
    expect(planner.state.width).toBe(w + 0.5);
    step({ wheel: 100 * 40 });
    expect(planner.state.width).toBe(3); // (the least a road can be)
    step({ wheel: -100 * 40 });
    expect(planner.state.width).toBe(8);
    step({ rightPressed: true });
    expect(planner.state.b).toBe(null);
    expect(planner.state.a).not.toBe(null);
    step({ rightPressed: true });
    expect(planner.state.a).toBe(null);
    step({ rightPressed: true });
    expect(planner.active).toBe(false);
  });

  it('cancelling at any point loses nothing', () => {
    const { game, ground, planner, aim, step, tot } = setup();
    const t = tot();
    const h = ground.heightAt(50, 60);
    planner.toggle();
    aim(40, 60); step({ clicked: true });
    aim(60, 60); step({ clicked: true });
    step({ rightPressed: true }); step({ rightPressed: true }); step({ rightPressed: true });
    expect(game.state.money).toBe(500);
    expect(tot()).toBe(t);
    expect(ground.heightAt(50, 60)).toBe(h);
  });

  it('refuses a build that can\'t be afforded and says why', () => {
    const { game, planner, aim, step, notes } = setup(10);
    planner.toggle();
    aim(40, 60); step({ clicked: true });
    aim(60, 60); step({ clicked: true });
    expect(planner.state.plan.ok).toBe(false);
    expect(planner.state.plan.reason).toMatch(/costs/);
    step({ clicked: true });
    expect(game.state.money).toBe(10);
    expect(notes.at(-1)[0]).toMatch(/costs/);
    expect(notes.at(-1)[1]).toBe('warn');
    const hud = planner.hud(() => 'F');
    expect(hud.card.level).toBe('bad');
    expect(hud.prompts[0].text).toMatch(/can't build/i);
  });

  it('says to aim at the ground when a click to set an end misses it, and builds once both ends are set wherever you look', () => {
    const { game, planner, aim, step, notes, camera } = setup();
    planner.toggle();
    const sky2 = () => { camera().position.set(50, 30, 50); camera().lookAt(50, 60, 90); camera().updateMatrixWorld(true); };
    sky2(); step({ clicked: true });
    expect(planner.state.a).toBe(null);
    expect(notes.at(-1)[0]).toMatch(/aim at the ground/i);
    aim(40, 60); step({ clicked: true });
    aim(60, 60); step({ clicked: true });
    const cost = planner.state.plan.cost;
    sky2(); step({ clicked: true }); // looking at the sky: still builds
    expect(game.state.money).toBe(500 - cost);
  });

  it('cycles road, ramp and level with their own widths, and shows the price on the prompt when it is valid', () => {
    const { planner, aim, step } = setup();
    planner.toggle();
    expect(planner.state.mode).toBe('road');
    planner.cycleMode();
    expect(planner.state.mode).toBe('ramp');
    planner.cycleMode();
    expect(planner.state.mode).toBe('level');
    expect(planner.state.width).toBe(8);
    planner.cycleMode();
    expect(planner.state.mode).toBe('road');
    aim(40, 60); step({ clicked: true });
    aim(60, 60); step({ clicked: true });
    expect(planner.hud(() => 'F').prompts[0].text).toMatch(/Build it \(\$\d+\)/);
  });
});

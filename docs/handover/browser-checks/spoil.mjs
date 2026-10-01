// T9: the planner previews an alternate spoil heap; player is lifted onto it.
// Placement/aim are set by code; pointer lock is stubbed, normal mouse play is not checked.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const { browser, page, q, frames, shot, newGame, errors } = await start();
await page.addInitScript(() => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => document.querySelector('.world-canvas') });
  Element.prototype.requestPointerLock = () => Promise.resolve();
});
try {
  await newGame();
  await q(() => document.dispatchEvent(new Event('pointerlockchange')));
  const R = await q(() => {
    const { game, world } = window.__quarry; const g = game.ctx.ground; const d = world.debug;
    game.state.money = 10000;
    game.actions.dumpGround({ x: 50, z: 60, tonnes: { topsoil: 40 }, radius: 2 });
    const spec = { mode: 'level', ax: 40, az: 60, bx: 60, bz: 60, width: 8 };
    const first = game.actions.planWorks(spec);
    const pickup = game.state.machines.find(m => m.type === 'pickup');
    d.placeVehicle(pickup.id, first.spoilAt.x, first.spoilAt.z, 0);
    const p = d.planner.set({ mode: 'level', a: { x: 40, z: 60 }, b: { x: 60, z: 60 }, width: 8 });
    d.teleportPlayer(32, 44, 0);
    d.aimAt(50, 58);
    window.__spoilPlan = p;
    return { first: first.spoilAt, planned: p.spoilAt, ok: p.ok, reason: p.reason };
  });
  assert.ok(R.ok, JSON.stringify(R));
  assert.notDeepEqual(R.planned, R.first);
  await frames(2);
  await shot('spoil-preview');
  const built = await q(() => {
    const { game, world } = window.__quarry; const d = world.debug;
    d.teleportPlayer(window.__spoilPlan.spoilAt.x, window.__spoilPlan.spoilAt.z, 0);
    const before = d.feet()[1];
    const done = d.planner.confirm();
    return { ok: done.ok, at: done.spoilAt, before, feet: d.feet(), surface: game.ctx.ground.heightAt(done.spoilAt.x, done.spoilAt.z) };
  });
  assert.ok(built.ok);
  assert.ok(Math.hypot(built.at.x - R.planned.x, built.at.z - R.planned.z) < 0.01);
  assert.ok(built.feet[1] > built.before);
  assert.ok(Math.abs(built.feet[1] - built.surface - 0.15) < 0.01, JSON.stringify(built));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ R, built, errors }));
} finally { await browser.close(); }

// T2: real planner click while standing at its start post; then fill under the player.
// Pointer lock is stubbed and aim/placement is set by code. Run: timeout 600 node ...
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const { browser, page, q, frames, newGame, errors } = await start();
await page.addInitScript(() => {
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
  document.exitPointerLock = () => { window.__lockEl = null; document.dispatchEvent(new Event('pointerlockchange')); };
});
try {
  await newGame();
  await q(() => {
    const { game, world } = window.__quarry;
    game.state.money = 10000;
    game.actions.dumpGround({ x: 50, z: 82, tonnes: { gravel: 150 }, radius: 3 });
    window.__lockEl = document.querySelector('.world-canvas');
    document.dispatchEvent(new Event('pointerlockchange'));
    window.__footprintEvents = [];
    game.events.on('worksBuilt', () => {
      const [x, y, z] = world.debug.feet();
      window.__footprintEvents.push({ x, y, z, surface: game.ctx.ground.heightAt(x, z) });
    });
  });
  await q(() => {
    const d = window.__quarry.world.debug;
    d.teleportPlayer(40, 60, 0);
    d.aimAt(60, 60);
    const p = d.planner.set({ mode: 'road', a: { x: 40, z: 60 }, b: { x: 60, z: 60 }, width: 4 });
    if (!p.ok) throw new Error(p.reason);
  });
  await frames(2);
  const click = () => q(() => {
    document.querySelector('.world-canvas').dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }));
  });
  await click(); await frames(4);
  const road = await q(() => ({ built: window.__quarry.game.state.stats.works?.road, events: window.__footprintEvents }));
  assert.equal(road.built, 1);
  assert.equal(road.events.length, 1);
  assert.ok(Math.abs(road.events[0].x - 40) < 0.05);
  assert.ok(Math.abs(road.events[0].z - 60) < 0.05);
  assert.ok(Math.abs(road.events[0].y - road.events[0].surface - 0.15) < 0.005, JSON.stringify(road));
  console.log('road built at start post', JSON.stringify(road));
  const fill = await q(() => {
    const { game, world } = window.__quarry; const g = game.ctx.ground; const d = world.debug;
    d.planner.cancel();
    const cut = game.actions.digGround({ x: 25, z: 110, radius: 1.5, bottomY: g.heightAt(25, 110) - 0.6 });
    game.actions.dumpGround({ x: 25, z: 128, tonnes: cut.tonnes, radius: 2.5 });
    d.teleportPlayer(25, 110, 0);
    const before = d.feet()[1];
    const plan = d.planner.set({ mode: 'level', a: { x: 20, z: 110 }, b: { x: 30, z: 110 }, width: 8 });
    const done = d.planner.confirm(); d.planner.cancel();
    return { before, planOK: plan.ok, ok: done.ok, reason: done.reason, feet: d.feet(), surface: g.heightAt(25, 110) };
  });
  assert.equal(fill.ok, true, JSON.stringify(fill));
  assert.ok(fill.feet[1] > fill.before + 0.3, JSON.stringify(fill));
  assert.ok(Math.abs(fill.feet[1] - fill.surface - 0.15) < 0.005, JSON.stringify(fill));
  console.log('player raised onto filled surface', JSON.stringify(fill));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

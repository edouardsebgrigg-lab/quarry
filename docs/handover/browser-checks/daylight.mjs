// Separate active real-time daylight, real pause gate, and a bounded walk/dig at night.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const { browser, page, errors, q, frames, shot, newGame } = await start();
await page.addInitScript(() => {
  Object.defineProperty(document, 'pointerLockElement', { configurable:true, get:()=>document.querySelector('.world-canvas') });
  Element.prototype.requestPointerLock = () => Promise.resolve();
  document.exitPointerLock = () => {};
});
await newGame();
await page.keyboard.press('p');
await frames(2);
const paused = await q(() => window.__quarry.game.state.time.visualSeconds);
await frames(25);
assert.equal(await q(() => window.__quarry.game.state.time.visualSeconds), paused);
await page.keyboard.press('p');
await frames(12);
assert.ok(await q(() => window.__quarry.game.state.time.visualSeconds) > paused);
console.log('real pause/resume gate passed');
await q(() => {
  const d = window.__quarry.world.debug;
  d.teleportPlayer(174, 18); d.aimAt(181, 30); d.setFootPitch(-.1);
});
for (const [name, hour] of [['noon',12],['dusk',18.1],['night',0]]) {
  await q(hour => { const g = window.__quarry.game; g.state.time.visualSeconds = hour / 24 * g.data.game.visualDayLengthSeconds; g.state.weather.current = 'sunny'; window.__quarry.world.debug.settleWeather(); }, hour);
  await frames(8);
  const light = await q(() => window.__quarry.world.debug.lighting());
  assert.ok(Number.isFinite(light.sunIntensity));
  if (name === 'night') { assert.equal(light.sunIntensity, 0); assert.ok(light.moonIntensity > 0); assert.ok(light.ambientIntensity > 0); }
  console.log(name, JSON.stringify(light));
  await shot(name);
}
const before = await q(() => window.__quarry.world.debug.feet());
await q(() => window.__quarry.world.debug.setKeys(['forward']));
await frames(45);
await q(() => window.__quarry.world.debug.setKeys([]));
const after = await q(() => window.__quarry.world.debug.feet());
assert.ok(Math.hypot(after[0]-before[0],after[2]-before[2]) > .5);
// Walked normally; place at the field for the separate bounded shovel check.
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(130,35); d.aimAt(127,35); d.setFootPitch(-.9); });
await frames(3);
console.log('shovel prompt', JSON.stringify(await q(() => window.__quarry.world.hudInfo().prompt)));
await q(() => window.__quarry.world.debug.useShovel());
await frames(100);
assert.ok(await q(() => Object.values(window.__quarry.game.state.tools.shovel.load).reduce((a,b)=>a+b,0)) > 0);
await shot('night-field');
await q(() => { window.__quarry.game.state.weather.current = 'rain'; window.__quarry.world.debug.settleWeather(); });
await frames(8);
await shot('night-rain');
const savedPhase = await q(() => { const g = window.__quarry.game; window.__quarry.saveTo('slot1'); return g.state.time.visualSeconds; });
await page.reload();
await page.getByText('Continue', {exact:true}).click();
await page.waitForFunction(() => window.__quarry?.world);
await frames(5);
const restoredPhase = await q(() => window.__quarry.game.state.time.visualSeconds);
assert.ok(Math.abs(restoredPhase - savedPhase) < 3);
await shot('night-continue');
assert.deepEqual(errors, []);
console.log('night walk/shovel and UI Continue passed; errors (none)');
await browser.close();

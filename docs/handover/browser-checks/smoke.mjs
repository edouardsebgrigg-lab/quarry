// Quick health check of the whole game in a real browser (a few minutes with software rendering):
// a new game starts, a shovelful comes out of the field, every laptop app opens without printing
// "null", "undefined" or "NaN", the map opens, and a save comes back with the same money, clock
// and shovel load.
// Fails on any console error. Keep it passing; it's the first check to run after a change.
//   OUT=<dir> timeout 600 node docs/handover/browser-checks/smoke.mjs   (test server on 5174)
import assert from 'node:assert/strict';
import { start } from './common.mjs';

const { browser, page, errors, q, frames, newGame } = await start();
setTimeout(() => { console.log('FAIL: overall time limit'); process.exit(2); }, 9 * 60 * 1000);
const step = (name) => console.log('ok', name);

await newGame();
step('new game');

// Dig a shovelful on the home field.
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(130, 35); d.aimAt(127, 35); d.setFootPitch(-0.9); });
await frames(3);
await q(() => window.__quarry.world.debug.useShovel());
await frames(60);
const shovel = () => q(() => Object.values(window.__quarry.game.state.tools.shovel.load).reduce((a, b) => a + b, 0));
const dug = await shovel();
assert.ok(dug > 0, 'the shovel picked nothing up');
step(`shovelful (${dug.toFixed(3)} t)`);

// Every laptop app opens (and renders without an error).
await page.keyboard.press('b');
await frames(3);
const apps = await q(() => [...document.querySelectorAll('.lt-dock-app')].map((b) => b.getAttribute('aria-label')));
assert.ok(apps.length >= 8, `only ${apps.length} laptop apps`);
for (const label of apps) {
  const { shown, junk } = await q((label) => {
    document.querySelector(`.lt-dock-app[aria-label="${label}"]`).click();
    const body = document.querySelector('.lt-app-body');
    // A missing value printed as text ("null", "undefined", "NaN") is always a bug.
    return { shown: body?.childElementCount ?? 0, junk: (body?.innerText ?? '').match(/(null|undefined|NaN)(?![a-z])/)?.[0] ?? null };
  }, label);
  assert.ok(shown > 0, `${label} shows nothing`);
  assert.equal(junk, null, `${label} shows "${junk}"`);
  await frames(1);
}
await page.keyboard.press('Escape');
await frames(3);
step(`laptop apps (${apps.join(', ')})`);

// The map.
await page.keyboard.press('Tab');
await frames(3);
assert.ok(await q(() => !!document.querySelector('.overlay-map, .map-overlay, .overlay.map')), 'map did not open');
await page.keyboard.press('Tab');
await frames(2);
step('map');

// Save, reload, Continue.
const before = await q(() => { const g = window.__quarry.game; window.__quarry.saveTo('slot1'); return { money: g.state.money, tick: g.state.time.tick }; });
const shovelBefore = await shovel();
await page.reload();
await page.getByText('Continue', { exact: true }).click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
await frames(3);
const after = await q(() => { const g = window.__quarry.game; return { money: g.state.money, tick: g.state.time.tick }; });
assert.equal(after.money, before.money, 'money changed across save and load');
assert.ok(Math.abs(after.tick - before.tick) < 5, 'clock changed across save and load');
assert.ok(Math.abs((await shovel()) - shovelBefore) < 1e-9, 'shovel load changed across save and load');
step('save and Continue');

if (process.env.OUT) {
  await page.setViewportSize({ width: 960, height: 540 });
  await frames(4);
  await page.screenshot({ path: `${process.env.OUT}/smoke.png` });
}
assert.deepEqual(errors, [], 'console errors');
console.log('PASS smoke: no console errors');
await browser.close();
process.exit(0);

// Comparable views of the machines, rusty and used, for before/after looks. TAG=before|after.
// CAPTURE_VIEWS=used-lineup (or comma-separated suffixes) isolates slow captures without
// changing any camera/model placement. CLEAN_SHOTS=1 hides transient feedback for the photos.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'before';
const views = process.env.CAPTURE_VIEWS ? new Set(process.env.CAPTURE_VIEWS.split(',')) : null;
const { browser, errors, q, frames, shot: captureShot, newGame } = await start();
const shot = async (name) => {
  if (!views || views.has(name.slice(TAG.length + 1))) await captureShot(name);
};
try {
await newGame();
if (process.env.CLEAN_SHOTS === '1') await q(() => { document.querySelector('.feedback').style.visibility = 'hidden'; });
const ids = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 1e6;
  const out = {};
  for (const tier of ['rusty', 'used']) for (const t of ['miniDigger', 'dumper', 'tractor', 'excavator']) out[`${t}_${tier}`] = g.actions.buyMachine(t, tier).machine.id;
  return out;
});
await frames(4);
await q((ids) => {
  const d = window.__quarry.world.debug;
  const Y = -0.9; // three-quarter view toward the camera
  const lay = { miniDigger: 30, dumper: 38, tractor: 49, excavator: 63 };
  for (const [k, id] of Object.entries(ids)) {
    const [type, tier] = k.split('_');
    d.placeVehicle(id, lay[type] + (tier === 'used' ? 70 : 0), 80, Y);
  }
}, ids);
await frames(8);
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(47, 95, 0); d.setFootPitch(-0.12); });
await shot(`${TAG}-rusty-lineup`);
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(117, 95, 0); d.setFootPitch(-0.12); });
await shot(`${TAG}-used-lineup`);
// Closer, the way you'd walk up to them.
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(40, 87, -0.25); d.setFootPitch(-0.2); });
await shot(`${TAG}-rusty-close`);
await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(110, 87, -0.25); d.setFootPitch(-0.2); });
await shot(`${TAG}-used-close`);
// From the driving seat's chase camera.
await q((ids) => { const d = window.__quarry.world.debug; d.enterVehicle(ids.tractor_rusty); d.setCamMode('chase'); d.setLook(2.4, -0.15); }, ids);
await frames(6);
await shot(`${TAG}-rusty-tractor-chase`);
console.log('errors', errors.slice(0, 10).join('\n'));
assert.deepEqual(errors, []);
} finally { await browser.close(); }

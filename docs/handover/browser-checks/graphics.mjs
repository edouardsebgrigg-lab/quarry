// Graphics review shots on the "high" setting, HUD hidden: rusty and used machines close up,
// the field from the yard, and the tractor from the chase camera. TAG names the set.
// OUT=<dir> TAG=base node docs/handover/browser-checks/graphics.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'base';
const QUALITY = process.env.QUALITY ?? 'high';
// (software rendering is slow on "high": the whole run stays at 640×360 and shots are taken at that size)
const { browser, page, errors, q, frames, newGame } = await start({ width: 640, height: 360 });
const shot = async (name) => { await frames(3); await page.screenshot({ path: `${process.env.OUT}/${name}.png`, timeout: 300000 }); console.log('shot', name); };
await page.addInitScript((quality) => localStorage.setItem('quarry.settings', JSON.stringify({ graphics: quality, fullscreen: false, volume: 0 })), QUALITY);
console.log('loading');
await newGame();
console.log('in game');
const ids = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 1e6;
  const out = {};
  for (const tier of ['rusty', 'used']) for (const t of ['miniDigger', 'dumper', 'tractor', 'excavator', 'truck']) out[`${t}_${tier}`] = g.actions.buyMachine(t, tier).machine.id;
  return out;
});
await frames(4);
await q((ids) => {
  const d = window.__quarry.world.debug;
  const lay = { miniDigger: 30, dumper: 38, tractor: 49, excavator: 63, truck: 78 };
  for (const [k, id] of Object.entries(ids)) {
    const [type, tier] = k.split('_');
    d.placeVehicle(id, lay[type] + (tier === 'used' ? 70 : 0), 80, -0.9);
  }
  for (const s of ['.hud', '.hud3d', '.feedback', '.game-hud', '.top-bar']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; });
}, ids);
await frames(10);
const view = async (name, fn, arg) => { await q(fn, arg); await frames(6); await shot(`${TAG}-${name}`); };
await view('rusty-close', () => { const d = window.__quarry.world.debug; d.teleportPlayer(44, 90, -0.35); d.setFootPitch(-0.22); });
await view('used-close', () => { const d = window.__quarry.world.debug; d.teleportPlayer(114, 90, -0.35); d.setFootPitch(-0.22); });
await view('field-wide', () => { const d = window.__quarry.world.debug; d.teleportPlayer(150, 30, 0.9); d.setFootPitch(-0.12); });
await view('tractor-chase', (id) => { const d = window.__quarry.world.debug; d.enterVehicle(id); d.setCamMode('chase'); d.setLook(2.4, -0.15); }, ids.tractor_rusty);
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

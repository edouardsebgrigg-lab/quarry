// T5 diagnostic: normal money, held movement keys, no vehicle/position shortcuts.
import { writeFileSync } from 'node:fs';
import { start } from './common.mjs';
const { browser, page, q, frames, shot, newGame, errors } = await start();
await page.addInitScript(() => {
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
});
const R = { samples: [], controls: 'pointer lock stubbed; aim and held keys set by code; normal fresh-save money' };
try {
  await newGame();
  await q(() => { window.__lockEl = document.querySelector('.world-canvas'); document.dispatchEvent(new Event('pointerlockchange')); });
  for (let i = 0; i <= 120; i++) {
    if (i % 20 === 0) {
      const s = await q(() => ({ feet: window.__quarry.world.debug.feet(), money: window.__quarry.game.state.money, tick: window.__quarry.game.state.time.tick, locked: window.__quarry.world.isMouseLocked(), prompt: window.__quarry.world.hudInfo().prompt }));
      R.samples.push({ frame: i, ...s });
      writeFileSync(`${process.env.OUT}/opening-probe.json`, JSON.stringify(R, null, 2));
      console.log(JSON.stringify(R.samples.at(-1)));
    }
    await q(() => {
      const d = window.__quarry.world.debug; const f = d.feet();
      d.setFootYaw(Math.atan2(-(171 - f[0]), -(26 - f[2])));
      d.setKeys(['forward']);
    });
    await frames(1);
  }
  await q(() => window.__quarry.world.debug.setKeys([]));
  await shot('opening-walk');
  R.errors = errors;
  writeFileSync(`${process.env.OUT}/opening-probe.json`, JSON.stringify(R, null, 2));
} finally { await browser.close(); }

// The weather in the game: the same view dry, then in rain once the sky and ground have changed.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/weather.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'weather';
const { browser, page, errors, q, frames, newGame } = await start({ width: 480, height: 270 });
const shot = async (name) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(3);
  await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 });
  await page.setViewportSize({ width: 480, height: 270 }); await frames(2);
  console.log('shot', name);
};
await newGame();
await q(() => {
  const g = window.__quarry.game;
  g.state.money = 5000;
  g.actions.buyMachine('excavator', 'used');
  for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; });
  const d = window.__quarry.world.debug;
  d.teleportPlayer(120, 40, 0);
  d.aimAt(95, 70);
  d.setFootPitch(-0.12);
});
await frames(8);
await shot('dry');
await q(() => { const w = window.__quarry.game.state.weather; w.today = 'rain'; w.current = 'rain'; window.__quarry.world.debug.settleWeather(); });
await frames(30); // (the sky, fog and wet ground jump to the rain; the drops need a few frames)
await shot('rain');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

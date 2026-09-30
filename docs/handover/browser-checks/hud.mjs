// The HUD over the game: money, date, weather and speed top right, the goal and a job top left.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/hud.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'hud';
const { browser, errors, q, frames, shot, newGame } = await start({ width: 480, height: 270 });
await newGame();
await q(() => {
  const g = window.__quarry.game;
  const w = g.state.weather;
  if (w) { w.today = 'showers'; w.current = 'showers'; }
  const offer = g.state.contracts?.offers?.[0];
  if (offer) g.actions.acceptContract(offer.id);
  window.__quarry.world.debug.aimAt?.(95, 70);
});
await frames(20);
await shot(`${TAG}-hud`);
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

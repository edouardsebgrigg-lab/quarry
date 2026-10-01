// The full-screen map (Tab) and the pause menu, over the game. Blur behind overlays off for speed.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/menus.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'menus';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(3); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay { backdrop-filter: none !important; }' });
await q(() => { const g = window.__quarry.game; g.state.money = 4000; g.actions.buyMachine('miniDigger', 'rusty'); g.actions.buyMachine('dumper', 'used'); });
await frames(4);
await page.keyboard.press('Tab');
await frames(10);
await shot('map');
await page.keyboard.press('Tab');
await frames(4);
await page.keyboard.press('Escape');
await frames(4);
await shot('pause');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

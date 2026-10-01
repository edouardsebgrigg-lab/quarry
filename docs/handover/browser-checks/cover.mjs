// Insurance cover in the Fleet app: the three covers, then Full chosen for the next renewal.
// Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/cover.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'cover';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
await q(() => { const g = window.__quarry.game; g.state.money = 6000; g.actions.buyMachine('excavator', 'used'); g.actions.buyMachine('truck', 'rusty'); });
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Fleet' }).click();
await frames(12);
await page.locator('.lt-cover-opt').nth(2).click(); // (Full)
await frames(2);
await page.locator('.lt-cover').scrollIntoViewIfNeeded();
await shot('fleet');
const s = await q(() => window.__quarry.game.state.insurance);
console.log('insurance', JSON.stringify(s));
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

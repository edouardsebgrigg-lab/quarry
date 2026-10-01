// Wolds Trader (second-hand adverts): the listings, one looked over, and the yard after buying.
// Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/trader.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'trader';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
const ads = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 6000;
  g.actions.buyMachine('miniDigger', 'rusty');
  for (let i = 0; i < 12 && (g.state.classifieds?.listings.length ?? 0) < 3; i++) g.dev.skipDays(1);
  return g.state.classifieds.listings.map((l) => `${l.tier} ${l.type} $${l.price} says ${l.claimed}% is ${l.actual}%`);
});
console.log('adverts', JSON.stringify(ads));
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Wolds Trader' }).click();
await frames(16);
await shot('list');
await page.locator('.lt-ad .lt-ad-actions .btn:not(.btn-primary)').first().click();
await frames(3);
await shot('looked');
const before = await q(() => window.__quarry.game.state.machines.length);
await page.locator('.lt-ad .lt-ad-actions .btn-primary').first().click();
await frames(8);
const after = await q(() => {
  const g = window.__quarry.game;
  const m = g.state.machines[g.state.machines.length - 1];
  return { count: g.state.machines.length, newest: `${m.tier} ${m.type} ${Math.round(m.condition)}%`, inYard: !!window.__quarry.world.debug.vehicle(m.id) };
});
console.log('machines', before, '->', JSON.stringify(after));
await shot('bought');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

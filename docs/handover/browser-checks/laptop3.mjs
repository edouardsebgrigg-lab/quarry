// Market news on the laptop (home ticker, prices app) and a weekly report in Messages, after
// a week of play. Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/laptop3.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'laptop3';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
await q(() => {
  const g = window.__quarry.game;
  g.state.money = 2600;
  g.actions.buyMachine('miniDigger', 'rusty');
  for (let d = 0; d < 7; d++) {
    g.events.emit('productSold', { machineId: 'm1', bayId: 'topsoil', productId: 'topsoil', tonnes: 0.4 + d * 0.1, revenue: 19.5 + d * 4, pricePerTonne: 48.75, grade: 'Clean', purity: 1 });
    g.events.emit('moneyChanged', { amount: 19.5 + d * 4, reason: 'sale', money: g.state.money });
    g.dev.skipDays(1);
  }
  // Make sure there's news to show, whatever the dice did.
  const n = g.state.news;
  if (!n.active.length) {
    const s = g.data.market.news.stories[0];
    n.active.push({ id: s.id, product: s.product, change: s.change, from: 8, until: 10, source: s.source, headline: s.headline });
  }
});
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Home' }).click();
await frames(3);
await shot('home');
await page.locator('.lt-dock-app', { hasText: 'Depot prices' }).click();
await frames(6);
await shot('prices');
await page.locator('.lt-dock-app', { hasText: 'Messages' }).click();
await frames(3);
await shot('messages');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

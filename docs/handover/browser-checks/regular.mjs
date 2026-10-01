// The jobs board with a regular customer: first the offer, then the order part way through a
// week. Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/regular.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'regular';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
const offer = await q(() => {
  const g = window.__quarry.game;
  g.state.contracts.reputation = 5;
  for (let i = 0; i < 40 && !g.state.contracts.standing.offer; i++) g.dev.skipDays(1);
  return g.state.contracts.standing.offer;
});
console.log('offer', JSON.stringify(offer));
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Jobs board' }).click();
await frames(3);
await shot('offer');
await page.locator('.lt-regular .btn-primary').click();
await q(() => {
  const g = window.__quarry.game;
  const a = g.state.contracts.standing.active;
  g.events.emit('productSold', { machineId: 'm1', bayId: a.material, productId: a.material, tonnes: a.tonnesPerWeek * 0.4, revenue: 40, pricePerTonne: 20, grade: 'Clean', purity: 1 });
});
await frames(4);
await shot('active');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

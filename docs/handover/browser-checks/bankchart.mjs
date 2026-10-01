// The bank's profit chart after a fortnight of trading (good days, a quiet one, a costly one),
// with the pointer over a day. Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/bankchart.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'bankchart';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
await q(() => {
  const g = window.__quarry.game;
  const pattern = [120, 180, 60, 0, 240, -90, 150, 210, 30, 260, 190, -40, 170, 80];
  for (const p of pattern) {
    if (p > 0) g.events.emit('moneyChanged', { amount: p + 40, reason: 'sale', money: g.state.money });
    if (p !== 0) g.events.emit('moneyChanged', { amount: -40 - (p < 0 ? -p : 0), reason: 'fuel', money: g.state.money });
    if (p > 0) g.events.emit('productSold', { machineId: 'm1', bayId: 'topsoil', productId: 'topsoil', tonnes: 2, revenue: p + 40, pricePerTonne: 40, grade: 'Clean', purity: 1 });
    g.dev.skipDays(1);
  }
});
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Bank' }).click();
await frames(3);
await page.locator('.pc-hit').nth(9).hover();
await frames(2);
await shot('bank');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

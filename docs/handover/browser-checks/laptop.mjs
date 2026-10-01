// Screens of the office laptop: the dealer's machine grid and one machine in detail, upgrades,
// sell, home and prices. Opened with the real B / M keys; low graphics so the 3D behind is cheap.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/laptop.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'laptop';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(3); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
// (the blur behind the laptop is very slow in software rendering, and isn't what's checked here)
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
await q(() => { const g = window.__quarry.game; g.state.money = 2600; g.actions.buyMachine('miniDigger', 'rusty'); });
await frames(4);
await page.keyboard.press('KeyB');
await frames(40); // (a product photo per frame)
await shot('dealer-diggers');
await page.locator('.lt-tile').nth(1).click();
await frames(12);
await shot('dealer-detail');
await page.locator('.lt-cat', { hasText: 'Upgrades' }).click();
await frames(8);
await shot('dealer-upgrades');
await page.locator('.lt-cat', { hasText: 'Sell' }).click();
await frames(8);
await shot('dealer-sell');
await page.locator('.lt-dock-app', { hasText: 'Home' }).click();
await frames(4);
await shot('home');
await page.keyboard.press('KeyM');
await frames(4);
await shot('prices');
await page.locator('.lt-dock-app', { hasText: 'Bank' }).click();
await frames(4);
await shot('bank');
await page.locator('.lt-bank .lt-buy').click();
await frames(4);
await shot('bank-loan');
await q(() => { const g = window.__quarry.game; g.events.emit('mentorMessage', { from: 'Ray', text: 'Morning. Topsoil is up at the depot today: worth a run if you have a load ready.', kind: 'tip' }); g.events.emit('productSold', { machineId: 'm1', bayId: 'topsoil', productId: 'topsoil', tonnes: 0.4, revenue: 19.5, pricePerTonne: 48.75, grade: 'Clean', purity: 1 }); g.dev.skipHours(24); });
await page.locator('.lt-dock-app', { hasText: 'Fleet' }).click();
await frames(10);
await shot('fleet');
await page.locator('.lt-dock-app', { hasText: 'Messages' }).click();
await frames(4);
await shot('messages');
await page.locator('.lt-dock-app', { hasText: 'Jobs board' }).click();
await frames(4);
await page.locator('.lt-job .lt-buy').first().click();
await frames(4);
await shot('jobs');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

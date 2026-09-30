// The newer laptop apps: home (weather), fleet (mechanic call-outs), messages (a daily summary)
// and the jobs board (after taking a job). The game's blur behind the laptop is turned off for
// speed (it's very slow in software rendering); everything else is as in the game.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/laptop2.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'laptop2';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
await q(() => {
  const g = window.__quarry.game;
  g.state.money = 2600;
  g.actions.buyMachine('miniDigger', 'rusty');
  g.state.machines[0].condition = 35;
  g.events.emit('mentorMessage', { from: 'Ray', text: 'Morning. Topsoil is up at the depot today: worth a run if you have a load ready.', kind: 'tip' });
  g.events.emit('productSold', { machineId: 'm1', bayId: 'topsoil', productId: 'topsoil', tonnes: 0.4, revenue: 19.5, pricePerTonne: 48.75, grade: 'Clean', purity: 1 });
  g.dev.skipHours(24);
});
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Home' }).click();
await frames(3);
await shot('home');
await page.locator('.lt-dock-app', { hasText: 'Fleet' }).click();
await frames(12);
await shot('fleet');
await page.locator('.lt-dock-app', { hasText: 'Messages' }).click();
await frames(3);
await shot('messages');
await page.locator('.lt-dock-app', { hasText: 'Jobs board' }).click();
await frames(3);
await page.locator('.lt-job .lt-buy').first().click();
await frames(3);
await shot('jobs');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

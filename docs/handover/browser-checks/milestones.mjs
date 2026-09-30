// The Milestones app on the office laptop, part way through a game: some milestones reached
// (with their perks), others under way. Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/milestones.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'milestones';
const { browser, page, errors, q, frames, newGame } = await start({ width: 320, height: 180 });
// The laptop is page UI, so the screenshot doesn't need 3D frames: set up small, then hold the
// render loop and grow the window only for the picture (software rendering is slow).
await page.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__hold = false;
  const held = [];
  window.requestAnimationFrame = (cb) => (window.__hold ? (held.push(cb), 0) : raf(cb));
  window.__release = () => { window.__hold = false; held.splice(0).forEach((f) => raf(f)); };
});
const shot = async (name) => {
  await frames(2);
  await q(() => { window.__hold = true; });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 });
  await page.setViewportSize({ width: 320, height: 180 });
  await q(() => window.__release());
  console.log('shot', name);
};
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
const reached = await q(() => {
  const g = window.__quarry.game;
  const got = [];
  g.events.on('milestoneReached', (e) => got.push(e.id));
  g.state.money = 6000;
  for (const t of ['miniDigger', 'dumper', 'tractor', 'excavator', 'truck']) g.actions.buyMachine(t, 'rusty');
  for (let i = 0; i < 6; i++) {
    g.events.emit('productSold', { machineId: 'm1', bayId: 'topsoil', productId: 'topsoil', tonnes: 3.6, revenue: 176, pricePerTonne: 48.9, grade: 'Clean', purity: 1 });
  }
  g.state.stats.tonnesSold = 96;
  g.state.stats.tonnesDug = 430;
  g.dev.skipDays(1);
  return got;
});
console.log('reached', reached.join(', '));
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Milestones' }).click();
await frames(4);
await shot('app');
const text = await q(() => document.querySelector('.lt-main')?.innerText.slice(0, 400));
console.log(text.replace(/\n+/g, ' | '));
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

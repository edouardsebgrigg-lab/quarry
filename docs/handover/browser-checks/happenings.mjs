// Happenings on the laptop: the home screen's "Coming up", a rush job on the jobs board, a dealer's offer in the plant dealer,
// and the inspector's notice in Messages. The render loop is held for the screenshots (the
// laptop is page UI), as in milestones.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/happenings.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'happenings';
const { browser, page, errors, q, frames, newGame } = await start({ width: 320, height: 180 });
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
const got = await q(() => {
  const g = window.__quarry.game;
  const seen = [];
  g.events.on('*', (t) => { if (['rushOrder', 'dealerOffer', 'inspectionAnnounced'].includes(t)) seen.push(t); });
  g.state.money = 900;
  g.actions.buyMachine('miniDigger', 'rusty');
  g.actions.buyMachine('tractor', 'rusty');
  g.state.machines.find((m) => m.type === 'miniDigger').condition = 30;
  g.state.contracts.done = 1;
  const h = g.data.happenings;
  h.rushOrder.chancePerDay = 1;
  h.dealerOffer.chancePerDay = 1;
  h.dealerOffer.firstDay = 1;
  h.inspector.firstDay = 2;
  h.inspector.everyDays = [1, 1];
  g.dev.skipDays(2);
  return seen;
});
console.log('happened', got.join(', '));
await frames(3);
await page.keyboard.press('KeyB');
await frames(3);
await page.locator('.lt-dock-app', { hasText: 'Home' }).click();
await frames(3);
await shot('home');
await page.locator('.lt-dock-app', { hasText: 'Jobs board' }).click();
await frames(3);
await shot('jobs');
await page.locator('.lt-dock-app', { hasText: 'Plant dealer' }).click();
await frames(3);
const offer = await q(() => document.querySelector('.lt-offer')?.closest('.lt-tile')?.innerText.replace(/\n+/g, ' | '));
console.log('offer tile:', offer ?? '(none shown)');
await shot('dealer');
await page.locator('.lt-dock-app', { hasText: 'Messages' }).click();
await frames(3);
await shot('messages');
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

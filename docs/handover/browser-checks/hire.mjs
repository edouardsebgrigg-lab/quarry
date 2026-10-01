// Hiring out a machine: the enquiry in the Fleet app, sending a machine (it leaves the yard in the
// world), and it coming back days later. Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/hire.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'hire';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
const e = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 20000;
  g.actions.buyMachine('miniDigger', 'used');
  g.actions.buyMachine('excavator', 'rusty');
  for (let i = 0; i < 40 && !g.state.hire?.enquiry; i++) g.dev.skipDays(1);
  return g.state.hire.enquiry;
});
console.log('enquiry', JSON.stringify(e));
await frames(4);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Fleet' }).click();
await frames(12);
await shot('enquiry');
await page.locator('.lt-hire .btn-primary').first().click();
await frames(12);
await shot('away');
const inWorld = await q((type) => {
  const g = window.__quarry.game;
  const m = g.state.machines.find((x) => x.type === type && x.onHire);
  return { away: !!m, vehicle: !!window.__quarry.world.debug.vehicle(m?.id) };
}, e.type);
console.log('while away', JSON.stringify(inWorld));
const back = await q((type) => {
  const g = window.__quarry.game;
  const m = g.state.machines.find((x) => x.type === type && x.onHire);
  g.dev.skipDays(m.onHire.days + 1);
  return { onHire: !!m.onHire, siteId: m.siteId, id: m.id };
}, e.type);
await frames(6);
const vehicleBack = await q((id) => !!window.__quarry.world.debug.vehicle(id), back.id);
console.log('back', JSON.stringify(back), 'vehicle in the yard again', vehicleBack);
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

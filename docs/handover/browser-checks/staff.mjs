// Staff: the Staff app before any post is open, then with two hired (a digger operator on an
// excavator parked in the field and a haulage driver on the truck), and the field a while later.
// Backdrop blur off for speed, as in laptop2.mjs.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/staff.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'staff';
const { browser, page, errors, q, frames, newGame } = await start({ width: 1280, height: 800 });
const shot = async (name) => { await frames(2); await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 }); console.log('shot', name); };
await newGame();
await page.addStyleTag({ content: '.overlay:has(.overlay-laptop) { backdrop-filter: none !important; }' });
const ids = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 60000;
  const ex = g.actions.buyMachine('excavator', 'used').machine.id;
  const tr = g.actions.buyMachine('truck', 'used').machine.id;
  return { ex, tr };
});
await frames(6);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Staff' }).click();
await frames(4);
await shot('locked');
await page.keyboard.press('Escape');
await frames(4);
// Far enough along for two posts; the excavator parked out in the field.
await q((ids) => {
  const g = window.__quarry.game;
  g.state.stats.totalEarned = 25000;
  g.state.contracts.reputation = 5;
  g.actions.buyMachine('dumper', 'rusty');
  g.actions.buyMachine('miniDigger', 'rusty');
  g.dev.skipDays(1);
  window.__quarry.world.debug.placeVehicle(ids.ex, 70, 95, 0.4);
}, ids);
await frames(8);
await page.keyboard.press('KeyB');
await frames(4);
await page.locator('.lt-dock-app', { hasText: 'Staff' }).click();
await frames(4);
await shot('applicants');
// Hire two; the first digs on the excavator, the second drives the truck.
for (let i = 0; i < 2; i++) { await page.locator('.st-applicant .btn-primary').first().click(); await frames(3); }
await page.locator('.st-worker').nth(0).locator('.lt-chip', { hasText: 'Digger operator' }).click();
await frames(3);
await page.locator('.st-worker').nth(1).locator('.lt-chip', { hasText: 'Haulage driver' }).click();
await frames(3);
const chosen = await q(() => window.__quarry.game.state.staff.workers.map((w) => `${w.name}: ${w.role} on ${w.machineId}`));
console.log('assigned', JSON.stringify(chosen));
await frames(4);
await shot('working');
await page.keyboard.press('Escape');
await frames(4);
// Watch the digger at work for a moment, from the side.
await q(() => {
  for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; });
  const d = window.__quarry.world.debug;
  d.teleportPlayer(70, 112);
  d.aimAt(70, 95);
  d.setFootPitch(-0.12);
});
await frames(120);
await shot('field');
const state = await q((ids) => {
  const g = window.__quarry.game;
  const st = g.state.staff.workers.map((w) => ({ name: w.name, role: w.role, status: w.status, stats: w.stats }));
  const truck = g.state.machines.find((m) => m.id === ids.tr);
  return { st, truckAway: !!truck.away, truckInWorld: !!window.__quarry.world.debug.vehicle(ids.tr) };
}, ids);
console.log('state', JSON.stringify(state));
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

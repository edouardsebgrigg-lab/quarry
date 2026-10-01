// Staff at work in the world, without the laptop (quicker): an operator on an excavator parked in
// the field and a driver on the truck; two shots a little apart, then what each has done.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/stafffield.mjs
import { start } from './common.mjs';
const { browser, page, errors, q, frames, newGame } = await start({ width: 480, height: 270 });
await newGame();
const ids = await q(async () => {
  const g = window.__quarry.game;
  g.state.money = 60000;
  const ex = g.actions.buyMachine('excavator', 'used').machine.id;
  const tr = g.actions.buyMachine('truck', 'used').machine.id;
  g.state.stats.totalEarned = 25000;
  g.state.contracts.reputation = 5;
  g.actions.buyMachine('dumper', 'rusty');
  g.actions.buyMachine('miniDigger', 'rusty');
  g.dev.skipDays(1);
  return { ex, tr };
});
await frames(6);
await q((ids) => {
  const g = window.__quarry.game;
  const w = window.__quarry.world;
  w.debug.placeVehicle(ids.ex, 70, 95, 0.4);
  const st = g.state.staff;
  const a = g.actions.hireStaff(st.applicants[0].id).worker;
  const b = g.actions.hireStaff(st.applicants[0].id).worker;
  g.actions.assignStaff(a.id, 'dig', { machineId: ids.ex, spot: w.machinePlacement(ids.ex) });
  g.actions.assignStaff(b.id, 'haul', { machineId: ids.tr });
  for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; });
  w.debug.teleportPlayer(64, 112);
  w.debug.aimAt(72, 92);
  w.debug.setFootPitch(-0.15);
}, ids);
const snap = async (name) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(3);
  await page.screenshot({ path: `${process.env.OUT}/${process.env.TAG ?? 'stafffield'}-${name}.png`, timeout: 300000 });
  await page.setViewportSize({ width: 480, height: 270 }); await frames(2);
  console.log('shot', name);
};
await frames(20);
await snap('a');
await frames(200);
await snap('b');
const state = await q((ids) => {
  const g = window.__quarry.game;
  return { workers: g.state.staff.workers.map((w) => `${w.role}: ${w.status} ${JSON.stringify(w.stats)}`), truckAway: !!g.state.machines.find((m) => m.id === ids.tr).away, truckIn3D: !!window.__quarry.world.debug.vehicle(ids.tr) };
}, ids);
console.log('state', JSON.stringify(state));
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

// Step 5 close-out: the tractor's trailer. Unloading while moving must be refused with a
// message; stopped, the trailer tips (bed animates), the load comes off, a heap appears on the
// ground behind; afterwards the tractor drives and can be loaded again.
import { start } from './common.mjs';
const { browser, errors, q, frames, shot, newGame, lastLog, page } = await start();
await newGame();
const R = {};
const ids = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 5000;
  return { tractor: g.actions.buyMachine('tractor', 'rusty').machine.id, digger: g.actions.buyMachine('miniDigger', 'rusty').machine.id };
});
await frames(4);
await q((ids) => {
  const d = window.__quarry.world.debug;
  d.placeVehicle(ids.tractor, 70, 110, Math.PI / 2); // facing north up the field
  window.__quarry.game.state.machines.find((m) => m.id === ids.tractor).load = { topsoil: 2.4, clay: 0.6 };
  d.enterVehicle(ids.tractor);
  d.setCamMode('chase');
  d.setLook(2.6, -0.1);
}, ids);
await frames(10);
const speed = () => q((id) => window.__quarry.world.debug.vehicle(id).speed(), ids.tractor);
// 1. Moving: tip refused, with a message.
await q(() => window.__quarry.world.debug.setKeys(['forward']));
await page.waitForFunction((id) => window.__quarry.world.debug.vehicle(id).speed() > 2, ids.tractor, { timeout: 300000 });
R.movingSpeed = await speed();
await q(() => window.__quarry.world.handleAction('tip'));
R.movingJob = await q((id) => window.__quarry.game.state.machines.find((m) => m.id === id).job, ids.tractor);
R.movingLog = (await lastLog()).slice(-1)[0];
// 2. Stop (handbrake), then tip.
await q(() => window.__quarry.world.debug.setKeys(['jump']));
await page.waitForFunction((id) => Math.abs(window.__quarry.world.debug.vehicle(id).speed()) < 0.3, ids.tractor, { timeout: 300000 });
await q(() => window.__quarry.world.debug.setKeys([]));
await frames(4);
R.stoppedSpeed = await speed();
const spot = await q((id) => {
  const v = window.__quarry.world.debug.vehicle(id);
  const u = v.unload();
  const x = u.point.x + u.out.x * 1.2;
  const z = u.point.z + u.out.z * 1.2;
  return { x, z, h: window.__quarry.game.ctx.ground.heightAt(x, z), total: Object.values(window.__quarry.game.ctx.ground.totals()).reduce((a, b) => a + b, 0) };
}, ids.tractor);
R.hud = await q(() => window.__quarry.world.hudInfo().prompt);
await q(() => window.__quarry.world.handleAction('tip'));
R.job = await q((id) => { const j = window.__quarry.game.state.machines.find((m) => m.id === id).job; return j && { type: j.type, duration: j.duration, params: j.params }; }, ids.tractor);
let maxBed = 0;
for (let i = 0; i < 12; i++) {
  await frames(3);
  const b = await q((id) => window.__quarry.world.debug.vehicle(id).trailer.state.bed, ids.tractor);
  maxBed = Math.max(maxBed, b);
  if (i === 5) await shot('90-trailer-tipping');
}
R.maxBedAngle = maxBed;
await page.waitForFunction((id) => !window.__quarry.game.state.machines.find((m) => m.id === id).job, ids.tractor, { timeout: 300000 });
R.loadAfter = await q((id) => window.__quarry.game.state.machines.find((m) => m.id === id).load, ids.tractor);
const after = await q((s) => ({ h: window.__quarry.game.ctx.ground.heightAt(s.x, s.z), total: Object.values(window.__quarry.game.ctx.ground.totals()).reduce((a, b) => a + b, 0) }), spot);
R.heapRise = after.h - spot.h;
R.groundTonnesAdded = after.total - spot.total;
await page.waitForFunction((id) => window.__quarry.world.debug.vehicle(id).trailer.state.bed < 0.01, ids.tractor, { timeout: 300000 });
R.bedDown = true;
await shot('91-trailer-tipped');
// 3. Drive on, then load it again with the mini digger.
const p0 = await q((id) => window.__quarry.world.debug.vehicle(id).position().toArray(), ids.tractor);
await q(() => window.__quarry.world.debug.setKeys(['forward']));
await frames(40);
await q(() => window.__quarry.world.debug.setKeys(['jump']));
await page.waitForFunction((id) => Math.abs(window.__quarry.world.debug.vehicle(id).speed()) < 0.3, ids.tractor, { timeout: 300000 });
await q(() => window.__quarry.world.debug.setKeys([]));
const p1 = await q((id) => window.__quarry.world.debug.vehicle(id).position().toArray(), ids.tractor);
R.droveMetres = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
R.reload = await q(([t, dg]) => {
  const g = window.__quarry.game;
  const d = window.__quarry.world.debug;
  const v = d.vehicle(t);
  const bed = v.bedWorld();
  d.placeVehicle(dg, bed.x + 3.2, bed.z, Math.PI);
  g.state.machines.find((m) => m.id === dg).load = { topsoil: 0.1 };
  return { dump: g.actions.dumpBucket(dg, { machineId: t }), load: g.state.machines.find((m) => m.id === t).load };
}, [ids.tractor, ids.digger]);
console.log(JSON.stringify(R, null, 1));
console.log('errors', errors.slice(0, 10).join('\n'));
await browser.close();

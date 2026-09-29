// Step 7 smoke check in the browser: plan, preview, adjust, cancel, invalid, build a road and a ramp,
// drive across both, save, reload, and check it all persisted. Real DOM key / mouse events on the
// game canvas, with the pointer lock itself under the test's control (headless Chrome can't grant it
// reliably) and the aim set by setting the look angles. Frame-counted, bounded.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT;
const W = 480, H = 270;
setTimeout(() => { console.log('TIMEOUT: overall bound hit'); process.exit(2); }, 20 * 60 * 1000);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(240000);
await page.addInitScript(() => {
  if (!localStorage.getItem('quarry.settings')) localStorage.setItem('quarry.settings', JSON.stringify({ graphics: 'low', fullscreen: false, volume: 0 }));
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
  document.exitPointerLock = () => { if (window.__lockEl) { window.__lockEl = null; document.dispatchEvent(new Event('pointerlockchange')); } };
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const q = (fn, arg) => page.evaluate(fn, arg);
const frames = (n) => q((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const lock = (on) => q((on) => { window.__lockEl = on ? document.querySelector('.world-canvas') : null; document.dispatchEvent(new Event('pointerlockchange')); }, on);
const mouse = (button, type = 'both') => q(([button, type]) => {
  const c = document.querySelector('.world-canvas');
  if (type !== 'up') c.dispatchEvent(new MouseEvent('mousedown', { button, bubbles: true }));
  if (type !== 'down') window.dispatchEvent(new MouseEvent('mouseup', { button, bubbles: true }));
}, [button, type]);
const wheel = (dy) => q((dy) => document.querySelector('.world-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true })), dy);
const shot = async (name) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(4);
  await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 240000 });
  await page.setViewportSize({ width: W, height: H }); await frames(2);
  console.log('shot', name);
};
const same0 = (a, b) => Math.abs(a.money - b.money) < 1e-9 && Math.abs(a.tonnes - b.tonnes) < 0.01 && Math.abs(a.h - b.h) < 1e-6;
const out = (k, v) => console.log(k, typeof v === 'string' ? v : JSON.stringify(v));
const world = () => 'window.__quarry.world';
const snap = () => q(() => {
  const g = window.__quarry.game.ctx.ground;
  const tot = g.totals();
  return { money: window.__quarry.game.state.money, tonnes: Object.values(tot).reduce((a, b) => a + b, 0), h: g.heightAt(50, 60), surf: g.surfaceAt(50, 60) };
});
const card = () => q(() => {
  const c = document.querySelector('.works-card');
  if (!c || getComputedStyle(c).display === 'none') return null;
  return { title: c.querySelector('.wk-title').textContent, rows: [...c.querySelectorAll('.wk-row')].map((r) => r.textContent), note: c.querySelector('.wk-note')?.textContent ?? null, mode: c.querySelector('.wk-mode.on')?.textContent };
});
const prompt = () => q(() => { const p = document.querySelector('.prompt'); return p && getComputedStyle(p).display !== 'none' ? p.textContent : null; });
const feed = () => q(() => [...document.querySelectorAll('.log-line, .toast, .message')].map((e) => e.textContent).slice(-3));
const aim = async (x, z) => { await q(([x, z]) => window.__quarry.world.debug.aimAt(x, z), [x, z]); await frames(2); };
const stand = async (x, z) => { await q(([x, z]) => window.__quarry.world.debug.teleportPlayer(x, z, 0), [x, z]); await frames(3); };
const pl = () => q(() => { const s = window.__quarry.world.debug.planner.state; return { active: s.active, mode: s.mode, width: s.width, a: s.a, b: s.b, ok: s.plan?.ok ?? null, reason: s.plan?.reason ?? null, cost: s.plan?.cost ?? null }; });

// ---- start
await page.goto('http://localhost:5174/');
await page.getByText('New Game').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 240000 });
await page.getByText("Let's get to work").click();
await lock(true);
await q(() => { window.__quarry.gate.force(true); window.__quarry.game.dev.addMoney(3000); });
// Heaps of gravel to build with, tipped on the field the way the game's tip jobs do.
await q(() => { const a = window.__quarry.game.actions; a.dumpGround({ x: 52, z: 84, tonnes: { gravel: 70 }, radius: 2.5 }); a.dumpGround({ x: 112, z: 84, tonnes: { gravel: 70 }, radius: 2.5 }); });
await frames(3);
out('S0 money', (await snap()).money);

// ---- S1: open the planner with the key (a real key event) and look at the card
await stand(50, 50);
const base = await snap();
await page.keyboard.press('KeyF');
await frames(3);
out('S1 planner', await pl());
out('S1 card', await card());
out('S1 prompt', await prompt());

// ---- S2: set the start, then hover the end: a preview, and nothing changes
await aim(40, 60);
await mouse(0);
await frames(2);
await aim(60, 60);
await frames(3);
out('S2 start set', await pl());
out('S2 card', await card());
const previewed = await snap();
out('S2 preview leaves money/ground alone', same0(previewed, base) ? true : { base, previewed });
await shot('works-preview-road');

// ---- S3: set the end, adjust the width with the wheel, step back, cancel
await mouse(0);
await frames(2);
out('S3 end set', await pl());
await wheel(-100);
await frames(2);
const wide = (await pl()).width;
await wheel(100);
await wheel(100);
await frames(2);
const narrow = (await pl()).width;
out('S3 width after wheel up / down twice', { wide, narrow });
await mouse(2); await frames(2);
out('S3 RMB once (back to the end)', await pl());
await mouse(2); await frames(2);
out('S3 RMB twice (start cleared)', await pl());
await mouse(2); await frames(2);
out('S3 RMB thrice (cancelled)', await pl());
const cancelled = await snap();
out('S3 cancel loses nothing', same0(cancelled, base) ? true : { base, cancelled });

// ---- S4: invalid placements give a clear reason, and a click can't build them
const tryInvalid = async (name, mode, a, b, width = 4) => {
  await q(([mode, a, b, width]) => window.__quarry.world.debug.planner.set({ mode, a, b, width }), [mode, a, b, width]);
  await frames(2);
  const c = await card();
  out(`S4 ${name}`, { ok: (await pl()).ok, note: c?.note });
};
await q(() => window.__quarry.world.debug.planner.cancel());
await tryInvalid('too short', 'road', { x: 40, z: 60 }, { x: 42, z: 60 });
await tryInvalid('too long', 'road', { x: 20, z: 60 }, { x: 90, z: 60 });
await tryInvalid('edge of the land', 'road', { x: 2, z: 60 }, { x: 20, z: 60 });
await tryInvalid('no gravel near', 'road', { x: 20, z: 130 }, { x: 40, z: 130 });
await q(() => { const g = window.__quarry.game.ctx.ground; g.dig({ x: 84, z: 40, radius: 3, bottomY: g.heightAt(84, 40) - 2.6 }); });
await tryInvalid('too steep', 'road', { x: 70, z: 40 }, { x: 84, z: 40 });
// a vehicle in the way
const pickup = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'pickup'));
await q((p) => window.__quarry.world.debug.placeVehicle(p.id, 50, 61, 0), pickup);
await frames(3);
await tryInvalid('machine in the way', 'road', { x: 40, z: 60 }, { x: 60, z: 60 });
await q((p) => window.__quarry.world.debug.placeVehicle(p.id, 20, 20, 0), pickup);
await frames(3);
// can't afford
await q(() => { window.__quarry.game.state.money = 10; });
await tryInvalid('cannot afford', 'road', { x: 40, z: 60 }, { x: 60, z: 60 });
const before = await snap();
await mouse(0); await frames(1); // (the planner has both points set: this is the "confirm" click)
await stand(50, 50);
await aim(60, 60);
await mouse(0);
await frames(3);
const after = await snap();
out('S4 refused build changes nothing', same0(after, before) ? true : { before, after });
out('S4 message', await feed());
await q(() => { window.__quarry.game.state.money = 3000; window.__quarry.world.debug.planner.cancel(); });

// ---- S5: build one short road with real clicks
await stand(50, 50);
const b0 = await snap();
await page.keyboard.press('KeyF'); await frames(2);
await aim(40, 60); await mouse(0); await frames(2);
await aim(60, 60); await mouse(0); await frames(3);
const plan = await q(() => { const p = window.__quarry.world.debug.planner.state.plan; return { ok: p.ok, cost: p.cost, cut: p.cutTonnes, surface: p.surfaceTonnes, heaps: p.heapTonnes, spoil: p.spoilTonnes, grade: p.grade }; });
out('S5 plan', plan);
out('S5 card before confirm', await card());
await mouse(0); await frames(4); // confirm
const b1 = await snap();
out('S5 built', { spent: b0.money - b1.money, expected: plan.cost, tonnesBefore: b0.tonnes, tonnesAfter: b1.tonnes, surfaceMid: b1.surf, heightBefore: b0.h, heightAfter: b1.h });
out('S5 state after', await pl());
out('S5 message', await feed());
await q(() => window.__quarry.world.debug.planner.cancel());
await frames(6);
await shot('works-road-built');

// ---- S6: drive the pickup across the road
const drive = async (id, x0, z0, yaw, target, maxFrames = 160) => {
  await q(([id, x0, z0, yaw]) => { const d = window.__quarry.world.debug; d.enterVehicle(id); d.placeVehicle(id, x0, z0, yaw); }, [id, x0, z0, yaw]);
  await frames(4);
  await q(() => window.__quarry.world.debug.setKeys(['forward']));
  const t = { x0, frames: 0, maxY: -1e9, minY: 1e9 };
  for (let i = 0; i < maxFrames; i += 8) {
    await frames(8);
    const m = await q((id) => window.__quarry.world.mapInfo().vehicles.find((m) => m.id === id), id);
    const y = await q(([x, z]) => window.__quarry.world.debug.land.heightAt(x, z), [m.x, m.z]);
    t.frames = i + 8; t.x = m.x; t.z = m.z; t.y = y; t.maxY = Math.max(t.maxY, y); t.minY = Math.min(t.minY, y);
    if (m.x >= target) break;
  }
  await q(() => window.__quarry.world.debug.setKeys(['back']));
  for (let i = 0; i < 20; i++) { await frames(4); if ((await q(() => window.__quarry.world.hudInfo().machine?.speedKmh ?? 0)) < 2) break; }
  await q(() => window.__quarry.world.debug.setKeys(['jump']));
  await frames(6);
  await q(() => window.__quarry.world.debug.setKeys([]));
  return t;
};
const id = pickup.id;
out('S6 pickup across the road', await drive(id, 34, 60, 0, 62));
await q(() => window.__quarry.world.debug.exitVehicle());
out('   on foot', await q(() => window.__quarry.world.hudInfo().mode));
await frames(2);

// ---- S7: a ramp out of a pit (the pit dug like a digger would)
await q(() => { const g = window.__quarry.game.ctx.ground; window.__quarry.game.actions.digGround({ x: 100, z: 60, radius: 5, bottomY: g.heightAt(100, 60) - 1.4 }); });
await frames(3);
await stand(104, 50);
const r0 = await snap();
await page.keyboard.press('KeyF'); await frames(2);
await page.keyboard.press('KeyF'); await frames(2); // cycle: ramp
out('S7 mode after F', (await pl()).mode);
await aim(98, 60); await mouse(0); await frames(2);
await aim(120, 60); await mouse(0); await frames(3);
out('S7 card (ramp)', await card());
const rplan = await q(() => { const p = window.__quarry.world.debug.planner.state.plan; return { ok: p.ok, cost: p.cost, grade: p.grade, reason: p.reason }; });
out('S7 plan', rplan);
await mouse(0); await frames(4);
const r1 = await snap();
out('S7 ramp built', { ok: rplan.ok, spent: r0.money - r1.money, expected: rplan.cost });
await q(() => window.__quarry.world.debug.planner.cancel());
await frames(6);
await shot('works-ramp-built');
const rampTop = await q(() => window.__quarry.world.debug.land.heightAt(118, 60));
const rampBottom = await q(() => window.__quarry.world.debug.land.heightAt(98, 60));
out('S7 ramp rises', { bottom: rampBottom, top: rampTop });
out('S7 pickup up the ramp', await drive(id, 92, 60, 0, 119, 200));
await q(() => window.__quarry.world.debug.exitVehicle());
out('   on foot', await q(() => window.__quarry.world.hudInfo().mode));

// ---- S8: save, reload, check it all persisted
const preSave = await q(() => { const g = window.__quarry.game.ctx.ground; return { money: window.__quarry.game.state.money, road: [g.heightAt(45, 60), g.heightAt(55, 60)], ramp: [g.heightAt(105, 60), g.heightAt(115, 60)], surf: [g.surfaceAt(50, 60), g.surfaceAt(110, 60)], built: [g.cellBuilt(100, 120), g.cellBuilt(220, 120)] }; });
await q(() => window.__quarry.saveTo('works1'));
await page.reload();
await page.getByText('Continue').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 240000 });
await lock(true);
await q(() => window.__quarry.gate.force(true));
await frames(6);
const postLoad = await q(() => { const g = window.__quarry.game.ctx.ground; return { money: window.__quarry.game.state.money, road: [g.heightAt(45, 60), g.heightAt(55, 60)], ramp: [g.heightAt(105, 60), g.heightAt(115, 60)], surf: [g.surfaceAt(50, 60), g.surfaceAt(110, 60)], built: [g.cellBuilt(100, 120), g.cellBuilt(220, 120)] }; });
out('S8 before save', preSave);
out('S8 after load', postLoad);
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.02);
out('S8 persisted', { money: preSave.money === postLoad.money, road: same(preSave.road, postLoad.road), ramp: same(preSave.ramp, postLoad.ramp), surf: JSON.stringify(preSave.surf) === JSON.stringify(postLoad.surf), built: JSON.stringify(preSave.built) === JSON.stringify(postLoad.built) });
// the loaded world's colliders carry the pickup across again
const pk = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'pickup'));
out('S8 pickup across the loaded road', await drive(pk.id, 34, 60, 0, 62));
await q(() => window.__quarry.world.debug.exitVehicle());
out('   on foot', await q(() => window.__quarry.world.hudInfo().mode));
await stand(50, 50); await aim(50, 60); await frames(4);
await shot('works-after-load');
out('errors', errors.join('\n'));
await browser.close();

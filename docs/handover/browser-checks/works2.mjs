// Step 7 smoke check, part 2: ramps out of a pit (gentle and steep), driving them, save, reload, persistence.
// drive across both, save, reload, and check it all persisted. Real DOM key / mouse events on the
// game canvas, with the pointer lock itself under the test's control (headless Chrome can't grant it
// reliably) and the aim set by setting the look angles. Frame-counted, bounded.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT;
const W = 320, H = 180;
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
await q(() => { const a = window.__quarry.game.actions; a.dumpGround({ x: 52, z: 84, tonnes: { gravel: 70 }, radius: 2.5 }); a.dumpGround({ x: 112, z: 86, tonnes: { gravel: 90 }, radius: 2.5 }); });
const pickup = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'pickup'));
const id = pickup.id;

const drive = async (vid, x0, z0, yaw, done, maxFrames = 200) => {
  await q(([vid, x0, z0, yaw]) => { const d = window.__quarry.world.debug; d.enterVehicle(vid); d.placeVehicle(vid, x0, z0, yaw); }, [vid, x0, z0, yaw]);
  await frames(4);
  await q(() => window.__quarry.world.debug.setKeys(['forward']));
  const t = { from: [x0, z0], frames: 0, minY: 1e9, maxY: -1e9, reached: false };
  for (let i = 0; i < maxFrames; i += 8) {
    await frames(8);
    const m = await q((vid) => window.__quarry.world.mapInfo().vehicles.find((m) => m.id === vid), vid);
    t.x = +m.x.toFixed(2); t.z = +m.z.toFixed(2); t.frames = i + 8;
    const y = await q(([x, z]) => window.__quarry.world.debug.land.heightAt(x, z), [m.x, m.z]);
    t.y = +y.toFixed(2); t.minY = Math.min(t.minY, t.y); t.maxY = Math.max(t.maxY, t.y);
    if (done(m)) { t.reached = true; break; }
  }
  await q(() => window.__quarry.world.debug.setKeys(['back']));
  for (let i = 0; i < 20; i++) { await frames(4); if ((await q(() => window.__quarry.world.hudInfo().machine?.speedKmh ?? 0)) < 2) break; }
  await q(() => window.__quarry.world.debug.setKeys(['jump']));
  await frames(6);
  await q(() => window.__quarry.world.debug.setKeys([]));
  await q(() => window.__quarry.world.debug.exitVehicle());
  return t;
};
const cell = (x, z) => q(([x, z]) => { const g = window.__quarry.game.ctx.ground; return g.cellBuilt(Math.floor((x - g.x0) / g.cellSize), Math.floor((z - g.z0) / g.cellSize)); }, [x, z]);
const profile = (xs, z = 60) => q(([xs, z]) => { const g = window.__quarry.game.ctx.ground; return xs.map((x) => +g.heightAt(x, z).toFixed(2)); }, [xs, z]);
const XS = [92, 95, 98, 100, 102, 104, 108, 112, 116, 120, 122];

// a pit, dug like a digger would
await q(() => { const g = window.__quarry.game.ctx.ground; window.__quarry.game.actions.digGround({ x: 100, z: 60, radius: 5, bottomY: g.heightAt(100, 60) - 1.4 }); });
await frames(3);
out('R0 pit profile x=' + XS.join(','), await profile(XS));

// ---- R1: a gentle ramp out of the pit, with real clicks (standing where you can see the pit floor)
await stand(102, 60); // (in the pit, where the floor can be seen)
const m0 = (await snap()).money;
await page.keyboard.press('KeyF'); await frames(2);
await page.keyboard.press('KeyF'); await frames(2);
out('R1 mode', (await pl()).mode);
await aim(100, 60); await mouse(0); await frames(2);
await aim(122, 60); await mouse(0); await frames(3);
out('R1 start/end', await q(() => { const s = window.__quarry.world.debug.planner.state; return { a: s.a, b: s.b }; }));
out('R1 card', await card());
await shot('works-ramp-preview');
const p1 = (await pl());
await mouse(0); await frames(4);
const m1 = (await snap()).money;
out('R1 built', { plan: p1, spent: m0 - m1 });
out('R1 profile', await profile(XS));
await q(() => window.__quarry.world.debug.planner.cancel());

// ---- R2: a steeper ramp out the other way (points set directly, built with the real confirm click)
await stand(108, 60);
await q(() => window.__quarry.world.debug.planner.set({ mode: 'ramp', a: { x: 100, z: 60 }, b: { x: 92, z: 60 } }));
await frames(3);
out('R2 card', await card());
const m2a = (await snap()).money;
await mouse(0); await frames(4);
out('R2 built', { spent: m2a - (await snap()).money, planner: await pl() });
await q(() => window.__quarry.world.debug.planner.cancel());
out('R2 profile', await profile(XS));
await frames(8);
await shot('works-ramps-built');

// ---- drive them: up the gentle one, out through the steep one
out('R3 pickup up the gentle ramp', await drive(id, 99, 60, 0, (m) => m.x >= 121));
out('R4 pickup up the steep ramp', await drive(id, 101, 60, Math.PI, (m) => m.x <= 93));
// the tracked dumper (tracks follow the ground) on the steep one too
const bought = await q(() => window.__quarry.game.actions.buyMachine('dumper', 'rusty'));
out('R5 bought dumper', bought.ok ?? bought);
await frames(6);
const dumper = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'dumper'));
if (dumper) out('R5 dumper up the steep ramp', await drive(dumper.id, 101, 60, Math.PI, (m) => m.x <= 93, 160));

// ---- save, reload, check it all persisted
const state = () => q(() => { const g = window.__quarry.game.ctx.ground; return { money: window.__quarry.game.state.money, ramp: [102, 110, 118].map((x) => +g.heightAt(x, 60).toFixed(2)), steep: [94, 97].map((x) => +g.heightAt(x, 60).toFixed(2)), surf: [g.surfaceAt(110, 60), g.surfaceAt(96, 60)] }; });
const built = async () => [await cell(110, 60), await cell(96, 60), await cell(150, 20)];
const pre = { ...(await state()), built: await built() };
await q(() => window.__quarry.saveTo('slot1'));
await page.reload();
await page.getByText('Continue').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 240000 });
await lock(true);
await q(() => window.__quarry.gate.force(true));
await frames(6);
const post = { ...(await state()), built: await built() };
out('S8 before save', pre);
out('S8 after load ', post);
out('S8 persisted', JSON.stringify(pre) === JSON.stringify(post));
const pk = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'pickup'));
out('S8 pickup up the loaded gentle ramp', await drive(pk.id, 99, 60, 0, (m) => m.x >= 121));
await stand(108, 60); await aim(112, 60); await frames(4);
await shot('works-after-load');
out('errors', errors.join('\n'));
await browser.close();

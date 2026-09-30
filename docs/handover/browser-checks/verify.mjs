// Step 7 verification: road + ramp + level area built, save/reload persistence, dumper on the steep ramp, clock stops on blur/hidden.
// drive across both, save, reload, and check it all persisted. Real DOM key / mouse events on the
// game canvas, with the pointer lock itself under the test's control (headless Chrome can't grant it
// reliably) and the aim set by setting the look angles. Frame-counted, bounded.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT;
const W = 320, H = 180;
setTimeout(() => { console.log('TIMEOUT: overall bound hit'); process.exit(2); }, 14 * 60 * 1000);
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
await q(() => { const a = window.__quarry.game.actions; a.dumpGround({ x: 52, z: 84, tonnes: { gravel: 70 }, radius: 2.5 }); a.dumpGround({ x: 112, z: 86, tonnes: { gravel: 90 }, radius: 2.5 }); a.dumpGround({ x: 25, z: 128, tonnes: { topsoil: 40 }, radius: 2.5 }); });
await q(() => { const g = window.__quarry.game.ctx.ground; window.__quarry.game.actions.digGround({ x: 100, z: 60, radius: 5, bottomY: g.heightAt(100, 60) - 1.4 }); });
await frames(3);
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
const money = () => q(() => window.__quarry.game.state.money);
const tonnes = () => q(() => Object.values(window.__quarry.game.ctx.ground.totals()).reduce((a, b) => a + b, 0));
// Build with the planner: points set directly, then the real third left click confirms.
async function build(name, mode, a, b, width) {
  await q(() => window.__quarry.world.debug.planner.cancel());
  const p = await q(([mode, a, b, width]) => { const pl = window.__quarry.world.debug.planner.set({ mode, a, b, width }); return { ok: pl.ok, cost: pl.cost, reason: pl.reason ?? null, grade: pl.grade }; }, [mode, a, b, width]);
  // stand a few metres off the middle and look at it, so the click lands on the ground
  const mx = (a.x + b.x) / 2; const mz = (a.z + b.z) / 2;
  await stand(mx, mz + width / 2 + 6); await aim(mx, mz);
  const m0 = await money(); const t0 = await tonnes();
  await mouse(0); await frames(4);
  const m1 = await money(); const t1 = await tonnes();
  const r = { plan: p, spent: +(m0 - m1).toFixed(2), priceMatches: Math.abs(m0 - m1 - p.cost) < 1e-6, tonnesKept: Math.abs(t1 - t0) < 0.01 };
  out(name, r);
  return r;
}
await stand(80, 40);
const road = await build('V1 road', 'road', { x: 40, z: 60 }, { x: 60, z: 60 }, 4);
const gentle = await build('V1 gentle ramp', 'ramp', { x: 100, z: 60 }, { x: 122, z: 60 }, 4);
const steep = await build('V1 steep ramp', 'ramp', { x: 100, z: 60 }, { x: 92, z: 60 }, 4);

// ---- V2: a level area
const level = await build('V2 level area', 'level', { x: 20, z: 110 }, { x: 30, z: 110 }, 8);
const flat = await q(() => { const g = window.__quarry.game.ctx.ground; const hs = []; for (let x = 21; x <= 29; x += 2) for (let z = 108; z <= 112; z += 2) hs.push(g.heightAt(x, z)); return { spread: +(Math.max(...hs) - Math.min(...hs)).toFixed(3), n: hs.length }; });
out('V2 level flatness (max - min height over the pad, m)', flat);
await q(() => window.__quarry.world.debug.planner.cancel());

// ---- V3: save, reload, Continue, compare
const snapshot = () => q(() => {
  const g = window.__quarry.game.ctx.ground;
  const c = (x, z) => g.cellBuilt(Math.floor((x - g.x0) / g.cellSize), Math.floor((z - g.z0) / g.cellSize));
  const pts = [[45, 60], [55, 60], [102, 60], [110, 60], [118, 60], [94, 60], [97, 60], [23, 110], [27, 110]];
  return {
    money: window.__quarry.game.state.money,
    heights: pts.map(([x, z]) => +g.heightAt(x, z).toFixed(3)),
    surface: pts.map(([x, z]) => g.surfaceAt(x, z)),
    built: pts.map(([x, z]) => c(x, z)).concat([c(140, 20)]),
    stats: window.__quarry.game.state.stats.works ?? null,
  };
});
const pre = await snapshot();
await q(() => window.__quarry.saveTo('slot1'));
await page.reload();
await page.getByText('Continue').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 240000 });
await frames(4);
const post = await snapshot();
out('V3 before save', pre);
out('V3 after load ', post);
out('V3 persisted identical', JSON.stringify(pre) === JSON.stringify(post));

// ---- V4: the clock on blur / hidden (on the loaded game, real gate, not forced)
const tick = () => q(() => window.__quarry.game.state.time.tick);
const count = async (n) => { const t = await tick(); await frames(n); return { ticks: (await tick()) - t, running: await q(() => window.__quarry.gate.running()) }; };
out('V4 loaded, before the click', await count(8));
await lock(true);
out('V4 playing', await count(8));
await q(() => { document.hasFocus = () => false; window.dispatchEvent(new Event('blur')); });
out('V4 window blurred', await count(8));
await q(() => { delete document.hasFocus; window.dispatchEvent(new Event('focus')); });
out('V4 focus back', await count(8));
await q(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
out('V4 tab hidden', await count(8));
await page.waitForTimeout(5000); // five real seconds hidden
const hiddenLong = await count(2);
out('V4 hidden, after 5 s more', hiddenLong);
await q(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
out('V4 first 2 frames back (no catch-up: at most ~1 tick a frame)', await count(2));
out('V4 visible again', await count(8));

// ---- V5: drive the loaded ramps (the dumper on the steep one)
await q(() => window.__quarry.gate.force(true));
const pk = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'pickup'));
out('V5 pickup up the loaded gentle ramp', await drive(pk.id, 99, 60, 0, (m) => m.x >= 121, 160));
const bought = await q(() => window.__quarry.game.actions.buyMachine('dumper', 'rusty'));
out('V5 bought dumper', bought.ok);
await frames(6);
const dumper = await q(() => window.__quarry.world.mapInfo().vehicles.find((m) => m.type === 'dumper'));
out('V5 dumper up the steep ramp', await drive(dumper.id, 101, 60, Math.PI, (m) => m.x <= 93, 160));
await stand(108, 66); await aim(100, 60); await frames(4);
await shot('verify-after-load');
out('errors', errors.join('\n') || '(none)');
await browser.close();

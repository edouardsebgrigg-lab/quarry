// Step 7: tractor/trailer and mini digger on built ramps out of a pit. No save/load check here.
// ONLY_MINI=1 skips the tractor phases; run that mode with timeout 1200 for task T3.
// Real canvas confirmation events, stubbed pointer lock, code-set aim and held-key debug hook.
// Frame-counted; slow track travel has a larger budget than road vehicles.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ONLY_MINI = process.env.ONLY_MINI === '1';
const OUT = process.env.OUT;
const W = 320, H = 180;
setTimeout(() => { console.log('TIMEOUT: overall bound hit'); process.exit(2); }, (ONLY_MINI ? 20 : 14) * 60 * 1000).unref();
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

try {
// ---- start
await page.goto(process.env.QUARRY_URL || 'http://localhost:5174/');
await page.getByText('New Game').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 240000 });
await page.getByText("Let's get to work").click();
await lock(true);
await q(() => { window.__quarry.gate.force(true); window.__quarry.game.dev.addMoney(20000); });
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
    if (ONLY_MINI && (i + 8) % 40 === 0) out('mini drive progress', t);
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

await build('T0 gentle ramp', 'ramp', { x: 100, z: 60 }, { x: 122, z: 60 }, 5);
await build('T0 steep ramp', 'ramp', { x: 100, z: 60 }, { x: 92, z: 60 }, 5);
await q(() => window.__quarry.world.debug.planner.cancel());
const buy = (type) => q((type) => { const r = window.__quarry.game.actions.buyMachine(type, 'rusty'); return r.ok ? r.machine.id : null; }, type);
const tractor = ONLY_MINI ? null : await buy('tractor');
const digger = await buy('miniDigger');
out('T0 bought', { tractor, digger });
await frames(6);
if (!ONLY_MINI) {
  out('T1 tractor + trailer up the gentle ramp', await drive(tractor, 99, 60, 0, (m) => m.x >= 121, 200));
  out('T1 trailer', await q((id) => { const v = window.__quarry.world.debug.vehicle?.(id); return v?.trailerState?.() ?? null; }, tractor));
  out('T2 tractor + trailer up the steep ramp', await drive(tractor, 101, 60, Math.PI, (m) => m.x <= 93, 200));
}
const steep = await drive(digger, 101, 60, Math.PI, (m) => m.x <= 93, 400);
out('T3 mini digger up the steep ramp', steep);
assert.equal(steep.reached, true, JSON.stringify(steep));
const gentle = await drive(digger, 99, 60, 0, (m) => m.x >= 121, 720);
out('T4 mini digger up the gentle ramp', gentle);
assert.equal(gentle.reached, true, JSON.stringify(gentle));
if (!ONLY_MINI) {
  await stand(110, 68); await aim(104, 60); await frames(4);
  await shot('ramps-machines');
}
out('errors', errors.join('\n') || '(none)');
assert.deepEqual(errors, []);
} finally { await browser.close(); }

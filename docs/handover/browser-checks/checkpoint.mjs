// Bounded cloud smoke: code-set points, planner confirmation, actual localStorage reload.
// Pointer lock is stubbed; this is not a manual mouse/pacing check.
// PLAYWRIGHT_MODULE may be a file URL or absolute module path outside this repository.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('quarry.settings', JSON.stringify({ graphics: 'low', fullscreen: false, volume: 0 }));
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
  document.exitPointerLock = () => { window.__lockEl = null; document.dispatchEvent(new Event('pointerlockchange')); };
});
const q = (fn, arg) => page.evaluate(fn, arg);
const frames = n => q(n => new Promise(resolve => {
  let left = n; const step = () => --left <= 0 ? resolve() : requestAnimationFrame(step); requestAnimationFrame(step);
}), n);
const start = async () => {
  await page.waitForFunction(() => window.__quarry?.world);
  await q(() => { window.__lockEl = document.querySelector('.world-canvas'); document.dispatchEvent(new Event('pointerlockchange')); window.__quarry.gate.force(true); });
};
try {
  await page.goto(process.env.QUARRY_URL || 'http://127.0.0.1:5174');
  await page.getByText('New Game', { exact: true }).click();
  await page.waitForFunction(() => window.__quarry?.world);
  await page.getByText("Let's get to work", { exact: true }).click();
  await start();
  const result = await q(() => {
    const { game, world } = window.__quarry; const g = game.ctx.ground;
    game.state.money = 10000;
    world.debug.teleportPlayer(30, 30, 0);
    g.deposit({ x: 50, z: 82, tonnes: { gravel: 150 }, radius: 3 });
    const totals = () => ({ ...g.totals() });
    const before = totals();
    const specs = [
      { mode: 'road', ax: 40, az: 60, bx: 60, bz: 60, width: 4 },
      { mode: 'ramp', ax: 80, az: 60, bx: 100, bz: 60, width: 4 },
      { mode: 'level', ax: 20, az: 110, bx: 30, bz: 110, width: 8 },
    ];
    // Move the dug material into a heap, so the test itself conserves it too.
    const cut = g.dig({ x: 80, z: 60, radius: 5, bottomY: g.heightAt(80, 60) - 1.4 });
    g.deposit({ x: 92, z: 82, tonnes: cut.tonnes, radius: 3 });
    g.deposit({ x: 92, z: 82, tonnes: { gravel: 150 }, radius: 3 });
    const supplied = totals();
    const checks = specs.map(s => {
      const planner = world.debug.planner;
      const plan = planner.set({ mode: s.mode, a: { x: s.ax, z: s.az }, b: { x: s.bx, z: s.bz }, width: s.width });
      const money = game.state.money;
      const done = planner.confirm(); planner.cancel();
      return { mode: s.mode, planOK: plan.ok, ok: done.ok, reason: done.reason, cost: plan.cost, charged: money - game.state.money };
    });
    return { checks, supplied, after: totals(), before };
  });
  for (const c of result.checks) { assert.equal(c.ok, true, JSON.stringify(c)); assert.equal(c.charged, c.cost); }
  for (const [m, t] of Object.entries(result.supplied)) assert.ok(Math.abs(t - result.after[m]) < 0.01, `conservation ${m}`);
  console.log('build and conservation', JSON.stringify(result.checks));
  await frames(15);
  const snapshot = () => q(() => {
    const { game, world } = window.__quarry; const g = game.ctx.ground;
    const pts = [[50,60],[84,60],[94,60],[25,110]];
    return { money: game.state.money, works: game.state.stats.works, buildings: game.state.buildings,
      cells: pts.map(([x,z]) => ({ h: +g.heightAt(x,z).toFixed(3), surface: g.surfaceAt(x,z), built: g.cellBuilt(Math.floor((x-g.x0)/g.cellSize),Math.floor((z-g.z0)/g.cellSize)) })) };
  });
  await page.keyboard.press('KeyB');
  await page.getByRole('button', { name: 'Yard buildings', exact: true }).click();
  for (const name of ['Container workshop', 'Bulk fuel supply']) {
    await page.locator('.card').filter({ hasText: name }).getByRole('button', { name: 'Buy', exact: true }).click();
    await page.locator('.card').filter({ hasText: name }).getByText('✓ Commissioned', { exact: true }).waitFor();
  }
  const signs = () => q(() => ['workshop', 'fuelTank'].map(id => window.__quarry.world.debug.scene.getObjectByName(`facility-${id}`)?.visible));
  assert.deepEqual(await signs(), [true, true]);
  console.log('buildings shop purchases and facility signs PASSED');
  const pre = await snapshot();
  await q(() => window.__quarry.saveTo('slot1'));
  await page.reload();
  await page.getByText('Continue', { exact: true }).click();
  await start(); await frames(10);
  const post = await snapshot();
  // Existing terrain saves quantise each layer to millimetres, so interpolated heights
  // can differ by a few mm. Ownership, surface, firm flags, stats and money remain exact.
  for (let i = 0; i < pre.cells.length; i++) {
    assert.ok(Math.abs(post.cells[i].h - pre.cells[i].h) <= 0.004, 'saved height tolerance');
    post.cells[i].h = pre.cells[i].h;
  }
  assert.deepEqual(post, pre);
  assert.deepEqual(await signs(), [true, true]);
  console.log('road/ramp/level localStorage reload PASSED', JSON.stringify(pre));
  if (process.env.OUT) await page.screenshot({ path: `${process.env.OUT}/checkpoint-reloaded.png` });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }

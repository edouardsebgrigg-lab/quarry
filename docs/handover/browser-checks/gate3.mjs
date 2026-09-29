// The time gate, with the pointer lock under the test's control (headless Chrome would grant it
// on the first click, hiding the "waiting for control" state). Frame-counted, not wall-clock, so
// a slow software renderer can't blur the results: each frame is worth at most 0.1 s = 1 tick.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const OUT = process.env.OUT;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.setDefaultTimeout(300000);
await page.addInitScript(() => {
  localStorage.setItem('quarry.settings', JSON.stringify({ graphics: 'low', fullscreen: false, volume: 0 }));
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve(); // the browser hasn't granted it
  document.exitPointerLock = () => { if (window.__lockEl) { window.__lockEl = null; document.dispatchEvent(new Event('pointerlockchange')); } };
});
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const q = (fn, arg) => page.evaluate(fn, arg);
const frames = (n) => q((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
const tick = () => q(() => window.__quarry.game.state.time.tick);
const running = () => q(() => window.__quarry.gate.running());
const lock = (on) => q((on) => { window.__lockEl = on ? document.querySelector('.world-canvas') : null; document.dispatchEvent(new Event('pointerlockchange')); }, on);
const clickToPlay = () => q(() => { const e = document.querySelector('.click-to-play'); return getComputedStyle(e).display !== 'none' ? e.textContent : null; });
const mentor = () => q(() => { const c = document.querySelector('.mentor-card'); return c ? { text: c.querySelector('.mentor-text').textContent.slice(0, 50), gone: c.classList.contains('mentor-out') } : null; });
const R = {};
const check = async (name, n = 10) => { const t = await tick(); await frames(n); R[name] = { frames: n, ticks: (await tick()) - t, running: await running() }; console.log(name, JSON.stringify(R[name])); };

// Start: new game, intro closed, lock granted (the earlier check covered the waiting states).
await page.goto('http://localhost:5174/');
await page.getByText('New Game').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
await page.getByText("Let's get to work").click();
await lock(true);
await check('A playing');
// B. Explicit pause: P stops, P again resumes, with no lock change involved.
await page.keyboard.press('KeyP');
await frames(3);
await check('B paused (P)');
await page.keyboard.press('KeyP');
await frames(3);
await check('B2 unpaused');

// C. Pointer lock lost (Esc / alt-tab): the pause menu opens and time stops; Resume closes it
//    but you still have to click back in; re-acquiring the lock resumes.
await lock(false);
await frames(4);
R['C menu open'] = await q(() => !!document.querySelector('.overlay-panel'));
console.log('C menu open', R['C menu open']);
await check('C lock lost, pause menu');
await q(() => { const b = [...document.querySelectorAll('.overlay-panel button')].find((x) => /Resume/i.test(x.textContent)); b?.click(); });
await frames(4);
await check('C2 resumed from the menu, awaiting the click');
R['C2 click-to-play'] = await clickToPlay();
console.log('C2 ctp', R['C2 click-to-play']);
await lock(true);
await check('C3 pointer re-acquired');

// D. Shop: releases the pointer but time keeps running (it doesn't pause); closing it leaves
//    you waiting for the click; re-locking resumes.
await page.keyboard.press('KeyB');
await frames(3);
await check('D shop open');
await page.keyboard.press('Escape');
await frames(3);
await check('D2 shop closed, click to resume');
await lock(true);
await check('D3 re-acquired');

// E. Map, same idea.
await page.keyboard.press('Tab');
await frames(3);
await check('E map open');
await page.keyboard.press('Tab');
await frames(3);
await check('E2 map closed');
await lock(true);
await check('E3 re-acquired');

// F. A loaded game is "awaiting control" too, with the mentor's reminder.
await q(() => window.__quarry.saveTo('slot1'));
await page.reload();
await page.getByText('Continue').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
await frames(6);
await check('F loaded game, before the click');
R['F mentor reminder'] = await mentor();
console.log('F mentor', JSON.stringify(R['F mentor reminder']));
await lock(true);
await check('F2 after the click');
console.log('errors', errors.slice(0, 8).join('\n'));
await browser.close();

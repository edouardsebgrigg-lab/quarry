// Shared set-up for automated play checks: a fresh game in a headless browser.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
export async function start({ width = 480, height = 270 } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(300000);
  await page.addInitScript(() => { if (!localStorage.getItem('quarry.settings')) localStorage.setItem('quarry.settings', JSON.stringify({ graphics: 'low', fullscreen: false, volume: 0 })); });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
  const q = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n) => q((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  // Functional checks run small (software rendering is slow); a screenshot briefly goes full size.
  const shot = async (name, { big = true } = {}) => {
    if (big) { await page.setViewportSize({ width: 960, height: 540 }); await frames(3); }
    await frames(2);
    await page.screenshot({ path: `${process.env.OUT}/${name}.png`, timeout: 300000 });
    if (big) { await page.setViewportSize({ width, height }); await frames(2); }
    console.log('shot', name);
  };
  // force: keep game time running without a click (most checks need jobs to progress); the
  // time-gate check passes false to see the real waiting behaviour.
  async function newGame({ force = true } = {}) {
    await page.goto('http://localhost:5174/');
    await page.getByText('New Game').click();
    await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
    await page.getByText("Let's get to work").click();
    if (force) await q(() => window.__quarry.gate.force(true));
    await frames(2);
  }
  const lastLog = () => q(() => [...document.querySelectorAll('.log-line')].map((e) => e.textContent).slice(-3));
  return { browser, page, errors, q, frames, shot, newGame, lastLog };
}

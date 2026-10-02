// Renders the main-menu backdrop (assets/ui/menu.jpg) with the game itself, so it always shows the
// current models and lighting: an excavator loading a tipper at the edge of a dug pit, in warm
// evening light, with the subject on the right (the menu darkens the left of the picture).
//   OUT=<dir> [W=1920 H=1080 QUALITY=high] timeout 1500 node docs/handover/browser-checks/menu-backdrop.mjs
// then convert <dir>/menu-backdrop.png to assets/ui/menu.jpg (about quality 85).
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const W = Number(process.env.W ?? 1920), H = Number(process.env.H ?? 1080);
const quality = process.env.QUALITY ?? 'high';
const extra = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...extra] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
page.setDefaultTimeout(900000);
setTimeout(() => { console.log('FAIL: overall time limit'); process.exit(2); }, 24 * 60 * 1000);
await page.addInitScript((g) => localStorage.setItem('quarry.settings', JSON.stringify({ graphics: g, fullscreen: false, volume: 0, fieldOfView: 50, cameraMotion: 0 })), quality);
const q = (fn, arg) => page.evaluate(fn, arg);
const frames = (n) => q((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

await page.goto(process.env.QUARRY_URL || 'http://localhost:5174/');
await page.getByText('New Game').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 600000 });
await page.getByText("Let's get to work").click();
await q(() => window.__quarry.gate.force(true));

// The scene: a pit dug into the field, a spoil heap, the excavator at the pit's edge and the
// tipper alongside, late in the day with the sun raking across from the side.
const ids = await q((hour) => {
  const { game, world } = window.__quarry;
  const d = world.debug;
  game.state.money = 1e6;
  const ex = game.actions.buyMachine('excavator', 'used').machine;
  const tr = game.actions.buyMachine('truck', 'used').machine;
  for (const [x, z, depth, r] of [[83, 56, 1.7, 4.5], [87, 54, 1.4, 4], [80, 60, 1.2, 3.5], [85, 50, 1.1, 3.5], [79, 53, 1.3, 3.5]]) d.digAt(x, z, depth, r);
  d.dumpAt(77, 71, { gravel: 18 }, 3.4);
  d.dumpAt(73, 66, { sand: 10 }, 2.8);
  game.state.weather.current = 'sunny';
  d.settleWeather();
  game.state.time.visualSeconds = (hour / 24) * (game.data.game.visualDayLengthSeconds ?? 1200);
  return { ex: ex.id, tr: tr.id };
}, Number(process.env.HOUR ?? 17.8));
await frames(4);
await q(({ ex, tr }) => {
  const d = window.__quarry.world.debug;
  d.placeVehicle(ex, 85, 63, 0.6);
  d.placeVehicle(tr, 93, 70, 1.2);
}, ids);
await frames(6);
// Stand back and look across at them, a little below eye level so the machines loom.
await q(() => {
  const d = window.__quarry.world.debug;
  d.teleportPlayer(95, 49);
  d.aimAt(90, 63);
  d.setFootPitch(0.03);
  for (const c of d.camera.children) c.scale.setScalar(1e-4); // (no shovel in hand)
  const style = document.createElement('style');
  style.textContent = 'body * { visibility: hidden !important; } canvas.world-canvas { visibility: visible !important; }';
  document.head.append(style);
});
await frames(8);
await page.setViewportSize({ width: W, height: H });
await frames(4);
await page.screenshot({ path: `${process.env.OUT}/menu-backdrop.png` });
console.log('rendered', `${W}×${H}`, quality);
await browser.close();
process.exit(0);

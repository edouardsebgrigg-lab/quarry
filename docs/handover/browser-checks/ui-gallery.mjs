// UI gallery: screenshots of every menu, laptop app and overlay at 1280×720, for judging how the
// interface looks. Screens that cover the world are taken with the 3D scene hidden, so each one
// takes seconds rather than minutes with software rendering (the world behind the laptop is
// dimmed and blurred anyway). A mid-game company is set up first so the apps have content.
//   OUT=<dir> [ONLY=menu,settings,laptop,dealer,map,pause,hud] timeout 900 node docs/handover/browser-checks/ui-gallery.mjs
import { start } from './common.mjs';

const W = 1280, H = 720;
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (group) => !only || only.has(group);
const { browser, page, errors, q, frames } = await start({ width: W, height: H });
setTimeout(() => { console.log('FAIL: overall time limit'); process.exit(2); }, 14 * 60 * 1000);
const shot = async (name) => {
  await frames(2);
  await page.waitForTimeout(350); // (let panels finish fading in)
  await page.screenshot({ path: `${process.env.OUT}/${name}.png` });
  console.log('shot', name);
};
const scene = (visible) => q((v) => { window.__quarry.world.debug.scene.visible = v; }, visible);

await page.goto(process.env.QUARRY_URL || 'http://localhost:5174/');
await page.getByText('New Game').waitFor();
if (want('menu')) await shot('menu-main');
if (want('settings')) {
  await page.getByText('Settings', { exact: true }).click();
  for (const tab of ['Controls', 'Display', 'Sound', 'Game', 'Key bindings']) {
    await page.locator('.settings-nav').getByRole('button', { name: tab, exact: true }).click();
    await shot(`settings-${tab.toLowerCase().replace(/\s+/g, '-')}`);
  }
  await page.keyboard.press('Escape');
  await frames(2);
}

await page.getByText('New Game').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
await scene(false);
if (want('menu')) await shot('intro');
await page.getByText("Let's get to work").click();
await q(() => window.__quarry.gate.force(true));

// A company a few days in: money, machines, sales, a hire and some history.
await q(() => {
  const g = window.__quarry.game;
  const a = g.actions;
  g.state.money = 42000;
  g.state.stats.totalEarned = 26000;
  g.state.stats.deliveries = 14;
  a.buyMachine('miniDigger', 'compact35');
  a.buyMachine('excavator', 'utility80');
  a.buyMachine('truck', 'used');
  a.buyMachine('tractor', 'farm90');
  a.buyMachine('trailer', 'tandemTipper');
  for (let i = 0; i < g.state.time.ticksPerDay * 2; i++) g.tick();
  const st = g.state.staff;
  if (st?.applicants?.[0]) a.hireStaff(st.applicants[0].id);
});
await frames(2);

if (want('laptop') || want('dealer')) {
  await page.keyboard.press('b');
  await frames(3);
  const apps = await q(() => [...document.querySelectorAll('.lt-dock-app')].map((b) => b.getAttribute('aria-label')));
  for (const label of apps) {
    if (label !== 'Plant dealer' && !want('laptop')) continue;
    await q((label) => document.querySelector(`.lt-dock-app[aria-label="${label}"]`).click(), label);
    await q(() => { document.activeElement?.blur(); document.querySelector('.lt-app-body').scrollTop = 0; });
    await shot(`laptop-${label.toLowerCase().replace(/\s+/g, '-')}`);
    if (label === 'Plant dealer' && want('dealer')) {
      const cats = await q(() => [...document.querySelectorAll('.lt-cat')].map((b) => b.textContent));
      for (const [i, c] of cats.entries()) {
        if (i === 0) continue;
        await q((i) => document.querySelectorAll('.lt-cat')[i].click(), i);
        await shot(`dealer-${c.toLowerCase().replace(/\s+/g, '-')}`);
      }
      await q(() => document.querySelectorAll('.lt-cat')[0].click());
      await q(() => document.querySelectorAll('.lt-app-body .lt-tile')[3]?.click());
      await page.waitForTimeout(1500); // (its photo renders)
      await shot('dealer-detail');
    }
  }
  await page.keyboard.press('Escape');
  await frames(2);
}
if (want('map')) {
  await page.keyboard.press('Tab');
  await shot('map');
  await page.keyboard.press('Tab');
}
if (want('pause')) {
  await page.keyboard.press('Escape');
  await shot('pause');
  await page.getByText('Save Game', { exact: true }).click();
  await shot('pause-save-slots');
  await page.keyboard.press('Escape');
  await frames(2);
  await page.keyboard.press('Escape');
  await frames(2);
}
if (want('hud')) {
  // The HUD over the world needs the scene: these are slow.
  await scene(true);
  await page.setViewportSize({ width: 960, height: 540 });
  await q(() => { const d = window.__quarry.world.debug; d.teleportPlayer(130, 35); d.aimAt(126, 35); });
  await frames(6);
  await shot('hud-foot');
  await q(() => { const d = window.__quarry.world.debug; const m = window.__quarry.game.state.machines.find((m) => m.type === 'excavator'); d.enterVehicle(m.id); });
  await frames(6);
  await shot('hud-digger');
}
console.log('errors', errors.slice(0, 8).join('\n') || '(none)');
await browser.close();
process.exit(0);

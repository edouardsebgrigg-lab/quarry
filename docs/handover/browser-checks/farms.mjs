// Two of the farmsteads by the lanes, seen from the road side (house, barn, silo, bales, yard),
// then the dealer's yard and the depot, which use the same shed and yard pieces.
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/farms.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'farm';
const { browser, page, errors, q, frames, newGame } = await start({ width: 480, height: 270 });
const shot = async (name) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(4);
  await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 });
  await page.setViewportSize({ width: 480, height: 270 }); await frames(2);
  console.log('shot', name);
};
await newGame();
await q(() => { for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; }); });
// (standing about 45 m off each farm, looking at it)
for (const [name, x, z, fx, fz] of [['mill', 80, -95, 80, -140], ['grange', 300, 150, 350, 150], ['dealer', 630, -575, 680, -580], ['depot', 183, -650, 183, -720], ['bays', 160, -722, 160, -760]]) {
  await q(([x, z, fx, fz]) => { const d = window.__quarry.world.debug; d.teleportPlayer(x, z); d.aimAt(fx, fz); d.setFootPitch(-0.05); }, [x, z, fx, fz]);
  await frames(16);
  await shot(name);
}
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

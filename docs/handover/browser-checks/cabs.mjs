// The view from the driver's seat of the truck and the excavator, out over the yard (for the
// windscreen, dash and cab interior).
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/cabs.mjs
import { start } from './common.mjs';
const TAG = process.env.TAG ?? 'cab';
const { browser, page, errors, q, frames, newGame } = await start({ width: 480, height: 270 });
const shot = async (name) => {
  await page.setViewportSize({ width: 960, height: 540 }); await frames(4);
  await page.screenshot({ path: `${process.env.OUT}/${TAG}-${name}.png`, timeout: 300000 });
  await page.setViewportSize({ width: 480, height: 270 }); await frames(2);
  console.log('shot', name);
};
await newGame();
const ids = await q(() => {
  const g = window.__quarry.game;
  g.state.money = 1e6;
  for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach((e) => { e.style.visibility = 'hidden'; });
  return { truck: g.actions.buyMachine('truck', 'rusty').machine.id, excavator: g.actions.buyMachine('excavator', 'used').machine.id };
});
await frames(4);
let x = 40;
for (const [name, id] of Object.entries(ids)) {
  x += 30; // (each well clear of the other)
  await q(([id, x]) => {
    const d = window.__quarry.world.debug;
    d.placeVehicle(id, x, 80, -0.9);
    d.enterVehicle(id);
    d.setCamMode('cab');
    d.setLook(0, -0.08);
  }, [id, x]);
  await frames(12);
  await shot(name);
  await q(() => window.__quarry.world.debug.exitVehicle());
  await frames(4);
}
console.log('errors', errors.slice(0, 10).join('\n') || '(none)');
await browser.close();

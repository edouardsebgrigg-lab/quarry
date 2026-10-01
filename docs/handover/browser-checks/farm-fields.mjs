// Parked farm machinery/field bales: real renderer, solid scenery, no fleet/economy entries.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const { browser, page, errors, q, frames, shot, newGame } = await start({ width: 480, height: 270 });
await newGame();
const fleet = await q(() => window.__quarry.game.state.machines.length);
const machinery = await q(() => {
  const { scene } = window.__quarry.world.debug;
  return scene.children.filter(o => o.name.startsWith('farm-field-machinery-')).map(o => ({ name:o.name, x:o.position.x, y:o.position.y, z:o.position.z, parts:o.children.length }));
});
assert.equal(machinery.length, 2);
assert.ok(machinery.every(m => m.parts === 2 && Number.isFinite(m.y)));
console.log('scenery', JSON.stringify(machinery));
await q(() => { for (const s of ['.hud', '.hud3d', '.feedback']) document.querySelectorAll(s).forEach(e => { e.style.visibility = 'hidden'; }); });
for (const [i,m] of machinery.entries()) {
  await q(([x,z]) => { const d = window.__quarry.world.debug; d.teleportPlayer(x-12,z+9); d.aimAt(x-2,z); d.setFootPitch(-.02); }, [m.x,m.z]);
  await frames(12);
  await shot(`field-${i}`);
}
assert.equal(await q(() => window.__quarry.game.state.machines.length), fleet);
assert.deepEqual(errors, []);
console.log('fleet unchanged, errors (none)');
await browser.close();

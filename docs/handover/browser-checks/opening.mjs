// Automated opening-loop check on a fresh game with normal money (no debug money): walk to
// the field, dig with the shovel, fill the barrow, load the pickup, drive it to the depot along the
// road, weigh in, unload in the topsoil bay, and watch the goals and mentor follow along. Then
// save, reload and compare. Held keys, aim and debug input hooks exercise the shovel/barrow
// timers, vehicle physics and weighbridge dwell. This is not a human playthrough or pacing
// measurement. HIDE_SCENE=1 hides rendering between screenshots for software-browser speed.
// HAUL_FIXTURE=1 positions the already-loaded pickup at the public bridge and delivery bay;
// this validates the normal-money business loop without claiming a verified road drive.
import { start } from './common.mjs';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
const { browser, page, errors, q, frames, shot:baseShot, newGame } = await start({ width: 320, height: 180 });
process.env.OUT??='/tmp/quarry-opening';mkdirSync(process.env.OUT,{recursive:true});
const hide=process.env.HIDE_SCENE==='1';
const fixtureHaul=process.env.HAUL_FIXTURE==='1';
const shot=async name=>{
  if(hide)await q(()=>{window.__quarry.world.debug.scene.visible=true;});
  await baseShot(name);
  if(hide)await q(()=>{window.__quarry.world.debug.scene.visible=false;});
};
const R = { stages: [], shortcuts: [], notes: [] };
const t0real = Date.now();
await page.addInitScript(() => {
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
});
R.shortcuts.push('pointer lock stubbed; clock forced at 1x; held keys and aim supplied by code; vehicle entry and barrow grab/tip through debug control hooks');
await newGame();
if(hide){await q(()=>{window.__quarry.world.debug.scene.visible=false;});R.shortcuts.push('3D scene hidden between screenshots; physical simulation retained');}
await q(() => { window.__lockEl = document.querySelector('.world-canvas'); document.dispatchEvent(new Event('pointerlockchange')); });
const gameSecs = () => q(() => window.__quarry.game.state.time.tick / window.__quarry.game.data.game.ticksPerSecond);
const S0 = await gameSecs();
const stage = async (name, extra = {}) => {
  const g = (await gameSecs()) - S0;
  const st = await q(() => { const gm = window.__quarry.game; return { goal: gm.data.objectives.steps[gm.state.objectives.index]?.id, money: Math.round(gm.state.money * 100) / 100, guide: window.__quarry.world.hudInfo().guide?.label ?? null }; });
  R.stages.push({ name, gameSec: Math.round(g), realMin: +((Date.now() - t0real) / 60000).toFixed(1), ...st, ...extra });
  writeFileSync(`${process.env.OUT}/opening.json`, JSON.stringify(R, null, 2));
  console.log('stage', JSON.stringify(R.stages.at(-1)));
};
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const feet = () => q(() => window.__quarry.world.debug.feet());
const setKeys = (k) => q((k) => window.__quarry.world.debug.setKeys(k), k);
const face = (x, z) => q(([x, z]) => { const d = window.__quarry.world.debug; const f = d.feet(); d.setFootYaw(Math.atan2(-(x - f[0]), -(z - f[2]))); }, [x, z]);
async function walkTo(x, z, { r = 1.0, max = 900 } = {}) {
  for (let i = 0; i < max; i++) {
    const f = await feet();
    if (Math.hypot(f[0] - x, f[2] - z) < r) break;
    await face(x, z);
    await setKeys(['forward']);
    await frames(1);
  }
  await setKeys([]);
  const end = await feet();
  if (Math.hypot(end[0] - x, end[2] - z) >= r) throw new Error(`walk waypoint ${x},${z} not reached after ${max} frames; feet=${JSON.stringify(end)}`);
}
// Aim the crosshair at a world point.
const aim = (x, y, z) => q(([x, y, z]) => { const d = window.__quarry.world.debug; const e = d.eye(); const dx = x - e[0]; const dz = z - e[2]; d.setFootYaw(Math.atan2(-dx, -dz)); d.setFootPitch(Math.atan2(y - e[1], Math.hypot(dx, dz))); }, [x, y, z]);
const target = () => q(() => window.__quarry.world.debug.hands.target()?.kind ?? null);
const busy = () => q(() => window.__quarry.world.debug.hands.busy());
const waitIdle = async (max = 200) => { for (let i = 0; i < max && (await busy()); i++) await frames(1); };
const H = (x, z) => q(([x, z]) => window.__quarry.game.ctx.ground.heightAt(x, z), [x, z]);

try {
await stage('start');
const ids = await q(() => ({ pickup: window.__quarry.game.state.machines.find((m) => m.type === 'pickup').id }));

// ---- 1. Drive the pickup from the yard onto the field with automatic waypoint steering.
async function driveThrough(id, points, { speedMax = 9, r = 3, max = 1500, stopAtEnd = true } = {}) {
  for (const [x, z] of points) {
    let reached = false;
    for (let i = 0; i < max; i++) {
      const s = await q(([id, x, z]) => { const v = window.__quarry.world.debug.vehicle(id); const p = v.position(); return { x: p.x, z: p.z, yaw: v.yaw(), speed: v.speed() }; }, [id, x, z]);
      if (Math.hypot(s.x - x, s.z - z) < r) { reached = true; break; }
      if (i % 100 === 0) console.log("drive", JSON.stringify({ waypoint: [x, z], frame: i, ...s }));
      let want = Math.atan2(-(z - s.z), x - s.x);
      const direction = Math.abs(wrap(want - s.yaw)) > Math.PI / 2 ? -1 : 1;
      if (direction < 0) want = wrap(want + Math.PI);
      const err = wrap(want - s.yaw);
      const keys = [];
      if (direction * s.speed < speedMax) keys.push(direction > 0 ? 'forward' : 'back');
      if (direction * err > 0.08) keys.push('left'); else if (direction * err < -0.08) keys.push('right');
      await setKeys(keys);
      await frames(1);
    }
    if (!reached) {
      const s = await q(id => window.__quarry.world.debug.vehicle(id).position().toArray(), id);
      throw new Error(`drive waypoint ${x},${z} not reached after ${max} frames; position=${JSON.stringify(s)}`);
    }
  }
  if (stopAtEnd) {
    await setKeys(['jump']);
    for (let i = 0; i < 120; i++) { await frames(1); if (Math.abs(await q((id) => window.__quarry.world.debug.vehicle(id).speed(), id)) < 0.25) break; }
    await setKeys([]);
  }
}
await walkTo(175, 26, { r: 0.8 });
await q((id) => { window.__quarry.world.debug.enterVehicle(id); window.__quarry.world.debug.setCamMode('chase'); }, ids.pickup);
await frames(30); // the engine starts
await driveThrough(ids.pickup, [[162, 15], [150, 14]], { speedMax: 5, r: 2.5 });
await stage('pickup on the field');
await q(() => window.__quarry.world.debug.exitVehicle());
const pk = await q((id) => { const v = window.__quarry.world.debug.vehicle(id); const t = v.tailgateWorld(); return { tail: [t.x, t.z], pos: v.position().toArray() }; }, ids.pickup);
R.pickupTail = pk.tail;

// ---- 2. Dig and fill the barrow with the shovel
const B = await q(() => { const b = window.__quarry.world.debug.hands.state; return { x: b.x, z: b.z, yaw: b.yaw }; });
R.barrowStart = B;
// The parked barrow is solid: walk around its west side instead of through its tray.
await walkTo(B.x-3,B.z-2.5,{r:.7});
await walkTo(B.x-3,B.z+3,{r:.7});
await walkTo(B.x + 0.5, B.z + 2.6, { r: 0.8 });
let shovelfuls = 0;
for (let n = 0; n < 40; n++) {
  const filled = await q(() => { const g = window.__quarry.game; return g.data.objectives.steps[g.state.objectives.index]?.id !== 'fillBarrow' && g.state.objectives.index >= 2; });
  if (filled) break;
  const f = await feet();
  // dig a fresh spot to the side, 1.6 m out
  const gx = f[0] - 1.4 + (n % 5) * 0.5; const gz = f[2] + 0.9 + Math.floor(n / 5) * 0.5;
  let ok = false;
  for (let tries = 0; tries < 6 && !ok; tries++) { await aim(gx + (tries % 3) * 0.2, await H(gx, gz), gz + Math.floor(tries / 3) * 0.2); await frames(2); ok = (await target()) === 'dig'; }
  if (!ok) { R.notes.push(`could not aim a dig at shovelful ${n}`); break; }
  await q(() => window.__quarry.world.debug.useShovel());
  await waitIdle();
  await aim(B.x, 0.55, B.z); await frames(2);
  for (let tries = 0; tries < 6 && (await target()) !== 'barrow'; tries++) { await aim(B.x + (tries % 3) * 0.15 - 0.15, 0.5 + (tries > 2 ? 0.1 : 0), B.z + (tries % 2) * 0.2); await frames(2); }
  await q(() => window.__quarry.world.debug.useShovel());
  await waitIdle();
  shovelfuls += 1;
}
R.shovelfulsPerBarrow = shovelfuls;
await stage('barrow full', { shovelfuls });
if (!(await q(() => Object.values(window.__quarry.game.state.tools.barrow.load).reduce((a,b)=>a+b,0) > 0.09))) throw new Error('Shovel loop did not fill the barrow');

// ---- 3. Tip one barrow into the pickup, then finish loading directly with the shovel.
async function takeBarrow() {
  const b = await q(() => window.__quarry.world.debug.hands.state);
  for (const [ox, oz] of [[0, 1.6], [-1.6, 0], [1.6, 0], [0, -1.6]]) {
    await walkTo(b.x + ox, b.z + oz, { r: 0.7 });
    await q((k) => { const d = window.__quarry.world.debug; d.hands.grab(); }, 0);
    await frames(2);
    if (await q(() => window.__quarry.world.debug.hands.holding())) return true;
    await walkTo(b.x + ox * 2, b.z + oz * 2, { r: 1.2 });
  }
  return false;
}
R.tookBarrow = await takeBarrow();
if (!R.tookBarrow) throw new Error('Could not grab the barrow');
// Make space before turning. The dedicated barrow-guidance check reproduces blocked HUDs.
const cargoBeforeBack=await q(()=>structuredClone(window.__quarry.game.state.tools.barrow.load));
await q(()=>{const d=window.__quarry.world.debug;d.setFootYaw(d.hands.state.yaw);});
await setKeys(['back']);await frames(100);await setKeys([]);
assert.deepEqual(await q(()=>window.__quarry.game.state.tools.barrow.load),cargoBeforeBack);
await stage('barrow reverse clearance retains cargo');
const pushTo = async (x, z, { r = 1.3, max = 900 } = {}) => {
  let lastDistance=Infinity,stalled=0,backouts=0;
  for (let i = 0; i < max; i++) {
    const b = await q(() => window.__quarry.world.debug.hands.state);
    const distance=Math.hypot(b.x-x,b.z-z);
    if (distance < r) break;
    stalled=distance<lastDistance-.02?0:stalled+1;lastDistance=distance;
    if(stalled>40&&backouts<5&&/Blocked ahead|No room to turn/.test(JSON.stringify(await q(()=>window.__quarry.world.hudInfo().prompt)))) {
      await q(yaw=>window.__quarry.world.debug.setFootYaw(yaw),b.yaw);
      await setKeys(['back']);await frames(60);await setKeys([]);
      R.notes.push(`Waypoint steering backed the barrow away from an obstruction near ${b.x.toFixed(1)},${b.z.toFixed(1)}`);
      backouts++;stalled=0;continue;
    }
    const yaw=Math.atan2(-(x-b.x),-(z-b.z));
    await q(yaw=>window.__quarry.world.debug.setFootYaw(yaw),yaw);
    await setKeys(Math.abs(wrap(yaw-b.yaw))>.5?[]:['forward']);
    await frames(1);
  }
  await setKeys([]);
  const b = await q(() => window.__quarry.world.debug.hands.state);
  if (Math.hypot(b.x-x,b.z-z) >= r) throw new Error(`barrow waypoint ${x},${z} not reached after ${max} frames; barrow=${b.x},${b.z}`);
};
const pickupLoad = () => q((id) => Object.values(window.__quarry.game.state.machines.find((m) => m.id === id).load).reduce((a, b) => a + b, 0), ids.pickup);
let loads = 0;
for (let n = 0; n < 1; n++) {
  // to the tailgate
  const promptOk = async () => JSON.stringify(await q(() => window.__quarry.world.hudInfo().prompt)).toLowerCase().includes('tip it into');
  await pushTo(145, 17.5, { r: 0.8 });
  await pushTo(pk.tail[0] + 4, 17.5, { r: 0.8 });
  await pushTo(pk.tail[0] + 3, pk.tail[1], { r: 0.7 });
  await pushTo(pk.tail[0] + 1.0, pk.tail[1], { r: 1.0 });
  for (let i = 0; i < 30 && !(await promptOk()); i++) { await setKeys(['forward']); await frames(1); }
  await setKeys([]);
  if (!(await promptOk())) throw new Error('Barrow did not offer a tip into the pickup');
  await q(() => window.__quarry.world.debug.tipBarrow());
  await frames(3); await waitIdle(120);
  for (let i = 0; i < 60 && (await busy()); i++) await frames(1);
  loads += 1;
  R.notes.push(`barrow ${loads}: pickup now ${(await pickupLoad()).toFixed(3)} t`);
  writeFileSync(`${process.env.OUT}/opening.json`, JSON.stringify(R, null, 2));
  console.log(R.notes.at(-1));
}
// Park the empty barrow beside the pickup, clear of its reversing path.
await q(()=>{const d=window.__quarry.world.debug;d.setFootYaw(d.hands.state.yaw);});
await setKeys(['back']);await frames(100);await setKeys([]);
await q(()=>window.__quarry.world.debug.setFootYaw(Math.PI));await frames(60);
await setKeys(['forward']);await frames(30);await setKeys([]);
await q(() => window.__quarry.world.debug.letGoBarrow());
// Ray also suggests shovelling straight into a parked pickup. Exercise that second
// loading path instead of relying on repeated tight automatic barrow turns at the hedge.
const bed=await q(id=>{const p=window.__quarry.world.debug.vehicle(id).bedWorld();return {x:p.x,y:p.y-.3,z:p.z};},ids.pickup);
const foot=await feet();await walkTo(foot[0],bed.z-3.7,{r:.6});
await walkTo(bed.x,bed.z-3.7,{r:.5});await walkTo(bed.x,bed.z-2.5,{r:.5});
let directShovels=0;
for(let n=0;n<40&&(await pickupLoad())<.32;n++) {
  if(!await q(()=>Object.values(window.__quarry.game.state.tools.shovel.load).some(t=>t>1e-6))) {
    const x=bed.x-.8+(n%4)*.4,z=bed.z-3.8-(Math.floor(n/4)%2)*.35;
    await aim(x,await H(x,z),z);await frames(2);
    assert.equal(await target(),'dig','direct-loading shovel must aim at owned ground');
    await q(()=>window.__quarry.world.debug.useShovel());await waitIdle();directShovels++;
  }
  await aim(bed.x,bed.y,bed.z);await frames(2);
  assert.equal(await target(),'truck','shovel must aim inside the actual pickup bed');
  await q(()=>window.__quarry.world.debug.useShovel());await waitIdle();
}
R.directShovels=directShovels;
await stage('pickup loaded', { tonnes: +(await pickupLoad()).toFixed(3), barrowLoads: loads });
if ((await pickupLoad()) < 0.32) throw new Error('Hand-loading loop did not load the pickup');
R.mentorAfterLoad = await q(() => document.querySelector('.mentor-card .mentor-text')?.textContent ?? null);

// ---- 4. Drive to the depot along the real road: yard driveway, Mill Lane, Quarry Road, the depot gate
const route = await q(() => {
  const plan = window.__quarry.world.plan;
  const m = plan.byId.millLane.samples;
  const qr = plan.byId.quarryRoad.samples;
  const start = m.findIndex((p) => p.x > 180);
  const junction = m.findIndex((p) => p.z < -466);
  const out = [[180, -8], [180, -26]];
  for (let i = start; i <= junction; i += 5) out.push([m[i].x + 1.6, m[i].z]);
  for (let i = 0; i < qr.length; i += 5) { out.push([qr[i].x, qr[i].z + 1.6]); if (qr[i].x < 200) break; }
  out.push([183, -662], [183, -676], [183, -686]);
  return out;
});
R.routePoints = route.length;
await walkTo(pk.tail[0] + 0.5, pk.tail[1] + 3.2, { r: 2.5 });
await q((id) => { window.__quarry.world.debug.enterVehicle(id); window.__quarry.world.debug.setCamMode('chase'); }, ids.pickup);
await frames(20);
await stage('in the pickup, leaving');
if(fixtureHaul) {
  R.shortcuts.push('Loaded pickup positioned on the public weighbridge and in the delivery bay; road haul and bay reversing not verified');
  await q(id=>window.__quarry.world.debug.placeVehicle(id,183,-690,Math.PI/2),ids.pickup);await frames(6);
} else await driveThrough(ids.pickup, [[150, 14], [160, 12], [176, 6], [180, -8]].concat(route), { speedMax: 15, r: 5, stopAtEnd: false, max: 2500 });
const arrive = await q((id) => window.__quarry.world.debug.vehicle(id).position().toArray(), ids.pickup);
await stage('at the depot gate', { pos: arrive.map((v) => Math.round(v)) });
// ---- 5. Weigh in: stop on the bridge
await setKeys(['jump']);
await page.waitForFunction((id) => !!window.__quarry.game.state.depot.tickets[id], ids.pickup, { timeout: 300000 }).catch(() => R.notes.push('no weighbridge ticket'));
await setKeys([]);
await stage('weighed in', { ticket: await q((id) => window.__quarry.game.state.depot.tickets[id] ?? null, ids.pickup) });
// ---- 6. Reverse into the topsoil bay: swing round and back in tail first
const bay = await q(() => window.__quarry.world.plan.map.depot.bays.find((b) => b.id === 'topsoil'));
const bx = (bay.x0 + bay.x1) / 2;
await q(() => window.__quarry.world.debug.setKeys([]));
if(!fixtureHaul)await driveThrough(ids.pickup, [[183, -705], [172, -728], [156, -734], [bx + 1.5, -726], [bx, -716]], { speedMax: 4, r: 2.2 });
// straighten up facing south, then reverse north into the bay
let inBay = false;
for (let i = 0; !fixtureHaul && i < 500 && !inBay; i++) {
  const s = await q((id) => { const v = window.__quarry.world.debug.vehicle(id); const p = v.position(); const t = v.tailgateWorld(); return { x: p.x, z: p.z, yaw: v.yaw(), speed: v.speed(), bay: window.__quarry.world.debug.places.bayAt(t.x, t.z)?.id ?? null }; }, ids.pickup);
  if (s.bay === 'topsoil') { inBay = true; break; }
  const err = wrap(-Math.PI / 2 - s.yaw);
  const lateral = s.x - bx;
  // reversing: steering left swings the tail to the right; aim the tail at the bay's middle line
  const keys = ['back'];
  const wanted = Math.max(-0.35, Math.min(0.35, err * 1.2 - lateral * 0.12));
  if (wanted > 0.05) keys.push('right'); else if (wanted < -0.05) keys.push('left');
  await setKeys(keys);
  await frames(1);
}
await setKeys(['jump']); await frames(20); await setKeys([]);
if (!inBay) {
  if(!fixtureHaul)R.shortcuts.push('bay reversing failed: vehicle placed with its tail in the bay');
  await q(([id, bx]) => window.__quarry.world.debug.placeVehicle(id, bx, -754.5, -Math.PI / 2), [ids.pickup, bx]);
  await frames(6);
}
R.bayPrompt = await q(() => window.__quarry.world.hudInfo().prompt);
await stage('in the topsoil bay');
const before = await q(() => window.__quarry.game.state.money);
await q(() => window.__quarry.world.handleAction('tip'));
await page.waitForFunction((id) => !window.__quarry.game.state.machines.find((m) => m.id === id).job, ids.pickup, { timeout: 300000 });
await frames(3);
const after = await q(() => window.__quarry.game.state.money);
R.sale = { before, after, gained: +(after - before).toFixed(2), log: await q(() => [...document.querySelectorAll('.log-line')].map((e) => e.textContent).slice(-2)) };
await stage('first sale done');
R.mentorAfterSale = await q(() => document.querySelector('.mentor-card .mentor-text')?.textContent ?? null);
if (!(after > before) || !(await q(() => window.__quarry.game.state.stats.tonnesSold > 0))) throw new Error('Tip did not produce a sale');
R.timeToFirstSale = R.stages.at(-1).gameSec;
// Use the current player-facing dealer, including the preceding upgrade goal.
await q(()=>window.__quarry.world.debug.exitVehicle());
// Keep the software-rendered world small, but exercise menus at a usable window size.
await page.setViewportSize({width:960,height:540});
await page.keyboard.press('b');
await page.getByRole('button',{name:'Plant dealer',exact:true}).click();
await page.getByRole('button',{name:'Upgrades',exact:true}).click();
await page.locator('.lt-row').filter({hasText:'Stiffer rear springs'}).getByRole('button',{name:'Fit',exact:true}).click();
await page.locator('.upgrade-card').waitFor({state:'hidden'});
assert.equal(await q(id=>window.__quarry.game.state.machines.find(m=>m.id===id).mods.includes('stifferSprings'),ids.pickup),true);
await stage('pickup springs fitted');
R.machinePrice = await q(() => window.__quarry.game.data.machines.types.miniDigger.tiers.micro08.price);
R.affordableNow = await q(price=>window.__quarry.game.state.money>=price,R.machinePrice);
if (R.affordableNow) {
  await page.getByRole('button',{name:'Diggers',exact:true}).click();
  await page.locator('.lt-tile').filter({hasText:'Micro 08'}).click();
  await page.locator('.lt-detail').getByRole('button',{name:'Buy',exact:true}).click();
  R.purchase=await q(()=>window.__quarry.game.state.machines.find(m=>m.type==='miniDigger'&&m.tier==='micro08'));
  assert.ok(R.purchase,'dealer did not deliver the first digger');
  await stage('first machine bought');
  R.timeToFirstMachine = R.stages.at(-1).gameSec;
} else {
  R.notes.push('First machine not yet affordable: repeat trips needed; time to first machine not verified');
}
await page.keyboard.press('Escape');

// ---- 7. Save, reload, continue
const snap = () => q(() => {
  const g = window.__quarry.game;
  return { goal: g.data.objectives.steps[g.state.objectives.index]?.id, index: g.state.objectives.index, money: Math.round(g.state.money * 100) / 100, sold: +g.state.stats.tonnesSold.toFixed(3), seen: Object.keys(g.state.mentor.seen), tick: g.state.time.tick,
    machines:g.state.machines.map(({id,type,tier,mods})=>({id,type,tier,mods})),
    shovel:g.state.tools.shovel.load,barrow:g.state.tools.barrow.load };
});
await q(() => window.__quarry.world.debug.exitVehicle());
await q(() => window.__quarry.saveTo('slot1'));
const before2 = await snap();
await page.reload();
await page.getByText('Continue').click();
await page.waitForFunction(() => window.__quarry?.world, null, { timeout: 300000 });
if(hide)await q(()=>{window.__quarry.world.debug.scene.visible=false;});
await frames(3);
const after2 = await snap();
R.save = { before: before2, after: after2, sameExceptClock: JSON.stringify({ ...before2, tick: 0 }) === JSON.stringify({ ...after2, tick: 0 }), clockDrift: after2.tick - before2.tick, mentorOnLoad: await q(() => document.querySelector('.mentor-card .mentor-text')?.textContent ?? null) };
await page.setViewportSize({ width: 960, height: 540 });
await frames(3);
await shot('100-opening-reloaded');
R.totalRealMinutes = +((Date.now() - t0real) / 60000).toFixed(1);
console.log(JSON.stringify(R, null, 1));
console.log('errors', errors.slice(0, 10).join('\n'));
assert.equal(R.save.sameExceptClock,true,'company changed across Continue');
assert.deepEqual(errors,[],'browser console errors');
console.log('PASS opening loop');
} catch (error) {
  R.blocker = error.message;
  await shot('opening-blocker').catch(() => {});
  R.lastState = await q(() => ({ feet: window.__quarry.world.debug.feet(), tick: window.__quarry.game.state.time.tick, money: window.__quarry.game.state.money })).catch(() => null);
  console.log('blocker', JSON.stringify(R));
  throw error;
} finally {
  writeFileSync(`${process.env.OUT}/opening.json`, JSON.stringify(R, null, 2));
  await browser.close();
}

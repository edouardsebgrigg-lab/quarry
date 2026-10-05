// Actual collision and HUD check. Vehicle/player placement and shovel actions are fixtures.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { start } from './common.mjs';
const {browser,page,q,frames,newGame,errors}=await start();
const out=process.env.OUT||'/tmp/quarry-barrow';await mkdir(out,{recursive:true});
try {
  await newGame();
  await q(()=>{
    const {game:g,world:w}=window.__quarry;w.debug.scene.visible=false;
    for(let i=0;i<4;i++){g.actions.shovelDig({x:40+i,z:40});g.actions.shovelDump({into:'barrow'});}
    const id=g.state.machines.find(m=>m.type==='pickup').id;
    w.debug.placeVehicle(id,148.5,14,Math.PI);
    for(let i=0;i<90;i++)w.update(1/30,{paused:false,keyboard:{isHeld:()=>false}});
    w.debug.teleportPlayer(143.5,14);w.debug.takeBarrow();
    w.debug.setFootYaw(w.debug.hands.state.yaw);w.debug.setFootPitch(-.3);w.debug.setKeys(['forward']);
  });
  await frames(70);
  const before=await q(()=>({prompt:window.__quarry.world.hudInfo().prompt,
    cargo:structuredClone(window.__quarry.game.state.tools.barrow.load),feet:window.__quarry.world.debug.feet()}));
  assert.match(JSON.stringify(before.prompt),/Blocked ahead: pull back before turning/);
  await q(()=>{window.__quarry.world.debug.scene.visible=true;});
  await page.setViewportSize({width:960,height:540});await frames(3);
  await page.screenshot({path:`${out}/barrow-guidance.png`});
  await page.setViewportSize({width:320,height:180});
  await q(()=>{window.__quarry.world.debug.scene.visible=false;window.__quarry.world.debug.setKeys(['back']);});
  await frames(90);
  const after=await q(()=>({cargo:window.__quarry.game.state.tools.barrow.load,feet:window.__quarry.world.debug.feet()}));
  assert.deepEqual(after.cargo,before.cargo);assert.ok(Math.hypot(after.feet[0]-before.feet[0],after.feet[2]-before.feet[2])>.5);
  await q(()=>window.__quarry.world.debug.setKeys([]));await frames(2);
  assert.doesNotMatch(JSON.stringify(await q(()=>window.__quarry.world.hudInfo().prompt)),/Blocked ahead/);
  assert.deepEqual(errors,[]);console.log('PASS barrow guidance and conserved reverse clearance');
} finally {await browser.close();}

// T5 regression: isolate the formerly blocked driveway. Placement and entry are set by code;
// movement uses the normal pickup physics and held forward key, no debug money.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const { browser, q, frames, newGame, errors } = await start();
try {
  await newGame();
  const id = await q(() => {
    const {game,world} = window.__quarry;
    const id=game.state.machines[0].id;
    world.debug.placeVehicle(id,180,3,Math.PI/2);
    world.debug.enterVehicle(id);
    world.debug.setKeys(['forward']);
    return id;
  });
  let pos;
  for(let i=0;i<800;i+=20) {
    await frames(20);
    pos=await q(id=>window.__quarry.world.debug.vehicle(id).position().toArray(),id);
    if(pos[2] < -22) break;
  }
  await q(()=>window.__quarry.world.debug.setKeys([]));
  assert.ok(pos[2] < -22,JSON.stringify(pos));
  assert.deepEqual(errors,[]);
  console.log('cleared driveway',JSON.stringify(pos));
} finally { await browser.close(); }

// T7: normal frame dwell on a commissioned home bridge, then T delivery at depot.
// Development funds, code placement/entry and load from actual ground; pointer lock stubbed.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const {browser,page,q,frames,shot,newGame,errors}=await start();
await page.addInitScript(()=>{
  Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('.world-canvas')});
  Element.prototype.requestPointerLock=()=>Promise.resolve();document.exitPointerLock=()=>{};
});
try {
  await newGame();
  const id=await q(()=>{
    const {game,world}=window.__quarry;game.state.money=5000;
    game.actions.buyBuilding('weighbridge');
    const m=game.state.machines[0];const g=game.ctx.ground;
    const r=game.actions.digGround({x:60,z:60,radius:2,bottomY:g.heightAt(60,60)-0.5,maxTonnes:0.5});m.load={...r.tonnes};
    window.__homeWeights=[];game.events.on('weighedIn',e=>window.__homeWeights.push(e));
    world.debug.placeVehicle(m.id,180,-4,Math.PI/2);world.debug.enterVehicle(m.id);
    return m.id;
  });
  let ticket;
  for(let i=0;i<240;i+=20){await frames(20);ticket=await q(id=>window.__quarry.game.state.depot?.tickets?.[id],id);if(ticket)break;}
  assert.ok(ticket,'home automatic weigh-in did not issue a ticket');
  const quote=await q(()=>document.body.innerText);
  assert.ok(quote.includes('current quote $'),quote);
  await frames(40);assert.equal(await q(()=>window.__homeWeights.length),1);
  await q(id=>{const d=window.__quarry.world.debug;d.exitVehicle();d.placeVehicle(id,180,-4,Math.PI/2);d.teleportPlayer(175,9,0);d.aimAt(180,-4);},id);
  await page.addStyleTag({content:'.mentor {visibility:hidden}'});
  await shot('home-weighbridge');
  const tip=await q(id=>{
    const {game,world}=window.__quarry;const m=game.state.machines.find(m=>m.id===id);
    const main=Object.entries(m.load).sort((a,b)=>b[1]-a[1])[0][0];
    const b=world.plan.map.depot.bays.find(b=>b.id===main);
    world.debug.placeVehicle(id,(b.x0+b.x1)/2,-755, -Math.PI/2);world.debug.enterVehicle(id);
    return {main,tonnes:game.state.depot.tickets[id].tonnes};
  },id);
  await frames(2);
  const job=await q(id=>{const {game,world}=window.__quarry;world.handleAction('tip');return game.state.machines.find(m=>m.id===id).job;},id);
  assert.equal(job?.params.bay,tip.main,JSON.stringify(job));
  await q(seconds=>window.__quarry.game.advance(Math.ceil(seconds*window.__quarry.game.data.game.ticksPerSecond)+1),job.duration);
  const after=await q(id=>{const s=window.__quarry.game.state;return {load:s.machines.find(m=>m.id===id).load,ticket:s.depot.tickets[id],sold:s.stats.tonnesSold};},id);
  assert.deepEqual(after.load,{});assert.equal(after.ticket,undefined);assert.ok(Math.abs(after.sold-tip.tonnes)<1e-8);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ticket,tip,after,errors}));
}finally{await browser.close();}

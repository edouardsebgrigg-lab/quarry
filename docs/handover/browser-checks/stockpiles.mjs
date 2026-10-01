// T6 integration: actual dug load, T dispatch into a yard bay, held-LMB bucket extraction.
// Development funds, code-set placement/entry, stubbed pointer lock; jobs advance via game ticks.
import assert from 'node:assert/strict';
import { start } from './common.mjs';
const {browser,page,q,frames,shot,newGame,errors}=await start();
await page.addInitScript(()=>{
  Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('.world-canvas')});
  Element.prototype.requestPointerLock=()=>Promise.resolve();
  document.exitPointerLock=()=>{};
});
try {
  await newGame();
  const ids=await q(()=>{
    const {game,world}=window.__quarry; game.state.money=10000;
    game.actions.buyBuilding('stockpiles');
    const truck=game.actions.buyMachine('truck','used').machine;
    const digger=game.actions.buyMachine('miniDigger','rusty').machine;
    const g=game.ctx.ground;
    const r=game.actions.digGround({x:60,z:60,radius:3,bottomY:g.heightAt(60,60)-0.6,maxTonnes:3});
    truck.load={...r.tonnes};
    window.__storeSaleCount=0; game.events.on('productSold',()=>window.__storeSaleCount++);
    world.debug.placeVehicle(truck.id,170.5,43.5,Math.PI/2);
    world.debug.enterVehicle(truck.id);
    return {truck:truck.id,digger:digger.id,total:r.total,materials:r.tonnes};
  });
  await frames(3);
  const tip=await q(()=>{
    const {game,world}=window.__quarry;
    const prompt=world.hudInfo().prompt; world.handleAction('tip');
    const m=game.state.machines.find(m=>m.type==='truck');
    return {prompt,params:m.job?.params,duration:m.job?.duration};
  });
  assert.equal(tip.params?.stockpileBay,'west',JSON.stringify(tip));
  await q(seconds=>window.__quarry.game.advance(Math.ceil(seconds*window.__quarry.game.data.game.ticksPerSecond)+1),tip.duration);
  const store=await q(()=>window.__quarry.game.state.stockpiles.home.west);
  assert.deepEqual(store,ids.materials);
  await q(ids=>{
    const {world}=window.__quarry;
    world.debug.exitVehicle(); world.debug.placeVehicle(ids.truck,188,18,0);
    world.debug.placeVehicle(ids.digger,170.5,44,-Math.PI/2);
    world.debug.enterVehicle(ids.digger);
    document.querySelector('.world-canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
  },ids);
  await frames(3);
  await q(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
  const job=await q(id=>window.__quarry.game.state.machines.find(m=>m.id===id).job,ids.digger);
  assert.equal(job?.params.stockpileBay,'west',JSON.stringify(job));
  await q(seconds=>window.__quarry.game.advance(Math.ceil(seconds*window.__quarry.game.data.game.ticksPerSecond)+1),job.duration);
  const after=await q(id=>{
    const {game}=window.__quarry;
    const bucket=game.state.machines.find(m=>m.id===id).load;
    return {bucket,stock:game.state.stockpiles.home.west,sales:window.__storeSaleCount};
  },ids.digger);
  assert.ok(Object.values(after.bucket).reduce((a,b)=>a+b,0)>0);
  for(const [id,t] of Object.entries(ids.materials)) assert.ok(Math.abs((after.stock[id]??0)+(after.bucket[id]??0)-t)<1e-8);
  assert.equal(after.sales,0);
  await q(()=>{const d=window.__quarry.world.debug;d.exitVehicle();const m=window.__quarry.game.state.machines.find(m=>m.type==='miniDigger');d.placeVehicle(m.id,198,19,Math.PI);d.teleportPlayer(170.5,38,0);d.aimAt(170.5,47);});
  // Hide transient notifications for the visual record only.
  await page.addStyleTag({content:'.toasts,.mentor { visibility:hidden; }'});
  await shot('yard-stockpiles');
  await page.keyboard.press('Tab'); await frames(30);
  assert.ok((await page.locator('body').innerText()).includes('West bay'));
  await page.setViewportSize({width:960,height:540}); await frames(3);
  await page.locator('.map-stores').scrollIntoViewIfNeeded();
  await shot('stockpiles-map',{big:false});
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ids,tip,after,errors}));
}finally{await browser.close();}

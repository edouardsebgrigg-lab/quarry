// D14: customer/pair UI, operator bucket-to-truck transfer and an intentional customer sale.
// Dev funds/progress, actual shallow cut placed in the bucket, code parking/phase, stubbed lock.
import assert from 'node:assert/strict';
import {start} from './common.mjs';
const {browser,page,q,frames,shot,newGame,errors}=await start({width:1280,height:800});
await page.addInitScript(()=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('.world-canvas')});Element.prototype.requestPointerLock=()=>Promise.resolve();document.exitPointerLock=()=>{};});
try{
 await newGame();
 const ids=await q(()=>{
  const {game:g,world:w}=window.__quarry;g.state.money=60000;
  const ex=g.actions.buyMachine('excavator','used').machine.id,tr=g.actions.buyMachine('truck','used').machine.id;
  g.actions.buyMachine('dumper','rusty');g.actions.buyMachine('miniDigger','rusty');
  g.state.stats.totalEarned=25000;g.state.contracts.reputation=5;g.dev.skipDays(1);
  const a=g.actions.hireStaff(g.state.staff.applicants[0].id).worker,b=g.actions.hireStaff(g.state.staff.applicants[0].id).worker;
  w.debug.placeVehicle(ex,70,95,0);w.debug.placeVehicle(tr,67,99,0);
  g.state.contracts.active=[{id:999,client:'Pair customer',material:'topsoil',tonnes:5,delivered:0,bonus:50,deadline:100}];
  window.__pairDumps=[];g.events.on('operatorDump',e=>window.__pairDumps.push(e));
  return {ex,tr,a:a.id,b:b.id,operator:a.name};
 });
 await frames(3);await page.keyboard.press('KeyB');await frames(3);await page.locator('.lt-dock-app',{hasText:'Staff'}).click();
 await page.locator('.st-worker').nth(0).getByRole('button',{name:'Digger operator',exact:true}).click();
 await page.locator('.st-worker').nth(1).getByRole('button',{name:'Haulage driver',exact:true}).click();
 await page.locator('.st-worker').nth(1).getByRole('button',{name:'Pair customer: Topsoil',exact:true}).click();
 await page.locator('.st-worker').nth(1).getByRole('button',{name:ids.operator,exact:true}).click();
 const selected=await q(()=>window.__quarry.game.state.staff.workers.map(w=>({id:w.id,role:w.role,delivery:w.delivery,partner:w.partnerId})));
 assert.equal(selected[1].delivery.id,999);assert.equal(selected[1].partner,ids.a);
 await page.addStyleTag({content:'.toasts,.mentor{visibility:hidden}'});
 await shot('staff-customer-pair',{big:false});
 await page.keyboard.press('Escape');
 const cut=await q(ids=>{
  const {game:g}=window.__quarry;const gr=g.ctx.ground,h=gr.heightAt(60,60);
  const r=g.actions.digGround({x:60,z:60,radius:8,bottomY:h-0.2,maxTonnes:0.5});
  g.state.machines.find(m=>m.id===ids.ex).load={...r.tonnes};
  const a=g.state.staff.workers.find(w=>w.id===ids.a),b=g.state.staff.workers.find(w=>w.id===ids.b);a.phase='dumpAim';a.t=0;b.t=10;
  for(let i=0;i<40&&!window.__pairDumps.some(e=>e.intoMachineId===ids.tr);i++)g.advance(1);
  const tr=g.state.machines.find(m=>m.id===ids.tr);
  return {total:r.total,materials:r.tonnes,load:{...tr.load},dumps:window.__pairDumps};
 },ids);
 assert.ok(cut.total>=0.4,JSON.stringify(cut));assert.deepEqual(cut.load,cut.materials);assert.ok(cut.dumps.some(e=>e.intoMachineId===ids.tr));
 await q(()=>{const d=window.__quarry.world.debug;d.teleportPlayer(63,109,0);d.aimAt(69,96);});
 await frames(40);
 await shot('operator-loading-truck');
 const sale=await q(ids=>{
  const {game:g}=window.__quarry;const b=g.state.staff.workers.find(w=>w.id===ids.b);b.t=0;
  // Halt further operator cuts while observing this one conserved customer load.
  g.actions.assignStaff(ids.a,null);
  for(let i=0;i<2200&&b.stats.loads===0;i++)g.advance(1);
  return {loads:b.stats.loads,order:g.state.contracts.active[0].delivered,away:g.state.machines.find(m=>m.id===ids.tr).away,driver:b.status};
 },ids);
 assert.equal(sale.loads,1,JSON.stringify(sale));assert.ok(sale.order>0);assert.deepEqual(errors,[]);console.log(JSON.stringify({selected,cut,sale,errors}));
}finally{await browser.close();}

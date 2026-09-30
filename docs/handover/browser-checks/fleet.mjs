// Approved fleet smoke check in the actual world. Uses dev purchases/placement,
// forced time gate and code-set controls; does not measure normal-money progression.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { start } from './common.mjs';
const {browser,page,errors,q,frames,shot,newGame}=await start();
await page.addInitScript(()=>{const settings=JSON.parse(localStorage.getItem('quarry.settings')||'{}');settings.diggerControls='direct';localStorage.setItem('quarry.settings',JSON.stringify(settings));Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.querySelector('canvas')});HTMLCanvasElement.prototype.requestPointerLock=function(){document.dispatchEvent(new Event('pointerlockchange'));};});
const report={variants:[],driving:[],articulation:[],limitations:'Software WebGL; development money, code placement and controls; stubbed pointer lock. No pacing or new save-format change.'};
try{
 await newGame();
 const ids=await q(()=>{
  const g=window.__quarry.game;g.state.money=1e6;
  const ids={pickup:g.state.machines.find(m=>m.type==='pickup').id};
  for(const tier of ['rusty','used'])for(const type of ['miniDigger','dumper','tractor','excavator','truck']){
   const r=g.actions.buyMachine(type,tier);if(!r.ok)throw Error(JSON.stringify(r));ids[type+'_'+tier]=r.machine.id;
  }
  return ids;
 });
 await frames(4);
 report.variants=await q(ids=>Object.entries(ids).map(([name,id])=>{
  const v=window.__quarry.world.debug.vehicle(id);if(!v?.model)throw Error('Missing '+name);
  const mats=new Set();v.model.root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});
  if(![...mats].some(m=>m.normalMap&&m.roughnessMap))throw Error('Unrefined fallback '+name);
  if(v.trailer){let found=false;v.trailer.model.root.traverse(o=>{if(o.isMesh&&o.material.normalMap)found=true;});if(!found)throw Error('Unrefined trailer '+name);}
  return {name,hasPBR:true,hasTrailer:!!v.trailer};
 }),ids);
 console.log('All fleet variants instantiated with approved PBR materials');
 for(const name of ['pickup','miniDigger_rusty','dumper_rusty','tractor_rusty','excavator_rusty','truck_rusty']){
  const id=ids[name];
  await q(({id})=>{const d=window.__quarry.world.debug;d.exitVehicle();d.placeVehicle(id,60,110,Math.PI/2);d.enterVehicle(id);d.setCamMode('chase');const v=d.vehicle(id);for(let i=0;i<3;i++)v.update(1,{occupied:true,fill:0,bucketFull:false});d.setKeys(['forward']);},{id});
  const before=await q(id=>window.__quarry.world.debug.vehicle(id).position().toArray(),id);
  await frames(16);
  await q(()=>window.__quarry.world.debug.setKeys([]));
  const moved=await q(({id,before})=>{const v=window.__quarry.world.debug.vehicle(id),p=v.position();return {distance:Math.hypot(p.x-before[0],p.z-before[2]),speed:v.speed(),engine:v.feel().engine};},{id,before});
  assert.ok(moved.distance>.03,JSON.stringify({name,...moved}));report.driving.push({name,...moved});console.log('Drove',name,moved.distance.toFixed(2),'m');
  if(name==='pickup') await shot('fleet-pickup-chase',{big:false});
  if(name==='miniDigger_rusty'||name==='excavator_rusty'){
   const previous=await q(id=>{const v=window.__quarry.world.debug.vehicle(id);v.setDirect(true);return [v.model.boomPivot.rotation.z,v.model.stickPivot.rotation.z,v.model.bucketPivot.rotation.z];},id);
   await q(()=>window.__quarry.world.debug.setDirectInput({boom:1,stick:0,bucket:0}));await frames(16);
   const angles=await q(id=>{const v=window.__quarry.world.debug.vehicle(id);return [v.model.boomPivot.rotation.z,v.model.stickPivot.rotation.z,v.model.bucketPivot.rotation.z];},id);
   assert.ok(angles.some((a,i)=>Math.abs(a-previous[i])>.01),name+' arm did not move');report.articulation.push({name,previous,angles});
   await q(()=>window.__quarry.world.debug.setDirectInput(null));
  }
 }
 // Tipping animation is exercised through real controllers with a synthetic job,
 // without changing game inventories or invoking the economy.
 report.tipping=await q(ids=>['pickup','dumper_rusty','tractor_rusty','truck_rusty'].map(name=>{
  const v=window.__quarry.world.debug.vehicle(ids[name]);v.update(1,{job:{type:'tip',elapsed:2,duration:5},fill:.5,occupied:true});
  const angle=v.trailer?v.trailer.state.bed:v.model.skipPivot?.rotation.z??v.model.bedPivot?.rotation.z??v.model.tailgate?.rotation.z;
  if(!Number.isFinite(angle)||Math.abs(angle)<.02)throw Error('No tipping movement '+name);
  return {name,angle};
 }),ids);
 await q(()=>{const d=window.__quarry.world.debug;d.exitVehicle();d.teleportPlayer(60,118,0);d.setFootPitch(-.12);});await frames(3);
 await shot('fleet-in-world',{big:false});
 assert.deepEqual(errors,[]);report.pageErrors=errors;
 await fs.writeFile(process.env.OUT+'/fleet-checks.json',JSON.stringify(report,null,2));console.log('PASS',JSON.stringify(report));
}catch(error){report.failure=error.message;await fs.writeFile(process.env.OUT+'/fleet-checks.json',JSON.stringify(report,null,2));throw error;}finally{await browser.close();}

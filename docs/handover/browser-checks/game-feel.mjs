// Real key/mouse routing for survey and operating telemetry; placements/cash are fixtures.
import {writeFileSync} from 'node:fs';
import {start} from './common.mjs';
const {browser,page,q,frames,newGame,shot,errors}=await start({width:960,height:540});
page.setDefaultTimeout(20000);
const report={checks:[],samples:[],errors:[]};
await page.addInitScript(()=>{
 window.__lockEl=null;
 Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>window.__lockEl});
 Element.prototype.requestPointerLock=()=>Promise.resolve();
});
const check=(ok,label)=>{report.checks.push({label,passed:!!ok});if(!ok)throw new Error(label);};
const totals=()=>q(()=>Object.values(window.__quarry.game.ctx.ground.totals()).reduce((a,b)=>a+b,0)+window.__quarry.game.state.machines.reduce((a,m)=>a+Object.values(m.load).reduce((a,b)=>a+b,0),0));
const click=async()=>{await q(()=>document.querySelector('.world-canvas').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));await frames(2);await q(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));};
try{
 await newGame();
 await q(()=>{
  const {world,settings}=window.__quarry;settings.cameraMotion=0;
  world.debug.teleportPlayer(70,70);world.debug.aimAt(70.25,68.25);
  window.__lockEl=document.querySelector('.world-canvas');document.dispatchEvent(new Event('pointerlockchange'));
 });
 await frames(30);
 const before=await totals();
 await page.keyboard.press('KeyL');await frames(45);
 const survey=await q(()=>window.__quarry.world.hudInfo().survey);report.samples.push({survey});
 check(!survey.empty&&survey.surface.id==='topsoil','L surveys the actual field through keyboard routing');
 check(survey.layers.some(l=>l.id==='gravel')&&survey.bedrockDepth>0,'Survey exposes remaining strata and bedrock depth');
 check(Math.abs(await totals()-before)<.0001,'Survey creates no material');
 await shot('feel-survey',{big:false});
 await q(()=>{
  const {game,world}=window.__quarry,g=game.ctx.ground;
  const depth=g.inspectAt(70.25,68.25).layers[0].thickness+.06;
  const removed=game.actions.digGround({x:70.25,z:68.25,radius:1,bottomY:g.heightAt(70.25,68.25)-depth});
  game.actions.dumpGround({x:70.25,z:75.25,radius:1,tonnes:removed.tonnes});
  world.debug.aimAt(70.25,68.25);
 });
 await frames(35);
 const cut=await q(()=>window.__quarry.world.hudInfo().survey);report.samples.push({cutSurvey:cut});
 check(!cut.empty&&cut.surface.id==='clay','Survey updates after a real excavation exposes clay');
 await page.keyboard.press('KeyL');await frames(3);
 check(await q(()=>window.__quarry.world.hudInfo().survey===null),'L closes the survey');
 await q(()=>{
  const {game,world,settings}=window.__quarry;
  game.state.flags.unlockAll=true;game.state.money=100000;
  const m=game.actions.buyMachine('miniDigger','mini16').machine;window.__feel={digger:m.id};
  world.debug.placeVehicle(m.id,42,42,0);world.debug.enterVehicle(m.id);settings.diggerControls='assisted';
 });
 await frames(140);
 const idle=await q(()=>window.__quarry.world.hudInfo().machine);report.samples.push({idle});
 check(idle.material?.name&&idle.attachment==='Standard bucket','Actual occupied digger supplies material and attachment');
 check(idle.capacityVolume>0&&idle.loadVolume===0,'Empty bucket telemetry uses real loose volume');
 const allBefore=await totals();
 await click();
 for(let n=0;n<40;n++){await frames(20);if(await q(()=>!window.__quarry.game.state.machines.find(m=>m.id===window.__feel.digger).job))break;}
 const filled=await q(()=>window.__quarry.world.hudInfo().machine);report.samples.push({filled});
 check(filled.loadVolume>0&&filled.bucketFill01>0,'Real Assisted cut drives live bucket-volume feedback');
 check(filled.bucketFill01<=1&&filled.hydraulicLoad>=0&&filled.hydraulicLoad<=1,'Capacity and hydraulic effort remain bounded');
 check(Math.abs(await totals()-allBefore)<.02,'New digging presentation conserves ground and cargo');
 await shot('feel-digger',{big:false});
 await page.keyboard.press('KeyL');await frames(45);
 check(await q(()=>!window.__quarry.world.hudInfo().survey?.empty),'Digger survey reads the working area');
 await shot('feel-digger-survey',{big:false});
 await page.keyboard.press('KeyL');
 await q(()=>{window.__quarry.settings.cameraMotion=0;window.__quarry.settings.fieldOfView=95;});await frames(10);
 check(await q(()=>Math.abs(window.__quarry.world.debug.camera.fov-95)<.01),'Actual camera applies chosen95degreeFOV');
 const stableA=await q(()=>({eye:window.__quarry.world.debug.eye(),seat:window.__quarry.world.debug.vehicle(window.__feel.digger).seatWorld().toArray()}));
 await frames(10);
 check(stableA.eye.every((v,i)=>Math.abs(v-stableA.seat[i])<1e-6),'Zero motion setting removes cab sway');
 await page.keyboard.press('KeyC');await frames(70);
 check(await q(()=>window.__quarry.world.hudInfo().machine.camera==='chase'),'Chase camera remains available with widerFOV');
 await shot('feel-chase',{big:false});
 check(errors.length===0,'No browser runtime errors');
}catch(e){report.failure=e.stack;throw e;}finally{
 report.errors=[...errors];writeFileSync(`${process.env.OUT}/game-feel.json`,JSON.stringify(report,null,2));await browser.close();
}
console.log('PASS',report.checks.length,'game feel checks');

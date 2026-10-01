// Actual world control routing: progressive assisted cuts, independent direct levers,
// partially filled buckets, physical dumps, trailer attachment, loaded barrow recovery.
import { writeFileSync } from 'node:fs';
import { start } from './common.mjs';
const { browser, page, q, frames, shot, newGame, errors } = await start();
const report = { checks: [], samples: [] };
await page.addInitScript(() => {
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
});
const check = (condition, label) => { report.checks.push({ label, passed: !!condition }); if (!condition) throw new Error(label); };
const mouse = (type) => q(type => {
  (type === 'mousedown' ? document.querySelector('.world-canvas') : window).dispatchEvent(new MouseEvent(type,{button:0,bubbles:true}));
}, type);
const sample = () => q(() => {
  const { game,world } = window.__quarry;
  const m = game.state.machines.find(m=>m.id===window.__ops.excavator);
  const tonnes = Object.values(m.load).reduce((a,b)=>a+b,0);
  const all = Object.values(game.ctx.ground.totals()).reduce((a,b)=>a+b,0) + game.state.machines.reduce((a,m)=>a+Object.values(m.load).reduce((a,b)=>a+b,0),0);
  return { tonnes, all, job:!!m.job, bucket:world.debug.bucketState(m.id), hud:world.hudInfo().machine };
});
try {
  await newGame();
  await q(() => {
    const {game,world,settings} = window.__quarry;
    game.state.flags.unlockAll=true; game.state.money=1000000;
    const excavator=game.actions.buyMachine('excavator','utility80').machine;
    const tractor=game.actions.buyMachine('tractor','yard35').machine;
    const trailer=game.actions.buyMachine('trailer','yardTipper').machine;
    window.__ops={excavator:excavator.id,tractor:tractor.id,trailer:trailer.id};
    world.debug.placeVehicle(excavator.id,40,40,0);
    world.debug.placeVehicle(tractor.id,58,40,0);
    world.debug.placeVehicle(trailer.id,52,40,0);
    world.debug.enterVehicle(excavator.id);
    settings.diggerControls='assisted';
    window.__lockEl=document.querySelector('.world-canvas'); document.dispatchEvent(new Event('pointerlockchange'));
  });
  await frames(140); // Engine starts through the normal occupied-machine update.
  const before = await sample();
  await mouse('mousedown'); await frames(2); await mouse('mouseup');
  for (let i=0;i<30;i++) { await frames(20); const s=await sample(); report.samples.push(s); if (!s.job) break; }
  const assisted=await sample();
  check(assisted.tonnes>0.01,'Assisted teeth progressively collect material through real world controls');
  check(Math.abs(assisted.all-before.all)<0.02,'Assisted terrain and bucket conserve mass');
  await shot('operations-assisted');
  await mouse('mousedown'); await frames(2); await mouse('mouseup');
  const atDumpStart=await sample();
  check(atDumpStart.tonnes>0,'Assisted dump keeps cargo until the bucket opens');
  await frames(240);
  const dumped=await sample();
  check(dumped.tonnes<assisted.tonnes,'Assisted dump actually transfers material when bucket opens');
  check(Math.abs(dumped.all-assisted.all)<0.02,'Dump conserves material');

  await q(()=>{
    const {game,world}=window.__quarry;
    const m=game.state.machines.find(m=>m.id===window.__ops.excavator),g=game.ctx.ground;
    m.load={...game.actions.digGround({x:70.25,z:70.25,radius:.4,bottomY:g.heightAt(70.25,70.25)-.1,maxVolume:.02}).tonnes};
    world.debug.setHouseYaw(.45);
  });
  const rememberedBefore=await sample();
  report.rememberedBefore=rememberedBefore;
  check(rememberedBefore.tonnes>0,'Remembered-dump fixture collects a real small load from a ground cell');
  await page.keyboard.press('KeyT'); await frames(300);
  const rememberedAfter=await sample();
  report.rememberedAfter=rememberedAfter;
  report.rememberedRig=await q(()=>({pose:window.__quarry.world.debug.vehicle(window.__ops.excavator).placement(),state:window.__quarry.world.debug.vehicle(window.__ops.excavator).state,toasts:[...document.querySelectorAll('.toast')].map(n=>n.textContent)}));
  check(rememberedBefore.tonnes>0 && rememberedAfter.tonnes<1e-6,'T returns to the remembered Assisted dump target and pours');
  check(Math.abs(rememberedAfter.all-rememberedBefore.all)<.02,'Remembered dumping conserves material');

  await q(() => {
    const {game,world,settings}=window.__quarry;
    const m=game.state.machines.find(m=>m.id===window.__ops.excavator);
    game.actions.dumpBucket(m.id,{x:70,z:40});
    m.load={topsoil:.015}; // Seed the historical 10kg false-full regression.
    settings.diggerControls='direct';
  });
  const partial=await sample();
  await page.keyboard.down('ArrowDown'); await frames(40); await page.keyboard.up('ArrowDown');
  await page.keyboard.down('KeyK'); await page.keyboard.down('ArrowLeft'); await frames(70);
  await page.keyboard.up('KeyK'); await page.keyboard.up('ArrowLeft');
  const direct=await sample();
  check(direct.tonnes>partial.tonnes,'Direct levers continue filling an already partly loaded bucket');
  check(Math.abs(direct.all-partial.all)<0.02,'Direct cuts conserve mass');
  const teeth=direct.bucket.teeth;
  await page.keyboard.down('KeyU'); await frames(25); await page.keyboard.up('KeyU');
  const slewed=await sample();
  check(Math.hypot(slewed.bucket.teeth.x-teeth.x,slewed.bucket.teeth.z-teeth.z)>.05,'Independent slew key moves the house');
  await shot('operations-direct');

  await q(()=>{
    const {game,world,settings}=window.__quarry,m=game.state.machines.find(m=>m.id===window.__ops.excavator);
    game.actions.dumpBucket(m.id,{x:70,z:40});
    settings.diggerControls='assisted';
    world.debug.setCamMode('chase');world.debug.setLook(.6,0);
    game.actions.setDiggerAttachment(m.id,'trench');
  });
  await frames(160);await shot('operations-trench');
  await q(()=>window.__quarry.game.actions.setDiggerAttachment(window.__ops.excavator,'grading'));
  await frames(10);await shot('operations-grading');
  await q(()=>window.__quarry.game.actions.setDiggerAttachment(window.__ops.excavator,'breaker'));
  await frames(10);await shot('operations-breaker');

  const hitched=await q(() => {
    const {game,world}=window.__quarry;
    world.handleAction('interact');
    world.debug.placeVehicle(window.__ops.tractor,58,40,0);
    return game.actions.attachTrailer(window.__ops.tractor,window.__ops.trailer);
  });
  check(hitched.ok,'Separate tractor and trailer can be hitched nearby');
  await q(()=>window.__quarry.world.debug.enterVehicle(window.__ops.tractor));
  await q(()=>window.__quarry.world.debug.setCamMode('chase')); await frames(40);
  await shot('operations-hitchedup');
  const detached=await q(()=>window.__quarry.game.actions.detachTrailer(window.__ops.tractor));
  check(detached.ok,'Trailer can be unhitched without losing its entity');
  await frames(10); await shot('operations-unhitched');
  await q(()=>{
    const {game,world}=window.__quarry;
    world.handleAction('interact');
    game.state.tools.barrow.load={topsoil:.04};
    world.handleAction('recover');
  });
  check(await q(()=>window.__quarry.game.state.tools.barrow.load.topsoil===.04),'Barrow recovery retains its cargo');
  const saved=await q(()=>{
    const {game,world}=window.__quarry;
    world.writePositions(game.state);
    const pose=game.state.positions.machines[window.__ops.excavator];
    window.__quarry.saveTo('slot1');
    return {ids:window.__ops,pose,barrow:{...game.state.tools.barrow.load}};
  });
  await page.reload();await page.getByText('Continue',{exact:true}).click();
  await page.waitForFunction(()=>window.__quarry?.world);
  await q(ids=>{window.__ops=ids;window.__quarry.gate.force(true);},saved.ids);
  await frames(5);
  const restored=await q(id=>{
    const {game,world}=window.__quarry,v=world.debug.vehicle(id);
    return {pose:v.placement(),bucket:world.debug.bucketState(id),load:game.state.machines.find(m=>m.id===id).load,barrow:game.state.tools.barrow.load};
  },saved.ids.excavator);
  check(Math.abs(restored.bucket.phi-saved.pose.arm.reduce((a,b)=>a+b,0))<.01,'Saved arm joint pose restores correctly');
  check(Math.abs(restored.pose.aimReach-saved.pose.aimReach)<.01 && Math.abs(restored.pose.cutDepth-saved.pose.cutDepth)<.01,'Saved reach and depth guides restore');
  check(JSON.stringify(restored.pose.lastDump)===JSON.stringify(saved.pose.lastDump),'Remembered dump target survives save/reload');
  check(JSON.stringify(restored.barrow)===JSON.stringify(saved.barrow),'Recovered barrow cargo survives save/reload');
  check(errors.length===0,'No browser runtime errors');
} finally {
  report.errors=errors;
  writeFileSync(`${process.env.OUT}/operations.json`,JSON.stringify(report,null,2));
  await browser.close();
}

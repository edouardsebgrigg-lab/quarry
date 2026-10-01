// Full runtime model audit. Enter/camera/drive/arm/tip use normal keyboard routing;
// debug only positions the isolated fixture and supplies renderer measurements.
import { writeFileSync } from 'node:fs';
import { start } from './common.mjs';
const { browser, page, q, frames, shot, newGame, errors } = await start({ width: 640, height: 360 });
const report = { models: [], errors: [] };
await page.addInitScript(() => {
  window.__lockEl = null;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => window.__lockEl });
  Element.prototype.requestPointerLock = () => Promise.resolve();
});
const sample = () => q(() => {
  const { game, world } = window.__quarry;
  const v = world.debug.vehicle(window.__fitId), T = window.__fitThree;
  const box = new T.Box3();
  const meshes = [];
  v.model.root.updateMatrixWorld(true);
  v.model.root.traverse(o => {
    if (!o.isMesh || o.name === 'TrackShoe') return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    box.union(new T.Box3().setFromObject(o)); meshes.push(o);
  });
  const camera = world.debug.camera, eye = camera.position.clone();
  const ray = new T.Raycaster(eye, camera.getWorldDirection(new T.Vector3()), .05, 2);
  const opaque = meshes.filter(o => (Array.isArray(o.material) ? o.material : [o.material]).some(m => !m.transparent || m.opacity > .7));
  const forwardHit = ray.intersectObjects(opaque, false)[0];
  ray.set(eye, new T.Vector3(0,1,0)); ray.near = 0; ray.far = 5;
  const roof = ray.intersectObjects(opaque, false)[0];
  const corners = [];
  for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) corners.push(new T.Vector3(x,y,z).project(camera).toArray());
  const wheels = (v.model.wheels ?? []).map(w => {
    const wb = new T.Box3().setFromObject(w.spin), p = wb.getCenter(new T.Vector3());
    return { centre:p.toArray(),groundClearance:wb.min.y-game.ctx.ground.heightAt(p.x,p.z),size:wb.getSize(new T.Vector3()).toArray() };
  });
  const trailerWheels = (v.trailer?.model.wheels ?? []).map(w => {
    const b = new T.Box3().setFromObject(w),p=b.getCenter(new T.Vector3());
    return {centre:p.toArray(),groundClearance:b.min.y-game.ctx.ground.heightAt(p.x,p.z)};
  });
  let visualTeeth = null;
  if(v.digger){
    const tooth = v.type==='miniDigger'?new T.Vector3(.407,.095,0):new T.Vector3(.92,.22,0);
    visualTeeth=v.model.bucketPivot.localToWorld(tooth).toArray();
  }
  return { driving:game.state.player.driving,mode:world.debug.mode(),camera:world.hudInfo().machine?.camera,
    pose:v.placement(),speed:v.speed(),eye:eye.toArray(),seat:v.seatWorld?.().toArray(),bounds:{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new T.Vector3()).toArray()},
    forwardHit:forwardHit?{distance:forwardHit.distance,node:forwardHit.object.name}:null,
    roofClearance:roof?{distance:roof.distance,node:roof.object.name}:null,projectedBounds:corners,wheels,
    bedFloor:v.carrier?v.bedFloorWorldY?.()??null:null,bed:v.carrier?v.bedWorld().toArray():null,
    tip:v.feel?.().bedAngle??v.state?.skip??v.state?.bed,bucket:v.digger?world.debug.bucketState(v.machineId):null,visualTeeth,trailerWheels,
    attached:v.trailer?{pose:v.trailerPlacement(),eye:v.trailer.model.root.localToWorld(v.trailer.model.eyeLocal.clone()).toArray(),hitch:v.model.root.localToWorld(v.model.hitchLocal.clone()).toArray()}:null };
});
const press = async key => { await page.keyboard.press(key); await frames(3); };
const hold = async (keys, count) => { for (const key of keys) await page.keyboard.down(key); await frames(count); for (const key of keys) await page.keyboard.up(key); await frames(3); };
try {
  await newGame();
  await q(async () => {
    window.__fitThree = await import('/node_modules/three/build/three.module.js');
    const {game} = window.__quarry;
    game.state.money=1e8;game.state.flags.unlockAll=true;
    window.__lockEl=document.querySelector('.world-canvas');document.dispatchEvent(new Event('pointerlockchange'));
    for(const s of ['.hud','.hud3d','.feedback'])document.querySelectorAll(s).forEach(e=>e.style.visibility='hidden');
  });
  let models = await q(() => Object.entries(window.__quarry.game.data.machines.types).flatMap(([type,t])=>Object.entries(t.tiers).map(([tier,s])=>({type,tier,name:s.modelName??`${t.name} ${tier}`,legacy:!!s.legacy}))));
  if(process.env.FIT_MODELS) models=models.filter(m=>process.env.FIT_MODELS.split(',').includes(`${m.type}-${m.tier}`));
  for(const [index,model] of models.entries()) {
    console.log('audit',model.type,model.tier);
    const row={...model,checks:[]};report.models.push(row);
    try {
      const fixture=await q(model=>{
        const {game,world,settings}=window.__quarry;
        world.debug.exitVehicle();
        for(const old of game.state.machines)world.debug.placeVehicle(old.id,180+game.state.machines.indexOf(old)*14,80,0);
        let m=model.type==='pickup'?game.state.machines.find(m=>m.type==='pickup'):game.actions.buyMachine(model.type,model.tier).machine;
        if(!m)throw new Error('Machine purchase failed');
        let tow=null;
        if(model.type==='trailer') {
          tow=game.actions.buyMachine('tractor','haul210').machine;
          world.debug.placeVehicle(tow.id,44,40,0);world.debug.placeVehicle(m.id,38,40,0);
          const attached=game.actions.attachTrailer(tow.id,m.id);if(!attached.ok)throw new Error(attached.reason);
        } else world.debug.placeVehicle(m.id,44,40,0);
        window.__fitId=tow?.id??m.id;window.__fitMachine=m.id;
        const v=world.debug.vehicle(window.__fitId),p=v.position();
        world.debug.teleportPlayer(p.x,p.z-v.radius-.6);
        settings.diggerControls='direct';world.debug.setCamMode('cab');
        return {id:window.__fitId,machineId:m.id,tow:!!tow};
      },model);
      row.fixture=fixture;
      await frames(60);await press('KeyE');await frames(130);
      row.cab=await sample();row.checks.push({label:'E enters occupied cab',passed:row.cab.driving===fixture.id});
      row.checks.push({label:'Cab eye and rig geometry are finite',passed:[...row.cab.eye,...row.cab.bounds.size].every(Number.isFinite)});
      if(row.cab.driving!==fixture.id)throw new Error('Normal E entry failed');
      await shot(`${model.type}-${model.tier}-cab`);
      await press('KeyC');await q(()=>window.__quarry.world.debug.setLook(.48,-.1));await frames(55);
      row.chase=await sample();row.checks.push({label:'C selects chase',passed:row.chase.camera==='chase'});
      row.checks.push({label:'Chase frames complete machine',passed:row.chase.projectedBounds.every(p=>Math.abs(p[0])<=1&&Math.abs(p[1])<=1&&p[2]<1)});
      await shot(`${model.type}-${model.tier}-chase`);
      await hold(['KeyW'],55);await hold(['KeyS','Space'],45);
      row.moved=await sample();row.distance=Math.hypot(row.moved.pose.x-row.chase.pose.x,row.moved.pose.z-row.chase.pose.z);
      row.checks.push({label:'W moves drivetrain',passed:row.distance>.025});
      if(row.cab.bucket){
        await hold(['ArrowUp','KeyK','ArrowLeft'],35);await hold(['KeyU'],25);
        row.work=await sample();row.checks.push({label:'Independent arm and slew move rig',passed:Math.abs(row.work.bucket.phi-row.cab.bucket.phi)>.01});
        const teeth=row.work.bucket.teeth;
        row.toothGap=Math.hypot(row.work.visualTeeth[0]-teeth.x,row.work.visualTeeth[1]-teeth.y,row.work.visualTeeth[2]-teeth.z);
        row.checks.push({label:'Visual cutting teeth match terrain contact',passed:row.toothGap<.025});
      }else if(['truck','dumper','trailer','pickup','fourByFour'].includes(model.type)){
        await q(()=>{const {game}=window.__quarry;game.state.machines.find(m=>m.id===window.__fitMachine).load={topsoil:.12};});
        await press('KeyT');await frames(90);row.work=await sample();
        row.checks.push({label:'T creates unloading pose',passed:!!row.work.tip||['pickup','fourByFour'].includes(model.type)});
      }
      if(row.work)await shot(`${model.type}-${model.tier}-work`);
      if(row.cab.attached){row.hitchGap=Math.hypot(...row.cab.attached.eye.map((n,i)=>n-row.cab.attached.hitch[i]));row.checks.push({label:'Trailer eye aligns with towing hitch',passed:row.hitchGap<.005});}
      await hold(['Space'],90);await press('KeyE');
      row.exited=await q(()=>window.__quarry.game.state.player.driving==null);
      row.checks.push({label:'E exits after braking',passed:row.exited});
      console.log('result',model.type,model.tier,row.distance,row.checks.every(c=>c.passed)?'PASS':'REVIEW');
    }catch(error){row.error=error.stack;console.log('model error',error.message);}
    writeFileSync(`${process.env.OUT}/fleet-fit.json`,JSON.stringify({...report,errors},null,2));
  }
}finally{
  report.errors=errors;writeFileSync(`${process.env.OUT}/fleet-fit.json`,JSON.stringify(report,null,2));await browser.close();
}
const failed=report.models.filter(m=>m.error||m.checks.some(c=>!c.passed));
if(errors.length||failed.length)throw new Error(`Fleet fit failed: ${failed.map(m=>`${m.type}/${m.tier}`).join(', ')}; browser errors: ${errors.length}`);

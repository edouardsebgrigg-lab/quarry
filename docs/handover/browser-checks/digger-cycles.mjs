// Real authored models, arm paths, input routing and material transfers. Money, placement,
// small-load seeding from actual ground, fixed-step updates and pointer lock are fixtures.
// This is not a human excavation session or a frame-rate benchmark.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { start } from './common.mjs';
const {browser,page,q,frames,newGame,errors}=await start();
const out=process.env.OUT||'/tmp/quarry-digger-cycles';await mkdir(out,{recursive:true});
const report={models:[],errors,fixtures:['Purchase money and machine placement','Small cargo cut from real ground and assigned to the bucket','Fixed 1/60 second world/job updates','Simulated pointer lock and mouse clicks','Scene hidden between screenshots']};
await page.addInitScript(()=>{
  window.__lockEl=null;
  Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>window.__lockEl});
  Element.prototype.requestPointerLock=function(){window.__lockEl=this;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  document.exitPointerLock=()=>{window.__lockEl=null;document.dispatchEvent(new Event('pointerlockchange'));};
});
const install=()=>q(async()=>{
  const {tickJobs}=await import('/src/machinery/jobs.js');
  const {pileTotal}=await import('/src/quarry/piles.js');
  const {getStats}=await import('/src/machinery/stats.js');
  const {bucketFill}=await import('/src/machinery/digging.js');
  const {game:g,world:w}=window.__quarry;w.debug.scene.visible=false;
  window.__cycles={
    step(n){for(let i=0;i<n;i++){tickJobs(g.ctx,1/60);w.update(1/60,{paused:false,keyboard:{isHeld:()=>false}});}},
    mass:()=>pileTotal(g.ctx.ground.totals())+g.state.machines.reduce((s,m)=>s+pileTotal(m.load),0),
    sample(id){const m=g.state.machines.find(m=>m.id===id);return {tonnes:pileTotal(m.load),fill:bucketFill(g.ctx.ground,getStats(g.data,m),m.load),job:!!m.job,prompt:w.hudInfo().prompt,feedback:w.hudInfo().machine.workFeedback,pose:w.debug.bucketState(id)};},
    click(){const canvas=document.querySelector('.world-canvas');window.__lockEl=canvas;document.dispatchEvent(new Event('pointerlockchange'));canvas.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));this.step(1);window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));},
  };
});
const screenshot=async name=>{
  await q(()=>{window.__quarry.world.debug.scene.visible=true;window.__quarry.world.debug.setCamMode('chase');});
  await page.setViewportSize({width:960,height:540});await frames(3);await page.screenshot({path:`${out}/${name}.png`});
  await page.setViewportSize({width:320,height:180});await q(()=>{window.__quarry.world.debug.scene.visible=false;});
};
try {
  await newGame({force:false});await install();
  const ids=await q(()=>{
    const {game:g,world:w,settings}=window.__quarry;g.state.money=1000000;g.state.flags.unlockAll=true;settings.diggerControls='assisted';
    return ['miniDigger','excavator'].flatMap(type=>Object.entries(g.data.machines.types[type].tiers).filter(([,t])=>!t.legacy).map(([tier])=>{
      const r=g.actions.buyMachine(type,tier);if(!r.ok)throw Error(r.reason);return r.machine.id;
    })).map((id,i)=>{w.debug.placeVehicle(id,35+(i%4)*25,40+Math.floor(i/4)*35,0);return id;});
  });
  // Reproduce the former 10 kg deadlock using a small amount removed from real ground.
  const small=await q(id=>{
    const {game:g,world:w}=window.__quarry,m=g.state.machines.find(m=>m.id===id);w.debug.enterVehicle(id);window.__cycles.step(180);
    m.load=g.actions.digGround({x:80.25,z:120.25,radius:.4,bottomY:g.ctx.ground.heightAt(80.25,120.25)-.1,maxVolume:.003}).tonnes;
    return {sample:window.__cycles.sample(id),mass:window.__cycles.mass()};
  },ids[0]);
  report.small=small;assert.ok(small.sample.tonnes>0&&small.sample.tonnes<.01);
  assert.match(JSON.stringify(small.sample.prompt),/Dump here/,'small Assisted bite must offer a dump');
  assert.match(small.sample.feedback.label,/Bucket loaded/);
  await q(()=>window.__quarry.gate.force(true));await frames(420);
  assert.match(await page.locator('.mw-state').innerText(),/Bucket loaded/);
  assert.match((await page.locator('.md-val').allTextContents()).join(' '),/0\.003\/0\.030 m³/);
  await screenshot('digger-small-load');
  const emptied=await q(id=>{window.__cycles.click();window.__cycles.step(600);return {sample:window.__cycles.sample(id),mass:window.__cycles.mass()};},ids[0]);
  assert.equal(emptied.sample.tonnes,0);assert.ok(Math.abs(emptied.mass-small.mass)<1e-5);
  console.log('ok small physical bite can be dumped');

  for(const id of ids) {
    const result=await q(id=>{
      const {game:g,world:w}=window.__quarry,m=g.state.machines.find(m=>m.id===id);w.debug.enterVehicle(id);window.__cycles.step(180);
      const before=window.__cycles.mass();window.__cycles.click();
      const started=!!m.job;let count=0;while(m.job&&count++<3600)window.__cycles.step(1);
      const dug=window.__cycles.sample(id),afterDig=window.__cycles.mass();
      window.__cycles.step(180);window.__cycles.click();window.__cycles.step(600);
      return {id,type:m.type,tier:m.tier,started,dug,dumped:window.__cycles.sample(id),before,afterDig,afterDump:window.__cycles.mass()};
    },id);
    report.models.push(result);console.log('model',JSON.stringify(result));
    assert.equal(result.started,true,`${result.tier} did not start its physical cycle`);
    assert.equal(result.dug.job,false,`${result.tier} dig did not finish`);
    assert.ok(result.dug.tonnes>0,`${result.tier} real teeth failed to collect material`);
    assert.ok(result.dug.fill.volume<=result.dug.fill.capacity+1e-6);
    assert.equal(result.dumped.tonnes,0,`${result.tier} failed to pour its physical load`);
    assert.ok(Math.abs(result.afterDig-result.before)<1e-5,`${result.tier} dig lost material`);
    assert.ok(Math.abs(result.afterDump-result.before)<1e-5,`${result.tier} dump lost material`);
  }
  await screenshot('digger-heavy-cycle');
  // A tiny saved remainder must retain the same available action after Continue.
  const saved=await q(id=>{
    const {game:g,world:w}=window.__quarry,m=g.state.machines.find(m=>m.id===id);w.debug.enterVehicle(id);
    m.load=g.actions.digGround({x:90.25,z:120.25,radius:.4,bottomY:g.ctx.ground.heightAt(90.25,120.25)-.1,maxVolume:.002}).tonnes;
    window.__quarry.saveTo('slot1');return {load:structuredClone(m.load),money:g.state.money};
  },ids[0]);
  await page.reload();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForFunction(()=>window.__quarry?.world);await install();
  const restored=await q(id=>{const {game:g,world:w}=window.__quarry;w.debug.enterVehicle(id);return {load:g.state.machines.find(m=>m.id===id).load,money:g.state.money,prompt:w.hudInfo().prompt};},ids[0]);
  assert.deepEqual(restored.load,saved.load);assert.equal(restored.money,saved.money);assert.match(JSON.stringify(restored.prompt),/Dump here/);
  const afterReload=await q(id=>{window.__cycles.step(180);window.__cycles.click();window.__cycles.step(600);return window.__cycles.sample(id);},ids[0]);
  assert.equal(afterReload.tonnes,0);report.saved={saved,restored,afterReload};
  assert.deepEqual(errors,[]);console.log('PASS all digger cycles, partial loads and Continue');
} catch(error) {report.failure=error.message;throw error;}
finally {await writeFile(`${out}/digger-cycles.json`,JSON.stringify(report,null,2));await browser.close();}

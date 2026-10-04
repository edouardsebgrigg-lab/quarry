// Explicit funds, earthmoving and clock fixtures. UI/physics integration, not a manual playthrough.
import assert from 'node:assert/strict';
import {start} from './common.mjs';
const {browser,page,q,frames,shot,errors,newGame}=await start({width:480,height:270});
page.setDefaultTimeout(90000);
const tab=name=>page.getByRole('button',{name,exact:true}).click();
const open=async()=>{await page.keyboard.press('b');await tab('Quarry operations');await tab('Rock blasting');};
const picture=async name=>{if(process.env.OUT){await page.setViewportSize({width:1280,height:850});await q(()=>{document.querySelector('.lt-app-body').scrollTop=0;});await frames(2);await page.screenshot({path:`${process.env.OUT}/${name}.png`});await page.setViewportSize({width:480,height:270});}};
const stage=()=>q(async()=>{const {ticksPerHour}=await import('/src/core/index.js');const g=window.__quarry.game,p=g.state.blasting.projects[0];g.advance(Math.ceil(p.remainingHours*ticksPerHour(g.data))+1);return p.stage;});
try {
 await newGame({force:false});console.log('PASS new game');
 const initial=await q(()=>{
  const g=window.__quarry.game;g.dev.addMoney(20000);g.dev.unlockAll();
  for(const id of ['stockpiles','crusher']){const r=g.actions.buyBuilding(id);if(!r.ok)throw Error(r.reason);}
  const machine=g.actions.buyMachine('miniDigger','used');if(!machine.ok)throw Error(machine.reason);
  window.blastDiggerId=g.state.machines.find(m=>m.type==='miniDigger').id;
  const before=g.ctx.ground.totals();
  const cut=g.actions.digGround({x:110,z:95,radius:12,bottomY:-100});g.actions.dumpGround({x:130,z:130,tonnes:cut.tonnes,radius:10});
  for(let i=0;i<60;i++)g.ctx.ground.settle(20000);
  window.__quarry.world.debug.teleportPlayer(110,95);
  return {before,after:g.ctx.ground.totals(),quote:g.actions.quoteBlast({x:110,z:95,patternId:'pocket'})};
 });
 assert.equal(initial.quote.ok,true,initial.quote.reason);
 for(const id of Object.keys(initial.before))assert.ok(Math.abs(initial.before[id]-initial.after[id])<.05,`fixture conserves ${id}`);
 await frames(3);await open();
 await page.getByLabel('East / X',{exact:true}).fill('110');await page.getByLabel('South / Z',{exact:true}).fill('95');
 await page.getByRole('button',{name:/Book drilling ·/}).click();
 assert.match(await page.locator('[data-blast-active]').innerText(),/Drilling/i);console.log('PASS field survey and drilling booking through UI');
 await picture('rock-cut-drilling');
 await page.keyboard.press('Escape');await q(()=>{const w=window.__quarry.world;w.debug.teleportPlayer(106,91);w.debug.aimAt(110,95);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});});await frames(3);
 assert.equal(await q(()=>window.__quarry.world.debug.scene.getObjectByName('blast-drill-rig').visible),true);
 if(process.env.OUT)await shot('contractor-drill-rig');
 assert.equal(await stage(),'drilled');
 await open();await page.getByRole('button',{name:/Book charging ·/}).click();assert.equal(await stage(),'ready');await frames(2);
 assert.equal(await page.getByRole('button',{name:'Start countdown',exact:true}).isDisabled(),true);
 assert.match(await page.locator('[data-blast-active]').innerText(),/You/);console.log('PASS staged preparation and live player clearance');
 // Save the charged project, terrain, money and physical positions; resume through Continue.
 const saved=await q(()=>{window.__quarry.saveTo('slot1');const g=window.__quarry.game;return JSON.stringify([g.state.blasting,g.state.money,g.ctx.ground.totals()]);});
 await page.reload();await page.getByText('Continue',{exact:true}).click();await page.waitForFunction(()=>window.__quarry?.world);await q(()=>window.__quarry.gate.force(false));
 assert.equal(await q(()=>{const g=window.__quarry.game;return JSON.stringify([g.state.blasting,g.state.money,g.ctx.ground.totals()]);}),saved);
 console.log('PASS charged cut, terrain, expenses and stages survive Continue');
 // Test a parked vehicle blocking the physical world provider.
 await q(()=>{const w=window.__quarry.world,g=window.__quarry.game,id=g.state.machines.find(m=>m.type==='pickup').id;window.blastTruckId=id;w.debug.teleportPlayer(87,95);w.debug.placeVehicle(id,110,95);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});});
 await open();assert.equal(await page.getByRole('button',{name:'Start countdown',exact:true}).isDisabled(),true);assert.match(await page.locator('[data-blast-active]').innerText(),/pickup/i);
 await q(()=>{const w=window.__quarry.world;w.debug.placeVehicle(window.blastTruckId,180,80);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});});await frames(2);
 await page.getByRole('button',{name:'Start countdown',exact:true}).click();
 const interrupted=await q(()=>{const w=window.__quarry.world,g=window.__quarry.game;w.debug.teleportPlayer(110,95);g.advance(1);return {stage:g.state.blasting.projects[0].stage,occupants:g.ctx.blastOccupants()};});
 assert.equal(interrupted.stage,'ready',JSON.stringify(interrupted));
 await page.getByRole('button',{name:'Start countdown',exact:true}).waitFor({state:'visible'});
 assert.match(await page.locator('[data-blast-active]').innerText(),/Ready to fire/i);assert.equal(await q(()=>window.__quarry.game.state.blasting.fired),0);
 console.log('PASS vehicle blocker and automatic countdown interruption');
 await q(()=>window.__quarry.world.debug.teleportPlayer(87,95));await frames(2);
 await picture('rock-cut-ready');
 if(process.env.OUT){await page.setViewportSize({width:390,height:844});await frames(2);assert.ok(await q(()=>{const n=document.querySelector('.lt-app-body');return n.scrollWidth<=n.clientWidth+1;}));await shot('rock-cut-narrow',{big:false});await page.setViewportSize({width:480,height:270});}
 await page.getByRole('button',{name:'Start countdown',exact:true}).click();await page.getByRole('button',{name:'Stop countdown',exact:true}).click();
 assert.equal(await q(()=>window.__quarry.game.state.blasting.projects[0].stage),'ready');
 await page.getByRole('button',{name:'Start countdown',exact:true}).click();await page.keyboard.press('Escape');
 const blast=await q(()=>{const g=window.__quarry.game,w=window.__quarry.world,before=g.ctx.ground.totals();w.debug.aimAt(110,95);g.advance(60);return {before,after:g.ctx.ground.totals(),state:g.state.blasting,stock:g.state.stockpiles};});
 assert.equal(blast.state.fired,1);assert.ok(blast.state.releasedTonnes>10);assert.equal(blast.state.history[0].cost,30);
 for(const id of Object.keys(blast.before))assert.ok(Math.abs(blast.before[id]-blast.after[id])<.05,`blast conserves ${id}`);
 console.log(`PASS real terrain blast releases ${blast.state.releasedTonnes.toFixed(2)} t without making inventory`);
 await q(()=>{const w=window.__quarry.world;w.debug.teleportPlayer(107,94);w.debug.aimAt(110,95);});await frames(4);if(process.env.OUT)await shot('blast-rubble');
 const handled=await q(()=>{
  const g=window.__quarry.game,id=g.state.machines.find(m=>m.type==='miniDigger').id,before=g.ctx.ground.totals();
  let total=0;
  for(let i=0;i<200&&total<1.1;i++) {
    const x=109.25+(i%4)*.5,z=94.25+Math.floor(i/4)%4*.5,h=g.ctx.ground.heightAt(x,z);
    const r=g.actions.bucketCut(id,{x,z,from:{x,z,y:h+.01},to:{x,z,y:h-.3},attack:1});if(!r.ok)throw Error(r.reason);
    total+=r.tonnes;const d=g.actions.dumpBucket(id,{stockpileBay:'west'});if(!d.ok)throw Error(d.reason);
  }
  const load={...g.state.stockpiles.home.west},after=g.ctx.ground.totals();
  const batch=g.actions.startProduction({plantId:'crusher',recipeId:'crushRock',sourceBay:'west',outputBay:'middle',tonnes:1});
  return {before,after,load:{...load},total,batch};
 });
 assert.ok(handled.total>=1);assert.ok(handled.load.rock>=1);assert.equal(handled.batch.ok,true,handled.batch.reason);
 // Compare terrain depletion with the material physically extracted before processing.
 assert.ok(Math.abs(handled.before.rock-handled.after.rock-handled.load.rock)<.05);
 console.log('PASS ordinary bucket extracts rubble, yard receives it and crusher accepts it');
 await open();assert.match(await page.locator('.qo-blasting').innerText(),/1 cuts fired/);await picture('rock-cut-record');
 assert.deepEqual(errors,[]);console.log('PASS responsive UI, expense/yield receipt and no browser errors');
}finally{await browser.close();}

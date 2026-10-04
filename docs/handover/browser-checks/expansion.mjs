// UI integration with explicit money, wear, cargo and placement fixtures; not a driving playthrough.
import assert from 'node:assert/strict';
import {start} from './common.mjs';
const {browser,page,q,frames,errors,newGame,shot}=await start({width:480,height:270});
page.setDefaultTimeout(90000);
try {
 await newGame({force:false});console.log('PASS fresh game');
 if(!process.env.WORLD_ONLY) {
 await q(()=>{const g=window.__quarry.game;g.dev.addMoney(20000);g.actions.buyBuilding('stockpiles');const r=g.actions.buyBuilding('crusher');if(!r.ok)throw new Error(r.reason);});
 await page.keyboard.press('b');
 await page.getByRole('button',{name:'Quarry operations',exact:true}).click();
 await page.getByRole('button',{name:'Plant workshop',exact:true}).click();
 const crusher=page.locator('[data-workshop-plant="crusher"]');
 await crusher.getByRole('button',{name:/Fit Improved drive/}).click();
 assert.match(await crusher.innerText(),/Improved drive/);
 await q(()=>{window.__quarry.game.state.production.plants.home.crusher.condition=60;});
 await frames(3);
 await crusher.getByRole('button',{name:/Service plant/}).click();
 assert.match(await crusher.innerText(),/Servicing/);
 if(process.env.OUT)await shot('plant-workshop');
 await page.getByRole('button',{name:'Work areas',exact:true}).click();
 assert.ok(!/(null|undefined|NaN)(?![a-z])/.test(await page.locator('.lt-app-body').innerText()),'fresh survey shows missing values');
 await page.getByRole('button',{name:'Record survey',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Replace recorded survey'}).count(),1);
 await page.getByRole('button',{name:'Regional trade',exact:true}).click();
 await page.getByLabel('Material to compare',{exact:true}).selectOption('topsoil');
 await page.getByLabel('Tonnes to compare',{exact:true}).fill('10');
 const nursery=page.locator('[data-buyer-id="nursery"]');
 assert.match(await nursery.innerText(),/2\.0 t stays aboard/);
 await nursery.getByRole('button',{name:'Guide me here'}).click();
 assert.match(await q(()=>window.__quarry.world.mapInfo().guide.label),/Nursery.*weighbridge/);
 if(process.env.OUT){await q(()=>{document.querySelector('.lt-app-body').scrollTop=0;});await shot('regional-trade');}
 await q(()=>window.__quarry.saveTo('slot1'));
 const saved=await q(()=>{const g=window.__quarry.game;return JSON.stringify([g.state.production,g.state.operations,g.state.player.navigationBuyerId]);});
 await page.reload();await page.getByText('Continue',{exact:true}).click();
 await page.waitForFunction(()=>window.__quarry?.world);
 await q(()=>window.__quarry.gate.force(false));
 assert.equal(await q(()=>{const g=window.__quarry.game;return JSON.stringify([g.state.production,g.state.operations,g.state.player.navigationBuyerId]);}),saved);
 console.log('PASS workshop, surveys, comparison, navigation and Continue');
 }
 const delivery=await q(async()=>{
  const {MAP}=await import('/src/world3d/map.js');
  const {hasTicket}=await import('/src/economy/index.js');
  const {game:g,world:w}=window.__quarry,m=g.state.machines[0],b=MAP.buyers.nursery;
  m.load={topsoil:10};
  const x=(b.bay.x0+b.bay.x1)/2,z=(b.bay.z0+b.bay.z1)/2;
  w.debug.placeVehicle(m.id,x,z,0);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});w.debug.enterVehicle(m.id);
  const v=w.debug.vehicle(m.id),u=v.unload().point;
  w.debug.placeVehicle(m.id,x+(x-u.x),z+(z-u.z),0);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});
  w.handleAction('tip');if(m.job)throw new Error('Unweighed regional delivery accepted');
  // Shortened dwell and explicit placements exercise actual public scale detection.
  const dwell=g.data.depot.weighSeconds;g.data.depot.weighSeconds=.01;
  for(const yard of Object.values(MAP.buyers)) {
   delete g.state.depot.tickets[m.id];const bridge=yard.bridge;
   w.debug.placeVehicle(m.id,(bridge.x0+bridge.x1)/2,(bridge.z0+bridge.z1)/2,0);
   w.update(.02,{paused:false,keyboard:{isHeld:()=>false}});
   if(!hasTicket(g.ctx,m.id))throw new Error('Regional scale failed');
  }
  g.data.depot.weighSeconds=dwell;
  w.debug.placeVehicle(m.id,x+(x-u.x),z+(z-u.z),0);w.update(0,{paused:true,keyboard:{isHeld:()=>false}});w.handleAction('tip');
  if(m.job?.params.buyerId!=='nursery')throw new Error(`World did not dispatch regional tip: ${JSON.stringify({tail:v.unload().point,job:m.job,hud:w.hudInfo().prompt})}`);
  g.advance(Math.ceil(m.job.duration*g.data.game.ticksPerSecond)+1);
  return {left:m.load.topsoil,history:g.state.trade.history,ticket:hasTicket(g.ctx,m.id)};
 });
 assert.equal(delivery.left,2);assert.equal(delivery.history[0].tonnes,8);assert.equal(delivery.ticket,false);
 console.log('PASS physical unloading pad dispatch and retained excess cargo');
 for(const id of ['nursery','concrete','roadworks']) {
  await q(async id=>{const {MAP}=await import('/src/world3d/map.js');const w=window.__quarry.world,r=MAP.buyers[id].yard;w.debug.teleportPlayer((r.x0+r.x1)/2,r.z1+8);w.debug.aimAt((r.x0+r.x1)/2,(r.z0+r.z1)/2);},id);
  await frames(3);if(process.env.OUT)await shot(`yard-${id}`);
 }
 await page.keyboard.press('b');await page.getByRole('button',{name:'Regional trade',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await frames(2);
 assert.ok(await q(()=>{const b=document.querySelector('.lt-app-body');return b.scrollWidth<=b.clientWidth+1;}),'regional UI overflows narrow view');
 if(process.env.OUT){
  await shot('regional-trade-narrow',{big:false});
  await q(()=>{document.querySelector('.lt-app-body').scrollTop=0;});await shot('regional-trade');
 }
 assert.deepEqual(errors,[]);console.log('PASS three visible yards, narrow UI and no console errors');
} finally {await browser.close();}

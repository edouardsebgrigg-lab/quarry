// Focused keyboard and narrow-screen check. Preparation/position/clock are explicit fixtures.
import assert from 'node:assert/strict';
import {start} from './common.mjs';
const {browser,page,q,frames,shot,errors,newGame}=await start({width:480,height:270});
const tab=name=>page.getByRole('button',{name,exact:true}).click();
try {
 await newGame({force:false});
 await q(async()=>{
  const {ticksPerHour}=await import('/src/core/index.js');const g=window.__quarry.game,w=window.__quarry.world;
  g.dev.addMoney(1000);
  const soil=g.actions.digGround({x:110,z:95,radius:12,bottomY:-100});g.actions.dumpGround({x:130,z:130,tonnes:soil.tonnes,radius:10});
  for(let i=0;i<60;i++)g.ctx.ground.settle(20000);
  const start=g.actions.startBlast({x:110,z:95,patternId:'pocket'});if(!start.ok)throw Error(start.reason);
  let p=g.state.blasting.projects[0];g.advance(Math.ceil(p.remainingHours*ticksPerHour(g.data))+1);
  const charge=g.actions.chargeBlast(p.id);if(!charge.ok)throw Error(charge.reason);
  g.advance(Math.ceil(p.remainingHours*ticksPerHour(g.data))+1);
  w.debug.teleportPlayer(87,95);w.debug.aimAt(110,95);
  const fire=g.actions.fireBlast(p.id);if(!fire.ok)throw Error(fire.reason);
  if(w.hudInfo().prompt.text!=='Stop countdown')throw Error('Missing field stop prompt');
 });
 await page.keyboard.press('e');await frames(2);
 assert.equal(await q(()=>window.__quarry.game.state.blasting.projects[0].stage),'ready');
 assert.equal(await q(()=>window.__quarry.game.state.blasting.fired),0);
 console.log('PASS E stops countdown through real keyboard dispatch');
 await page.keyboard.press('b');await tab('Quarry operations');await tab('Rock blasting');
 await page.setViewportSize({width:390,height:844});await frames(2);
 const layout=await q(()=>{
  const active=document.querySelector('.qo-blast-active'),map=document.querySelector('.qo-blast-map'),body=document.querySelector('.lt-app-body');body.scrollTop=0;
  return {active:active.getBoundingClientRect().top,map:map.getBoundingClientRect().top,overflow:body.scrollWidth-body.clientWidth};
 });
 assert.ok(layout.active<layout.map);assert.ok(layout.overflow<=1);
 if(process.env.OUT)await shot('rock-cut-narrow-controls',{big:false});
 await page.getByRole('button',{name:'Start countdown',exact:true}).click();
 await page.getByRole('button',{name:'Stop countdown',exact:true}).click();
 assert.equal(await q(()=>window.__quarry.game.state.blasting.projects[0].stage),'ready');
 assert.deepEqual(errors,[]);console.log('PASS narrow active controls precede the map, both countdown buttons work and no browser errors');
}finally{await browser.close();}

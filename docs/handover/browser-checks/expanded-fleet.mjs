import {writeFileSync} from 'node:fs';
import {start} from './common.mjs';
const {browser,page,q,frames,shot,newGame,errors}=await start();
const report={models:[],checks:[]};
try {
 await newGame();
 await q(()=>{const {game}=window.__quarry;game.state.money=1000000;game.state.flags.unlockAll=true;});
 const models=await q(()=>Object.entries(window.__quarry.game.data.machines.types).flatMap(([type,t])=>Object.entries(t.tiers).filter(([,s])=>!s.legacy && s.modelId && !['pickup','dumper','truck'].includes(type)).map(([tier,s])=>({type,tier,name:s.modelName}))));
 await q(()=>window.__fleetPhotos=window.__quarry.world.createProductPhotos({width:400,height:250}));
 for(const model of models){
  const result=await q(model=>{const {game,world}=window.__quarry;const r=game.actions.buyMachine(model.type,model.tier);if(!r.ok)throw new Error(r.reason);const m=r.machine;const n=game.state.machines.length;world.debug.placeVehicle(m.id,20+(n%6)*19,20+Math.floor(n/6)*25,0);const v=world.debug.vehicle(m.id);return {id:m.id,hasVehicle:!!v,position:v?.placement(),photo:window.__fleetPhotos.photo(model.type,model.tier)};},model);
  if(!result.photo||!result.hasVehicle)throw new Error(`Missing rendered model ${model.name}`);
  writeFileSync(`${process.env.OUT}/${model.type}-${model.tier}.png`,Buffer.from(result.photo.split(',')[1],'base64'));
  delete result.photo;report.models.push({...model,...result});await frames(3);
 }
 await q(()=>window.__fleetPhotos.dispose());
 await frames(20);
 const counts=await q(()=>{const {game}=window.__quarry;return Object.fromEntries(['digger','trailer','transport'].map(kind=>[kind,game.state.machines.filter(m=>game.data.machines.types[m.type].kind===kind).length]));});
 report.counts=counts;
 if(counts.digger!==8||counts.trailer!==5)throw new Error('Wrong expanded catalogue counts');
 await page.keyboard.press('KeyB');await frames(4);await shot('expanded-dealer');
 await page.keyboard.press('Escape');await frames(4);
 await q(()=>window.__quarry.world.debug.teleportPlayer(75,105,Math.PI/2));await frames(4);await shot('expanded-yard');
 if(errors.length)throw new Error(`Runtime errors: ${errors.join('\n')}`);
 report.checks.push('All 22 models render and spawn without browser errors');
}finally{report.errors=errors;writeFileSync(`${process.env.OUT}/expanded-fleet.json`,JSON.stringify(report,null,2));await browser.close();}

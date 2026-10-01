import {beforeAll,describe,it,expect}from'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import{createPlayer}from'./player.js';
beforeAll(async()=>RAPIER.init());
function setup(){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.timestep=1/60;
 world.createCollider(RAPIER.ColliderDesc.cuboid(20,1,20).setTranslation(0,-1,0));
 let before;const player=createPlayer({physics:{RAPIER,world,onBeforeStep(fn){before=fn;return()=>{};}},spawn:{x:0,y:0,z:0}});
 const tick=()=>{before(1/60);world.step();};for(let i=0;i<30;i++)tick();
 return{world,player,tick};
}
describe('character controller integration',()=>{
 it('held space launches once, lands, and stays grounded until a new press',()=>{
  const{world,player,tick}=setup();player.input.jump=true;let peaks=0,last=0,max=0;
  for(let i=0;i<180;i++){tick();const h=player.feet().y;max=Math.max(max,h);if(h>.25&&last<=.25)peaks++;last=h;}
  expect(peaks).toBe(1);expect(max).toBeGreaterThan(.6);expect(max).toBeLessThan(.95);expect(player.grounded()).toBe(true);
  player.input.jump=false;tick();player.input.jump=true;for(let i=0;i<10;i++)tick();expect(player.feet().y).toBeGreaterThan(.5);
  player.destroy();world.free();
 });
 it('stops immediately when pushing a barrow and resets stale motion after teleport/disable',()=>{
  const{world,player,tick}=setup();player.input.forward=1;player.input.maxSpeed=1.5;
  for(let i=0;i<30;i++)tick();const z=player.feet().z;player.input.forward=0;for(let i=0;i<20;i++)tick();expect(player.feet().z).toBeCloseTo(z,5);
  player.input.maxSpeed=null;player.input.forward=1;for(let i=0;i<30;i++)tick();expect(player.motion().speed).toBeGreaterThan(4);
  player.teleport(8,0,8);player.input.forward=0;for(let i=0;i<12;i++)tick();expect(player.feet().z).toBeCloseTo(8,5);expect(player.motion().speed).toBe(0);
  player.setEnabled(false);player.input.forward=1;for(let i=0;i<5;i++)tick();expect(player.motion().moving).toBe(false);
  player.setEnabled(true);player.input.forward=0;for(let i=0;i<12;i++)tick();expect(player.feet().z).toBeCloseTo(8,5);
  player.destroy();world.free();
 });
});

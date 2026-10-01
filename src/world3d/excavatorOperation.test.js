import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createTestGame } from '../game/testing.js';
import { getStats, tickJobs } from '../machinery/index.js';
import { bucketFill, cuttingAttack } from '../machinery/digging.js';
import { createExcavator, POUR_ANGLE } from './excavator.js';

// Keep the real arm, hydraulics, transforms and ground; replace GPU assets and engine audio.
vi.mock('./models.js', () => {
  const model = () => {
    const root = new THREE.Group(), house = new THREE.Group(); house.position.y=1.05; root.add(house);
    const boomPivot=new THREE.Group(),stickPivot=new THREE.Group(),bucketPivot=new THREE.Group();
    house.add(boomPivot); boomPivot.add(stickPivot); stickPivot.add(bucketPivot);
    return { root,house,boomPivot,stickPivot,bucketPivot,rams:[],cabSeat:new THREE.Vector3(),setBucketLoad:vi.fn() };
  };
  return { buildExcavatorModel:model,buildMiniDiggerModel:model };
});
vi.mock('./engineLife.js', () => ({ createEngineLife: () => ({ update(){},running:()=>true,takeEvents:()=>[],state:'running' }) }));
vi.mock('./trackDrive.js', () => ({ TRACKS: {excavator:{corners:[],gauge:2,step:.75,spread:.9},miniDigger:{corners:[],gauge:1,step:.4,spread:.5}},
  createTrackDrive:()=>({drive(){},step:()=>0,moving:()=>false,settle(){},input:{}}) }));

function setup() {
  const game=createTestGame(44),ground=game.ctx.ground;
  const machine=game.state.machines.find(m=>m.type==='excavator');
  const descriptor={setTranslation(){return this;}};
  const body={setNextKinematicTranslation(){},setNextKinematicRotation(){}};
  const physics={RAPIER:{RigidBodyDesc:{kinematicPositionBased:()=>descriptor},ColliderDesc:{cuboid:()=>descriptor}},
    world:{createRigidBody:()=>body,createCollider(){},removeRigidBody(){}}};
  const v=createExcavator({physics,scene:new THREE.Scene(),terrain:ground,machine,spawn:{x:40,z:40},stats:()=>getStats(game.data,machine),live:()=>machine});
  return {game,ground,machine,v};
}

describe('physical excavator cycles',()=>{
  it('the actual assisted tooth path cuts material before cycle completion',()=>{
    const {game,ground,machine,v}=setup();
    const target=v.bucketTarget();
    game.actions.scoop(machine.id,{x:target.x,z:target.z,physical:true,depth:.35,groundY:ground.heightAt(target.x,target.z)});
    let from=v.directState().teeth,cuts=0;
    for(let i=0;i<1200 && machine.job;i++) {
      const fill=bucketFill(ground,getStats(game.data,machine),machine.load);
      v.update(1/60,{job:machine.job,bucketFull:fill.full,bucketLoaded:fill.loaded,occupied:true});
      const state=v.directState();
      const attack=cuttingAttack(from,state.teeth,v.houseWorldYaw(),state.phi);
      if(state.under && attack>0 && !fill.full) {
        const r=game.actions.bucketCut(machine.id,{x:state.teeth.x,z:state.teeth.z,from,to:state.teeth,attack});
        if(r.tonnes>0) cuts++;
      }
      from=state.teeth;
      tickJobs(game.ctx,1/60);
    }
    expect(cuts).toBeGreaterThan(2);
    expect(bucketFill(ground,getStats(game.data,machine),machine.load).volume).toBeGreaterThan(.01);
  });

  it('dump transfer waits for the real bucket to reach its pouring angle',()=>{
    const {v}=setup();
    v.startDump(0,{x:46,z:40});
    expect(v.takeDumpTarget()).toBeNull();
    let destination=null;
    for(let i=0;i<600 && !destination;i++) {
      v.update(1/60,{bucketFull:true,bucketLoaded:true,occupied:true});
      destination=v.takeDumpTarget();
      if(destination) expect(v.directState().phi).toBeGreaterThan(POUR_ANGLE);
    }
    expect(destination).toEqual({x:46,z:40});
    expect(v.takeDumpTarget()).toBeNull();
  });

  it('visual and simulation teeth agree on tilted machines and pause does not move joints',()=>{
    const {v}=setup();
    v.state.pitch=.2;v.state.roll=-.15;
    v.update(0,{bucketFull:false,occupied:true});
    const physical=v.directState().teeth,visible=v.teethWorld();
    expect(visible.distanceTo(new THREE.Vector3(physical.x,physical.y,physical.z))).toBeLessThan(1e-8);
    v.setDirect(true);v.directInput({boom:-1,stick:1});
    v.update(0,{bucketFull:false,occupied:true});
    expect(v.directState().teeth).toEqual(physical);
  });
});

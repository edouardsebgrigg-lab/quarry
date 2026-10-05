import { it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { surveyFaces, faceTarget, activeWorkFace, workFacePlan } from './faces.js';
import { surveyWorkArea } from './operations.js';

it('recommends the least covered real layer without changing terrain, money or state',()=>{
  const g=createGame({seed:80}),before=structuredClone(g.snapshot());
  const s=surveyFaces(g.ctx,'0-0','sand'),best=s.samples[s.recommendedIndex];
  expect(s.samples).toHaveLength(9);expect(best.target.depth).toBeGreaterThan(0);
  expect(best.target.depth).toBe(Math.min(...s.samples.map(p=>p.target.depth)));
  const col=g.ctx.ground.inspectAt(best.x,best.z);
  expect(best.target.thickness).toBe(col.layers.find(l=>l.material==='sand').thickness);
  expect(g.snapshot()).toEqual(before);
});

it('distinguishes mixed loose fill, clean natural layers and exhausted bedrock',()=>{
  const g=createGame({seed:81}),sample={bedrockDepth:4,rockRemaining:2,layers:[
    {material:'sand',kind:'loose',depth:0,thickness:1,composition:{sand:.6,clay:.4}},
    {material:'sand',kind:'natural',depth:1,thickness:3}
  ]};
  expect(faceTarget(g.ctx,sample,'sand')).toMatchObject({depth:1,thickness:3,share:1,kind:'natural'});
  expect(faceTarget(g.ctx,sample,'clay')).toBeNull();
  expect(faceTarget(g.ctx,sample,'rock')).toMatchObject({depth:4,thickness:2,kind:'bedrock'});
  sample.rockRemaining=0;expect(faceTarget(g.ctx,sample,'rock')).toBeNull();
  sample.layers.unshift({material:'rock',kind:'loose',depth:0,thickness:.8,composition:{rock:.9,sand:.1}});
  expect(faceTarget(g.ctx,sample,'rock')).toMatchObject({depth:0,kind:'loose',share:.9});
});

it('saves and restores a precise face waypoint while preserving the selected machine',()=>{
  const g=createGame({seed:82}),machine=g.state.player.selectedMachineId;
  g.state.money=10000;g.actions.buyLand('south');g.actions.navigateLand('ridge');
  const s=surveyFaces(g.ctx,'south/1-1','sand'),i=s.recommendedIndex;
  expect(g.actions.planWorkFace({areaId:s.id,materialId:'sand',sampleIndex:i})).toEqual({ok:true});
  expect(activeWorkFace(g.ctx)).toMatchObject({x:s.samples[i].x,z:s.samples[i].z,materialId:'sand',sampleIndex:i});
  expect(g.state.player.navigationLandId).toBeNull();expect(g.state.player.selectedMachineId).toBe(machine);
  const r=createGame({state:structuredClone(g.snapshot())});expect(activeWorkFace(r.ctx)).toEqual(activeWorkFace(g.ctx));
  r.actions.navigateFleet(machine);expect(activeWorkFace(r.ctx)).toBeNull();
  r.actions.setWorkArea(s.id);expect(activeWorkFace(r.ctx)).toEqual(activeWorkFace(g.ctx));
  expect(r.actions.clearWorkFace(s.id).ok).toBe(true);expect(activeWorkFace(r.ctx)).toBeNull();
});

it('keeps a baseline when physical excavation exhausts the planned layer',()=>{
  const g=createGame({seed:83}),s=surveyFaces(g.ctx,'0-0','topsoil'),i=s.recommendedIndex,p=s.samples[i];
  g.actions.planWorkFace({areaId:s.id,materialId:'topsoil',sampleIndex:i});
  const before=structuredClone(g.state.operations.faces[s.id]),money=g.state.money;
  g.actions.digGround({x:p.x,z:p.z,radius:3,bottomY:-100});
  const now=surveyFaces(g.ctx,s.id,'topsoil');expect(now.samples[i].target).toBeNull();
  expect(g.state.operations.faces[s.id]).toEqual(before);expect(g.state.money).toBe(money);
  expect(g.actions.planWorkFace({areaId:s.id,materialId:'topsoil',sampleIndex:i}).ok).toBe(false);
  expect(activeWorkFace(g.ctx)).toMatchObject({x:p.x,z:p.z});
  expect(surveyWorkArea(g.ctx,s.id).samples[i].layers.length).toBe(0);
});

it('ignores unusable saved face metadata without disrupting legacy area navigation',()=>{
  const g=createGame({seed:86});g.actions.setWorkArea('0-0');
  g.state.operations.faces={'0-0':{materialId:'sand',sampleIndex:500,baseline:{depth:1,thickness:2}}};
  expect(workFacePlan(g.ctx,'0-0')).toBeNull();expect(activeWorkFace(g.ctx)).toBeNull();
  g.state.operations.faces['0-0'].sampleIndex=0;g.state.operations.faces['0-0'].baseline.depth=null;
  expect(workFacePlan(g.ctx,'0-0')).toBeNull();expect(g.state.operations.workAreaId).toBe('0-0');
});

it('rejects unowned areas, bad materials and invalid indices without altering an existing plan',()=>{
  const g=createGame({seed:84});g.actions.planWorkFace({areaId:'0-0',materialId:'sand',sampleIndex:0});
  const before=structuredClone(g.snapshot());
  for(const request of [
    {areaId:'ridge/0-0',materialId:'rock',sampleIndex:0},
    {areaId:'0-0',materialId:'gold',sampleIndex:0},
    {areaId:'0-0',materialId:'sand',sampleIndex:-1},
    {areaId:'0-0',materialId:'sand',sampleIndex:9},
    {areaId:'0-0',materialId:'sand',sampleIndex:.5}
  ])expect(g.actions.planWorkFace(request).ok).toBe(false);
  expect(g.actions.clearWorkFace('missing').ok).toBe(false);expect(g.snapshot()).toEqual(before);
});

it('leaves legacy area navigation available with no face plan',()=>{
  const g=createGame({seed:85});g.actions.setWorkArea('1-1');
  const r=createGame({state:structuredClone(g.snapshot())});
  expect(activeWorkFace(r.ctx)).toBeNull();expect(r.state.operations.workAreaId).toBe('1-1');
});

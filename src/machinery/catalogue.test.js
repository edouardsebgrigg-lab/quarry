import { describe, it, expect } from 'vitest';
import { loadData } from '../core/data.js';
import { createTestGame } from '../game/testing.js';
import { createMachine, getStats, describeStats } from './index.js';
import { catalogueModels, migrateFleet } from './catalogue.js';
import { attachedTrailer, loadCarrier, combinationStats, attachTrailer, detachTrailer, canDeliver, cargoRoom, cargoVolume } from './trailers.js';
import { serviceSupport } from './serviceSupport.js';

const data = loadData();
describe('expanded model catalogue', () => {
  it('offers exactly eight diggers, five tractors and five independent trailers', () => {
    expect(catalogueModels(data,'digger')).toHaveLength(8);
    expect(catalogueModels(data).filter(m=>m.type==='tractor')).toHaveLength(5);
    expect(catalogueModels(data,'trailer')).toHaveLength(5);
    expect(new Set(catalogueModels(data,'digger').map(m=>m.modelId)).size).toBe(8);
    const diggers = catalogueModels(data,'digger');
    for(let i=1;i<diggers.length;i++) {
      expect(diggers[i].bucketVolume).toBeGreaterThan(diggers[i-1].bucketVolume);
      expect(diggers[i].breakoutForce).toBeGreaterThan(diggers[i-1].breakoutForce);
      expect(diggers[i].reach).toBeGreaterThan(diggers[i-1].reach);
    }
  });
  it('keeps physical model performance independent of wear', () => {
    const m = {type:'excavator',tier:'quarry210',mods:[],condition:100};
    const good=getStats(data,m);m.condition=20;
    expect(getStats(data,m).bucketVolume).toBe(good.bucketVolume);
    expect(describeStats(data,'tractor',data.machines.types.tractor.tiers.haul210)[0].value).toBe(24);
  });
  it('preserves old tractor cargo, condition and tickets without creating duplicate trailers', () => {
    const state = { machines:[{id:'m7',type:'tractor',tier:'rusty',siteId:'home',number:1,condition:42,mods:['sideboards','tractorTyres'],load:{clay:2,gravel:1}}],
      nextMachineId:8,counters:{tractor:1},depot:{tickets:{m7:{tonnes:3,materials:{clay:2,gravel:1}}}},positions:{machines:{m7:{x:8,z:3,yaw:0}}} };
    migrateFleet(state);const trailer=state.machines[1];
    expect(trailer.load).toEqual({clay:2,gravel:1});expect(trailer.condition).toBe(42);
    expect(trailer.mods).toEqual(['sideboards']);expect(state.machines[0].mods).toEqual(['tractorTyres']);
    expect(state.machines[0].load).toEqual({});expect(state.machines[0].trailerId).toBe(trailer.id);
    expect(state.depot.tickets.m7.carrierId).toBe(trailer.id);
    expect(state.positions.machines[trailer.id].x).toBeCloseTo(3.38);
    migrateFleet(state);expect(state.machines).toHaveLength(2);
    state.machines[0].trailerId=null;trailer.attachedTo=null;migrateFleet(state);expect(state.machines).toHaveLength(2);
  });
});

function rig(tractorTier='yard35',trailerTier='singleTipper') {
 const game=createTestGame();
 const tractor=createMachine(game.state,game.data,'tractor',tractorTier,game.state.currentSiteId);
 const trailer=createMachine(game.state,game.data,'trailer',trailerTier,game.state.currentSiteId);
 return {ctx:game.ctx,tractor,trailer};
}
describe('independent trailer ownership',()=>{
 it('limits available payload by gross towing mass and keeps loads with parked trailers',()=>{
   const {ctx,tractor,trailer}=rig();
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(true);
   expect(combinationStats(ctx,tractor).capacity).toBeCloseTo(1.8);
   trailer.load={gravel:1.2};
   expect(loadCarrier(ctx,tractor)).toBe(trailer);
   expect(canDeliver(ctx,tractor)).toBe(true);expect(canDeliver(ctx,trailer)).toBe(false);
   expect(detachTrailer(ctx,tractor.id).ok).toBe(true);
   expect(trailer.load).toEqual({gravel:1.2});expect(loadCarrier(ctx,tractor)).toBeNull();
   expect(canDeliver(ctx,tractor)).toBe(false);
 });
 it('rejects already hitched, overweight, moving, remote and busy combinations',()=>{
   const {ctx,tractor,trailer}=rig();trailer.load={gravel:2};
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(false);trailer.load={};
   ctx.machinePlacement=id=>id===tractor.id?{x:0,z:0}:{x:25,z:0};
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(false);
   ctx.machinePlacement=()=>({x:0,z:0});ctx.machineSpeed=()=>1;
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(false);ctx.machineSpeed=()=>0;
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(true);
   expect(attachTrailer(ctx,tractor.id,trailer.id).ok).toBe(false);
   tractor.job={type:'tip'};expect(detachTrailer(ctx,tractor.id).ok).toBe(false);
 });
 it('light materials hit bed volume before nominal payload and dense loads respect tow weight',()=>{
   const {ctx,tractor,trailer}=rig('utility60','singleTipper');
   attachTrailer(ctx,tractor.id,trailer.id);
   trailer.load={};
   const material=ctx.data.ground.materials.topsoil;
   const topsoil={topsoil:5};
   const density=material.density/material.swell;
   const room=cargoRoom(ctx,tractor,topsoil);
   expect(room).toBeCloseTo(Math.min(3,getStats(ctx.data,trailer).bedVolume*density));
   trailer.load={topsoil:room};
   expect(cargoRoom(ctx,tractor,topsoil)).toBeLessThan(1e-6);
   expect(cargoVolume(ctx,trailer.load)).toBeGreaterThan(0);
 });
 it('a runabout does not count as a load delivery vehicle',()=>{
   const game=createTestGame();const quad=createMachine(game.state,game.data,'quad','standard',game.state.currentSiteId);
   expect(canDeliver(game.ctx,quad)).toBe(false);
 });
 it('service van support needs a nearby working van',()=>{
   const {ctx,tractor}=rig();const van=createMachine(ctx.state,ctx.data,'serviceVan','standard',tractor.siteId);
   ctx.machinePlacement=id=>id===van.id?{x:20,z:0}:{x:0,z:0};
   expect(serviceSupport(ctx,tractor).time).toBe(1);
   ctx.machinePlacement=id=>id===van.id?{x:5,z:0}:{x:0,z:0};
   expect(serviceSupport(ctx,tractor)).toMatchObject({time:.7,cost:.85,vanId:van.id});
   van.broken=true;expect(serviceSupport(ctx,tractor).time).toBe(1);
 });
});

import { describe,it,expect } from 'vitest';
import { fleetProfile } from './fleetProfiles.js';
import { buildMobilityModel } from './fleetVariants.js';
import { loadData } from '../core/data.js';
const data=loadData();
describe('distinct fleet geometry and physics profiles',()=>{
 it('gives mobility models their own bodies, seats and matching four-wheel rigs',()=>{
  for(const type of ['quad','buggy','fourByFour','serviceVan']) {
   const spec=data.machines.types[type].tiers.standard,profile=fleetProfile(type,spec);
   const model=buildMobilityModel(type,profile.tuning.rideHeight,profile.shape);
   expect(model.wheels).toHaveLength(4);expect(model.cabSeat.y).toBeGreaterThan(.5);
   expect(model.root.children.length).toBeGreaterThan(7);
   expect(model.wheels[0].steerGroup.position.x).toBe(profile.shape.wheelX[0]);
  }
 });
 it('scales tractor axles, collider and ride height together and differentiates drive wheels',()=>{
   const small=fleetProfile('tractor',data.machines.types.tractor.tiers.yard35);
   const big=fleetProfile('tractor',data.machines.types.tractor.tiers.haul210);
   expect(big.shape.halfLength).toBeGreaterThan(small.shape.halfLength);
   expect(big.tuning.rideHeight).toBeGreaterThan(small.tuning.rideHeight);
   expect(small.driveWheels).toBe(2);expect(big.driveWheels).toBe(4);
 });
});

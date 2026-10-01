import {describe,it,expect} from 'vitest';
import {createFootCameraFeel} from './cameraFeel.js';
describe('camera motion comfort',()=>{
 it('has no artificial walking motion when stationary or constrained by a barrow',()=>{
  const f=createFootCameraFeel();expect(f.update(.016,{speed:0,grounded:true})).toEqual({height:0,roll:0,fov:0});
  expect(f.update(.016,{speed:4.5,grounded:true,constrained:true})).toEqual({height:0,roll:0,fov:0});
 });
 it('zero motion disables bob, landing and sprint FOV',()=>{const f=createFootCameraFeel();for(let n=0;n<60;n++)expect(f.update(1/60,{speed:8,grounded:true,sprinting:true,landed:true,landingSpeed:20},0)).toEqual({height:0,roll:0,fov:0});});
 it('does not advance on pause and reset removes previous machine or teleport impulses',()=>{
  const f=createFootCameraFeel(),m={speed:8,grounded:true,sprinting:true};for(let n=0;n<30;n++)f.update(1/60,m);
  const a=f.update(0,m),b=f.update(0,m);expect(b).toEqual(a);expect(a.fov).toBeGreaterThan(0);
  f.reset();expect(f.update(0,{})).toEqual({height:0,roll:0,fov:0});
 });
 it('requires real movement for sprint FOV and applies a remembered landing only once',()=>{
  const f=createFootCameraFeel();for(let n=0;n<60;n++)f.update(1/60,{speed:0,grounded:true,sprinting:true});
  expect(f.update(0).fov).toBe(0);
  const hit={speed:0,grounded:true,landed:true,landingSpeed:8};
  const first=Math.abs(f.update(.02,hit).height),later=Math.abs(f.update(.02,hit).height);
  expect(later).toBeLessThan(first);
 });
});

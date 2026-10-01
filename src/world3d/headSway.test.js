import{describe,it,expect}from'vitest';
import*as THREE from'three';
import{createHeadSway,springStep}from'./headSway.js';
import handling from'../../data/handling.json';
describe('stable cab suspension',()=>{
 it('has the same damped response at different frame rates',()=>{
  const run=dt=>{let x=0,v=0;for(let t=0;t<1-1e-8;t+=dt){const s=springStep(x,v,.08,dt,60,.7);x=s.position;v=s.velocity;}return{x,v};};
  expect(run(1/30).x).toBeCloseTo(run(1/144).x,10);expect(run(1/30).v).toBeCloseTo(run(1/144).v,10);
 });
 it('stays finite through variable frame times and does not kick after pause, teleport or seat changes',()=>{
  const head=createHeadSway(),position=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const vehicle={seatWorld:()=>position.clone(),speed:()=>0,feel:()=>({engine:'off'})};
  head.update(1/60,vehicle,rotation);
  for(let i=0;i<200;i++){const dt=[1/144,1/30,.08][i%3];position.x+=dt*(i/10);const s=head.update(dt,vehicle,rotation);expect(Number.isFinite(s.offset.length())).toBe(true);expect(s.offset.length()).toBeLessThanOrEqual(handling.cab.maxOffset);}
  const paused=head.update(0,vehicle,rotation).offset.clone();position.x+=50;expect(head.update(0,vehicle,rotation).offset.distanceTo(paused)).toBe(0);
  expect(head.update(1/60,vehicle,rotation).offset.length()).toBe(0);
  position.x+=50;expect(head.update(1/60,vehicle,rotation).offset.length()).toBe(0);
  expect(head.update(2,vehicle,rotation).offset.length()).toBe(0);
  const other={...vehicle,seatWorld:()=>new THREE.Vector3(400,50,900)};expect(head.update(1/60,other,rotation).offset.length()).toBe(0);
 });
});

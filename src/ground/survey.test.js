import {describe,it,expect} from 'vitest';
import {createGround} from './ground.js';
import {loadData} from '../core/index.js';
const make=()=>createGround(loadData().ground,'home',{x0:0,z0:0,seed:7});
describe('remaining-ground survey',()=>{
 it('reads actual top-down contacts without modifying material or saved terrain',()=>{
  const g=make(),before=JSON.stringify(g.serialize()),s=g.inspectAt(50.25,50.25);
  expect(s.surface.material).toBe('topsoil');
  expect(s.layers.map(l=>l.material)).toEqual(['topsoil','clay','sand','gravel']);
  expect(s.layers[1].depth).toBeCloseTo(s.layers[0].thickness,6);
  expect(s.layers.reduce((n,l)=>n+l.thickness,0)).toBeCloseTo(s.bedrockDepth,6);
  expect(JSON.stringify(g.serialize())).toBe(before);
 });
 it('updates after excavation and shows deposited mixed spoil before natural layers',()=>{
  const g=make(),x=50.25,z=50.25,before=g.inspectAt(x,z);
  g.dig({x,z,radius:.38,bottomY:g.heightAt(x,z)-before.layers[0].thickness-.1});
  const cut=g.inspectAt(x,z);expect(cut.surface.material).toBe('clay');expect(cut.bedrockDepth).toBeLessThan(before.bedrockDepth);
  g.deposit({x,z,radius:.38,tonnes:{sand:.02,gravel:.03}});
  const filled=g.inspectAt(x,z);expect(filled.layers[0].kind).toBe('loose');
  expect(Object.keys(filled.layers[0].composition).sort()).toEqual(['gravel','sand']);
  expect(Object.values(filled.layers[0].composition).reduce((a,b)=>a+b,0)).toBeCloseTo(1,6);
  expect(filled.layers[1].material).toBe('clay');
 });
 it('does not reveal a clamped edge column for invalid or outside coordinates',()=>{
  const g=make();for(const [x,z] of [[-1,50],[NaN,50],[50,Infinity],[152,50]])expect(g.inspectAt(x,z)).toBeNull();
 });
 it('reports a thin spoil cover separately from the existing cutting substrate',()=>{
  const g=make();g.deposit({x:50.25,z:50.25,radius:.38,tonnes:{gravel:.003}});
  const s=g.inspectAt(50.25,50.25);
  expect(s.layers[0].material).toBe('gravel');expect(s.surface.coverMaterial).toBe('gravel');
  expect(s.surface.material).toBe('topsoil');
  expect(s.surface.resistance).toBe(g.digResistanceAt(50.25,50.25));
 });
});

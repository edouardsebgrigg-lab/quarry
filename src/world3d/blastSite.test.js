import {it,expect} from 'vitest';
import * as THREE from 'three';
import {loadData} from '../core/index.js';
import {createGame} from '../game/index.js';
import {createPhysics} from './physics.js';
import {createBlastSite} from './blastSite.js';
import {activeBlast,tickBlasting} from '../blasting/index.js';

it('previews the terrain boundary, supplies a working rig collider and removes it before firing',async()=>{
 const data=loadData(),plot=data.ground.plots.home;plot.width=40;plot.depth=40;plot.surfaceRoll=0;plot.strata.forEach(s=>s.thickness=[0,0]);
 const game=createGame({data,seed:3});game.state.money=1000;
 const scene=new THREE.Scene(),physics=await createPhysics(),heightAt=(x,z)=>game.ctx.ground.heightAt(x,z);
 const view=createBlastSite({scene,physics,game,heightAt});
 try {
  const root=scene.getObjectByName('blast-site'),rig=scene.getObjectByName('blast-drill-rig');expect(root.visible).toBe(false);
  const request={x:20,z:20,patternId:'pocket'},q=game.actions.quoteBlast(request);view.setPreview(q.spec);
  expect(root.visible).toBe(true);expect(rig.visible).toBe(false);
  const line=scene.getObjectByName('blast-clearance'),points=line.geometry.attributes.position;
  expect(points.getX(0)).toBeCloseTo(36);expect(points.getZ(0)).toBe(20);
  game.actions.startBlast(request);view.setPreview(null);view.update(.1);physics.step(.02);
  expect(root.visible).toBe(true);expect(rig.visible).toBe(true);
  expect(physics.castRayDown(rig.position.x,rig.position.z,10)).toBeCloseTo(rig.position.y+3.1);
  const p=activeBlast(game.ctx);p.remainingHours=0;tickBlasting(game.ctx);view.update(0);physics.step(.02);
  expect(rig.visible).toBe(false);expect(physics.castRayDown(rig.position.x,rig.position.z,10)).toBeNull();
  game.actions.chargeBlast(p.id);view.update(0);expect(rig.visible).toBe(true);
  p.remainingHours=0;tickBlasting(game.ctx);view.update(0);expect(rig.visible).toBe(false);
  expect(line.material.color.getHex()).toBe(0xf05c35);
  game.actions.cancelBlast(p.id);view.update(0);expect(root.visible).toBe(false);
 }finally{view.destroy();expect(scene.children).toHaveLength(0);physics.destroy();}
});

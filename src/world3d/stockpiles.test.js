import {it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createGame} from '../game/index.js';
import {createPhysics} from './physics.js';
import {createYardStockpiles} from './stockpiles.js';
import {MAP} from './map.js';
vi.mock('./textures.js',()=>({gravelDetail:()=>null}));
it('raises the purchased bay’s physical walls, restores them from saves and removes its colliders',async()=>{
 const game=createGame();game.state.money=10000;game.actions.buyBuilding('stockpiles');
 const scene=new THREE.Scene(),physics=await createPhysics();
 let yard=createYardStockpiles({scene,physics,game,map:MAP,siteId:'home',heightAt:()=>0});
 try {
  const bay=MAP.home.stockpiles[0],other=MAP.home.stockpiles[2],x=(bay.x0+bay.x1)/2,z=bay.z1+.3;
  yard.setOwned(true);physics.step(.02);expect(physics.castRayDown(x,z,10)).toBeCloseTo(2);
  game.actions.upgradeStockpile('west');yard.refresh();physics.step(.02);expect(physics.castRayDown(x,z,10)).toBeCloseTo(2.7);
  expect(physics.castRayDown((other.x0+other.x1)/2,other.z1+.3,10)).toBeCloseTo(2);
  yard.destroy();expect(scene.children).toHaveLength(0);physics.step(.02);expect(physics.castRayDown(x,z,10)).toBeNull();
  const restored=createGame({data:game.data,state:JSON.parse(JSON.stringify(game.snapshot()))});
  yard=createYardStockpiles({scene,physics,game:restored,map:MAP,siteId:'home',heightAt:()=>0});yard.setOwned(true);physics.step(.02);
  expect(physics.castRayDown(x,z,10)).toBeCloseTo(2.7);
 } finally {yard.destroy();physics.destroy();}
});

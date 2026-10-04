// Fixed yard bays, with a saved-inventory heap and matching simple physics surface.
import * as THREE from 'three';
import { createHeap, setHeap, heapRadius } from './piles.js';
import { inRect } from './map.js';
import { stockpileLoad, stockpileConfig } from '../buildings/index.js';
import { pileTotal } from '../quarry/index.js';

export function createYardStockpiles({ scene, physics, game, map, siteId, heightAt }) {
  const { world, RAPIER } = physics;
  const root = new THREE.Group(); scene.add(root);
  let owned = false;
  const walls = [];
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8b8981, roughness: 0.95 });
  const box = (w, d, x, z, y) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), concrete);
    mesh.position.set(x, y + 1, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    const c = world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, 1, d / 2).setTranslation(x, y + 1, z));
    c.setEnabled(false); const wall={mesh,collider:c,w,d,x,z,y,height:2};walls.push(wall);return wall;
  };
  const bays = map.home.stockpiles.map((rect, i) => {
    const x = (rect.x0 + rect.x1) / 2, z = (rect.z0 + rect.z1) / 2, y = heightAt(x, z);
    const bayWalls=[box(rect.x1 - rect.x0 + 0.6, 0.6, x, rect.z1 + 0.3, y)];
    for (const sx of [rect.x0 - 0.3, rect.x1 + 0.3]) bayWalls.push(box(0.6, rect.z1 - rect.z0, sx, z, y));
    const heap = createHeap(800 + i); heap.position.set(x, y, z); root.add(heap);
    return { id: rect.id, rect, x, z, y, heap, walls:bayWalls, radius: 0, collider: null };
  });
  function refresh() {
    for (const b of bays) {
      const height=stockpileConfig(game.ctx,b.id,siteId).upgrade.wallHeight;
      for(const wall of b.walls)if(wall.height!==height) {
        wall.height=height;wall.mesh.scale.y=height/2;wall.mesh.position.y=wall.y+height/2;
        world.removeCollider(wall.collider,true);
        wall.collider=world.createCollider(RAPIER.ColliderDesc.cuboid(wall.w/2,height/2,wall.d/2).setTranslation(wall.x,wall.y+height/2,wall.z));
        wall.collider.setEnabled(owned);
      }
      const load = stockpileLoad(game.ctx, b.id, siteId), total = pileTotal(load);
      setHeap(b.heap, total, load, game.data.materials);
      b.radius = heapRadius(total);
      if (b.collider) world.removeCollider(b.collider, true);
      b.collider = owned && total > 0 ? world.createCollider(RAPIER.ColliderDesc.cone(b.radius * 0.3, b.radius).setTranslation(b.x, b.y + b.radius * 0.3, b.z)) : null;
    }
  }
  root.visible = false;
  return {
    setOwned(value) { owned = value; root.visible = owned; walls.forEach(w => w.collider.setEnabled(owned)); refresh(); },
    refresh,
    bayAt(x, z) { return owned ? bays.find(b => inRect(b.rect, x, z)) ?? null : null; },
    surfaceAt(x, z) {
      if (!owned) return -Infinity;
      let y = -Infinity;
      for (const b of bays) {
        const d = Math.hypot(x-b.x,z-b.z);
        if (d < b.radius) y = Math.max(y, b.y + 0.6 * (b.radius - d));
      }
      return y;
    },
    destroy() { for (const w of walls) world.removeCollider(w.collider, true); for (const b of bays) { if (b.collider) world.removeCollider(b.collider, true); b.heap.geometry.dispose(); b.heap.material.dispose(); } root.traverse(o => { if(o.isMesh && !bays.some(b=>b.heap===o)) o.geometry.dispose(); }); concrete.dispose(); scene.remove(root); },
  };
}

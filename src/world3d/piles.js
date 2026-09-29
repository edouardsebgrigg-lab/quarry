// Heaps of material: stockpiles at the depot, and the small heaps shown in beds, buckets,
// barrows and on the shovel.
import * as THREE from 'three';
import { gravelDetail } from './textures.js';
import { pileTotal } from '../quarry/index.js';

const DENSITY = 1.7; // tonnes per cubic metre of loose rock
const detail = { tex: null };

// A lumpy cone of unit radius and height 0.6.
function heapGeometry(seed = 1) {
  const geo = new THREE.ConeGeometry(1, 0.6, 28, 6, true);
  const pos = geo.attributes.position;
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0.29) continue; // keep the tip
    const k = 1 + (rnd() - 0.5) * 0.18;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
    pos.setY(i, y + (rnd() - 0.5) * 0.04);
  }
  geo.translate(0, 0.3, 0);
  geo.computeVertexNormals();
  return geo;
}

export function heapMaterial(color) {
  detail.tex ??= gravelDetail();
  return new THREE.MeshStandardMaterial({ color, map: detail.tex, roughness: 1 });
}

function mixColor(materials, mix) {
  const total = pileTotal(mix);
  const c = new THREE.Color(0, 0, 0);
  if (total <= 0) return new THREE.Color('#a08c70');
  for (const [id, t] of Object.entries(mix)) {
    c.add(new THREE.Color(materials[id]?.color ?? '#999').multiplyScalar(t / total));
  }
  return c;
}

// Radius of a cone heap (height = 0.6 r) holding `tonnes`.
export function heapRadius(tonnes) {
  const volume = Math.max(0, tonnes) / DENSITY;
  return Math.cbrt((3 * volume) / (0.6 * Math.PI));
}

export function createHeap(seed) {
  const mesh = new THREE.Mesh(heapGeometry(seed), heapMaterial('#a08c70'));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Sizes a heap for `tonnes`; with `mix` ({ materialId: tonnes }) it also takes the rock's colour.
export function setHeap(mesh, tonnes, mix = null, materials = null) {
  const r = heapRadius(tonnes);
  mesh.visible = r > 0.05;
  mesh.scale.set(r, r, r);
  if (mix && materials) mesh.material.color.copy(mixColor(materials, mix));
}

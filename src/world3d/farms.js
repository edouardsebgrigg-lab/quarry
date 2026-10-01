// Farmsteads out in the countryside (map.farms), so the skyline isn't empty fields: a farmhouse,
// a big steel barn, a feed silo and a stack of round straw bales around a packed-earth yard.
// Scenery only (no game logic); the ground under each one is levelled by the countryside
// (countryside.js, "flat places") and trees keep clear of it (world3d/index.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbProp } from './glbModels.js';

// A farm's yard, in its own frame (x across, z towards the front): used for levelling.
export const FARM_SIZE = { hx: 30, hz: 24 };
// Where trees and grass tufts keep out: the buildings and the yard, whichever way it faces.
export const farmClearRect = (f) => ({ x0: f.x - 30, x1: f.x + 30, z0: f.z - 30, z1: f.z + 30 });
// A point in a farm's own frame (x across, z towards its front) in the world.
export function farmPoint(f, lx, lz) {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}
// Trees round the farmhouse and the yard, just outside the keep-out square.
export const farmTrees = (f) => [[-34, 12], [-30, -22], [36, -20], [8, -36]].map(([lx, lz]) => farmPoint(f, lx, lz));
// The dirt track from the farm's gate (the front of its yard) to the nearest road: points about
// 4 m apart, and where it meets the road (for a gap in the roadside hedge).
export function farmTrack(plan, f) {
  const gate = farmPoint(f, 0, FARM_SIZE.hz * 0.7);
  let best = null;
  for (const road of plan.roads) {
    const p = plan.nearestOnRoad(road, gate.x, gate.z);
    if (!best || p.dist < best.dist) best = { ...p, road };
  }
  if (!best) return null;
  const end = { x: best.x - (best.x - gate.x) / best.dist * (best.road.hw + 0.5), z: best.z - (best.z - gate.z) / best.dist * (best.road.hw + 0.5) };
  const len = Math.hypot(end.x - gate.x, end.z - gate.z);
  const n = Math.max(2, Math.ceil(len / 4));
  const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: gate.x + (end.x - gate.x) * (i / n), z: gate.z + (end.z - gate.z) * (i / n) }));
  return { points: pts, meets: { x: best.x, z: best.z } };
}
// (a square that holds the yard whichever way the farm faces)
const REACH = Math.ceil(Math.hypot(FARM_SIZE.hx, FARM_SIZE.hz)) + 2;
export const farmRect = (f, pad = 0) => ({ x0: f.x - REACH - pad, x1: f.x + REACH + pad, z0: f.z - REACH - pad, z1: f.z + REACH + pad });

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Materials shared by every farm.
function farmMaterials() {
  return {
    yard: new THREE.MeshStandardMaterial({ color: 0x6a604f, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    straw: new THREE.MeshStandardMaterial({ color: 0xc8a95c, roughness: 0.95 }),
    strawEnd: new THREE.MeshStandardMaterial({ color: 0xb09047, roughness: 1 }),
    silo: new THREE.MeshStandardMaterial({ color: 0x9aa39b, roughness: 0.55, metalness: 0.35 }),
    siloRoof: new THREE.MeshStandardMaterial({ color: 0x6f7872, roughness: 0.6, metalness: 0.3 }),
    barn: new THREE.MeshStandardMaterial({ color: 0x55635a, roughness: 0.7, metalness: 0.2 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x9c8f7a, roughness: 0.95 }),
  };
}

// A round bale lying on its side (1.5 m across, 1.2 m long), as one merged geometry per farm.
function baleGeometry() {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14, 1);
  g.rotateZ(Math.PI / 2);
  return g;
}

export function buildFarms({ scene, physics, plan, heightAt }) {
  const farms = plan.farms ?? [];
  if (!farms.length) return { farms: [] };
  const { RAPIER, world } = physics;
  const mats = farmMaterials();
  const collider = (hx, hy, hz, x, y, z, yaw = 0) => world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
  );
  const baleGeos = [];
  const siloGeos = [];
  const roofGeos = [];

  for (const [i, f] of farms.entries()) {
    const r = rng(9001 + i * 97);
    const at = (lx, lz) => farmPoint(f, lx, lz);
    const y = heightAt(f.x, f.z);

    // The yard: packed earth and hardcore.
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(FARM_SIZE.hx * 1.4, FARM_SIZE.hz * 1.3), mats.yard);
    yard.rotation.set(-Math.PI / 2, 0, f.yaw);
    yard.position.set(f.x, y + 0.04, f.z);
    yard.receiveShadow = true;
    scene.add(yard);

    // The farmhouse, facing into the yard.
    const hp = at(-17, 6);
    const hy = heightAt(hp.x, hp.z);
    // (models face +Z at no turn; this turns the front towards the yard, the farm's +x)
    const houseYaw = f.yaw + Math.PI / 2;
    const house = glbProp(f.house ?? 'house_cottage');
    if (house) {
      house.position.set(hp.x, hy - 0.05, hp.z);
      house.rotation.y = houseYaw;
      scene.add(house);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(8.4, 5, 6), mats.wall);
      box.position.set(hp.x, hy + 2.5, hp.z);
      box.rotation.y = houseYaw;
      scene.add(box);
    }
    collider(4.2, 2.8, 3.0, hp.x, hy + 2.8, hp.z, houseYaw);

    // The barn: the steel shed, a little smaller than the dealer's.
    const bp = at(10, -8);
    const by = heightAt(bp.x, bp.z);
    const scale = 0.8 + r() * 0.15;
    const barnYaw = f.yaw - Math.PI / 2; // (its doors face back across the yard, the farm's -x)
    const barn = glbProp('shed');
    if (barn) {
      barn.position.set(bp.x, by - 0.05, bp.z);
      barn.rotation.y = barnYaw;
      barn.scale.setScalar(scale);
      scene.add(barn);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(24 * scale, 7 * scale, 16 * scale), mats.barn);
      box.position.set(bp.x, by + 3.5 * scale, bp.z);
      box.rotation.y = barnYaw;
      scene.add(box);
    }
    collider(12 * scale, 3.6 * scale, 8 * scale, bp.x, by + 3.6 * scale, bp.z, barnYaw);

    // A feed silo beside the barn (not every farm has one).
    if (r() < 0.75) {
      const sp = at(24, -14);
      const sy = heightAt(sp.x, sp.z);
      const h = 7 + r() * 3;
      const body = new THREE.CylinderGeometry(1.6, 1.6, h, 18);
      body.translate(sp.x, sy + h / 2, sp.z);
      siloGeos.push(body);
      const cone = new THREE.ConeGeometry(1.75, 1.3, 18);
      cone.translate(sp.x, sy + h + 0.65, sp.z);
      roofGeos.push(cone);
      const hopper = new THREE.CylinderGeometry(1.6, 0.3, 1.4, 18);
      hopper.translate(sp.x, sy + 0.2, sp.z); // (the cone underneath, mostly in the ground)
      siloGeos.push(hopper);
    }

    // Round bales: a stack two high in the front yard, and a few lying about.
    const stack = at(-4, 13);
    const sy = heightAt(stack.x, stack.z);
    const rows = 3 + Math.floor(r() * 3);
    for (let k = 0; k < rows; k++) {
      for (let level = 0; level < 2; level++) {
        if (level === 1 && k === rows - 1) continue;
        const g = baleGeometry();
        g.rotateY(f.yaw);
        const p = at(-4 + (k + level * 0.5) * 1.3, 13);
        g.translate(p.x, sy + 0.75 + level * 1.4, p.z);
        baleGeos.push(g);
      }
    }
    for (let k = 0; k < 3; k++) {
      const g = baleGeometry();
      g.rotateY(f.yaw + r() * Math.PI);
      const p = at(-10 + r() * 26, 19 + r() * 4);
      g.translate(p.x, heightAt(p.x, p.z) + 0.72, p.z);
      baleGeos.push(g);
    }
    collider(3, 1.5, 1, stack.x, sy + 1.5, stack.z, f.yaw);
  }

  // Dirt tracks down to the road, laid over the ground.
  const trackGeos = [];
  for (const f of farms) {
    const t = farmTrack(plan, f);
    if (!t) continue;
    const pts = t.points;
    const pos = [];
    const idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const nx = -(b.z - a.z) / len;
      const nz = (b.x - a.x) / len;
      for (const side of [-1, 1]) {
        const x = pts[i].x + nx * 1.8 * side;
        const z = pts[i].z + nz * 1.8 * side;
        pos.push(x, heightAt(x, z) + 0.06, z);
      }
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    trackGeos.push(g);
  }
  if (trackGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(trackGeos), mats.yard);
    m.receiveShadow = true;
    scene.add(m);
  }

  const add = (geos, mat) => {
    if (!geos.length) return;
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  };
  add(baleGeos, mats.straw);
  add(siloGeos, mats.silo);
  add(roofGeos, mats.siloRoof);
  return { farms };
}

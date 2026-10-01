// Farmsteads out in the countryside (map.farms), so the skyline isn't empty fields: a farmhouse,
// a big steel barn, a feed silo and a stack of round straw bales around a packed-earth yard.
// Scenery only (no game logic); the ground under each one is levelled by the countryside
// (countryside.js, "flat places") and trees keep clear of it (world3d/index.js).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbProp, glbTractor, glbTrailer } from './glbModels.js';
import { createGroundMaterial } from './groundMaterial.js';

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
// Keep tall tufts out of parked machinery, including its trailer, without clearing the field.
export function farmWorkRect(f) {
  if (!f.fieldWork) return null;
  const p = farmPoint(f, f.fieldWork.x, f.fieldWork.z);
  return { x0: p.x - 10, x1: p.x + 10, z0: p.z - 10, z1: p.z + 10 };
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
// A track's cross-section: offsets from its middle, and the ground there [grass, dirt, gravel].
const TRACK_ACROSS = [-2.1, -0.9, 0, 0.9, 2.1];
const TRACK_SPLAT = [[1, 0, 0], [0.05, 0.35, 0.6], [0.8, 0.2, 0], [0.05, 0.35, 0.6], [1, 0, 0]];

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

// Straw for the bales, drawn once: fibres wrapped round the side, a spiral on the ends.
function strawTexture(end) {
  const c = document.createElement('canvas');
  c.width = end ? 128 : 256;
  c.height = 128;
  const g = c.getContext('2d');
  const r = rng(end ? 77 : 55);
  g.fillStyle = end ? '#a88a45' : '#c6a75a';
  g.fillRect(0, 0, c.width, c.height);
  if (end) {
    for (let k = 0; k < 900; k++) {
      const a = r() * Math.PI * 2;
      const rad = r() * 62;
      g.strokeStyle = r() < 0.5 ? `rgba(220, 190, 110, ${0.3 + r() * 0.4})` : `rgba(110, 84, 36, ${0.2 + r() * 0.4})`;
      g.lineWidth = 0.6 + r();
      g.beginPath();
      g.arc(64, 64, rad, a, a + 0.25 + r() * 0.5);
      g.stroke();
    }
  } else {
    for (let k = 0; k < 1400; k++) {
      const x = r() * c.width;
      const y = r() * c.height;
      g.strokeStyle = r() < 0.55 ? `rgba(232, 204, 124, ${0.25 + r() * 0.45})` : `rgba(120, 92, 40, ${0.2 + r() * 0.4})`;
      g.lineWidth = 0.6 + r() * 0.9;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 8 + r() * 26, y + (r() - 0.5) * 3);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  if (!end) t.repeat.set(3, 1);
  t.anisotropy = 4;
  return t;
}

// Materials shared by every farm.
function farmMaterials() {
  const ground = createGroundMaterial(); // (the yard and tracks: the game's own gravel, dirt and grass)
  ground.polygonOffset = true;
  ground.polygonOffsetFactor = -2;
  ground.polygonOffsetUnits = -2;
  return {
    ground,
    straw: new THREE.MeshStandardMaterial({ map: strawTexture(false), roughness: 0.95 }),
    strawEnd: new THREE.MeshStandardMaterial({ map: strawTexture(true), roughness: 1 }),
    // (silage bales wrapped in black plastic, as most farms round here have too)
    wrap: new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.32, metalness: 0 }),
    // (painted steel, not bare metal: the shed's own cladding mirrors the sky and reads mint)
    cladding: new THREE.MeshStandardMaterial({ color: 0x5d6b5f, roughness: 0.72, metalness: 0.12 }),
    silo: new THREE.MeshStandardMaterial({ color: 0x9aa39b, roughness: 0.55, metalness: 0.35 }),
    siloRoof: new THREE.MeshStandardMaterial({ color: 0x6f7872, roughness: 0.6, metalness: 0.3 }),
    barn: new THREE.MeshStandardMaterial({ color: 0x55635a, roughness: 0.7, metalness: 0.2 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x9c8f7a, roughness: 0.95 }),
  };
}

// A round bale lying on its side (1.5 m across, 1.2 m long): its rolled side and its two ends,
// as separate geometries (they take different materials once merged per farm).
function baleGeometry() {
  const side = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16, 1, true);
  side.rotateZ(Math.PI / 2);
  const ends = [-0.6, 0.6].map((x) => {
    const e = new THREE.CircleGeometry(0.75, 16);
    e.rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2);
    e.translate(x, 0, 0);
    return e;
  });
  return { side, ends: mergeGeometries(ends) };
}

// Give a geometry the ground shader's attributes, per vertex: fn(x, y) -> [grass, dirt, gravel].
function paintVerts(geo, fn) {
  const p = geo.attributes.position;
  const s = new Float32Array(p.count * 4);
  const c = new Float32Array(p.count * 3).fill(1);
  for (let i = 0; i < p.count; i++) {
    const [grass, dirt, gravel] = fn(p.getX(i), p.getY(i), i);
    s.set([grass, dirt, gravel, 0], i * 4);
  }
  geo.setAttribute('splat', new THREE.BufferAttribute(s, 4));
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
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
  const baleEnds = [];
  const wrapGeos = [];
  const siloGeos = [];
  const roofGeos = [];

  for (const [i, f] of farms.entries()) {
    const r = rng(9001 + i * 97);
    const at = (lx, lz) => farmPoint(f, lx, lz);
    const y = heightAt(f.x, f.z);

    // The yard: packed earth and hardcore, patchy, going back to grass at its edges.
    const W = FARM_SIZE.hx * 1.4;
    const H = FARM_SIZE.hz * 1.3;
    const yardGeo = paintVerts(new THREE.PlaneGeometry(W, H, 16, 12), (x, yy) => {
      const edge = Math.min(1 - Math.abs(x) / (W / 2), 1 - Math.abs(yy) / (H / 2));
      const grass = 1 - Math.min(1, Math.max(0, edge / 0.16));
      const gravel = 0.35 + r() * 0.45;
      return [grass, (1 - grass) * (1 - gravel), (1 - grass) * gravel];
    });
    const yard = new THREE.Mesh(yardGeo, mats.ground);
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
      barn.traverse((o) => { if (o.isMesh && /Cladding/.test(o.material?.name ?? '')) o.material = mats.cladding; });
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

    // Round bales: a stack two high in the front yard, and a few lying about; straw at some farms,
    // black-wrapped silage at others.
    const silage = r() < 0.5;
    const addBale = (b) => {
      if (silage) wrapGeos.push(b.side, b.ends);
      else {
        baleGeos.push(b.side);
        baleEnds.push(b.ends);
      }
    };
    const stack = at(-4, 13);
    const sy = heightAt(stack.x, stack.z);
    const rows = 3 + Math.floor(r() * 3);
    for (let k = 0; k < rows; k++) {
      for (let level = 0; level < 2; level++) {
        if (level === 1 && k === rows - 1) continue;
        const b = baleGeometry();
        const p = at(-4 + (k + level * 0.5) * 1.3, 13);
        for (const g of [b.side, b.ends]) {
          g.rotateY(f.yaw);
          g.translate(p.x, sy + 0.75 + level * 1.4, p.z);
        }
        addBale(b);
      }
    }
    for (let k = 0; k < 3; k++) {
      const b = baleGeometry();
      const turn = f.yaw + r() * Math.PI;
      const p = at(-10 + r() * 26, 19 + r() * 4);
      for (const g of [b.side, b.ends]) {
        g.rotateY(turn);
        g.translate(p.x, heightAt(p.x, p.z) + 0.72, p.z);
      }
      addBale(b);
    }
    collider(3, 1.5, 1, stack.x, sy + 1.5, stack.z, f.yaw);

    // A neighbour's empty tractor/trailer and scattered bales in the field. These are static
    // scenery, with solid bodies, and never enter the player's fleet or economy/save state.
    if (f.fieldWork) {
      const work = f.fieldWork;
      const p = at(work.x, work.z);
      const yaw = f.yaw + work.yaw;
      const tractor = glbTractor(work.tier, 0);
      const trailer = glbTrailer(work.tier);
      if (tractor && trailer) {
        const group = new THREE.Group();
        group.name = `farm-field-machinery-${i}`;
        group.add(tractor.root, trailer.root);
        trailer.root.position.x = -1.32 - 3.3; // hitch to towing eye, as in the working fleet
        group.position.set(p.x, heightAt(p.x, p.z), p.z);
        group.rotation.y = yaw;
        scene.add(group);
        collider(1.7, 1.3, 1, p.x, group.position.y + 1.3, p.z, yaw);
        const tp = { x: p.x - 4.62 * Math.cos(yaw), z: p.z + 4.62 * Math.sin(yaw) };
        collider(2.1, 1.2, 1.15, tp.x, group.position.y + 1.2, tp.z, yaw);
      }
      // Fixed placements add no draws to the saved/economic RNG; merged with yard bales.
      for (const [dx, dz, turn] of [[-12,-8,.2],[-3,-13,1.3],[11,-5,-.5],[15,8,.6],[-15,13,1.7],[6,17,-.2]]) {
        const b = baleGeometry();
        const bp = at(work.x + dx, work.z + dz);
        for (const g of [b.side, b.ends]) {
          g.rotateY(f.yaw + turn);
          g.translate(bp.x, heightAt(bp.x, bp.z) + .75, bp.z);
        }
        addBale(b);
      }
    }
  }

  // Tracks down to the road: two gravel wheel ruts with grass up the middle, fading into the
  // field at the edges (five vertices across).
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
      for (const off of TRACK_ACROSS) {
        const x = pts[i].x + nx * off;
        const z = pts[i].z + nz * off;
        pos.push(x, heightAt(x, z) + 0.05, z);
      }
      if (i) {
        const a0 = (i - 1) * 5;
        const b0 = i * 5;
        for (let k = 0; k < 4; k++) idx.push(a0 + k, a0 + k + 1, b0 + k, a0 + k + 1, b0 + k + 1, b0 + k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { // (keep the faces up whichever way the track runs)
      const ix = g.index.array;
      for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
      g.computeVertexNormals();
    }
    paintVerts(g, (x, y, vi) => TRACK_SPLAT[vi % 5]);
    trackGeos.push(g);
  }
  if (trackGeos.length) {
    const m = new THREE.Mesh(mergeGeometries(trackGeos), mats.ground);
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
  add(baleEnds, mats.strawEnd);
  add(wrapGeos, mats.wrap);
  add(siloGeos, mats.silo);
  add(roofGeos, mats.siloRoof);
  return { farms };
}

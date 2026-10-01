// Everything built on the map: your yard (office, junk, fences and gates, the old sign), the
// power line along Mill Lane, the village of Ashby (houses, the pub, name signs), Ashby Plant
// (the machine dealer) and Ashby Aggregates (weighbridge, office and the material bays).
// Uses the Blender props (assets/models) with simple stand-ins where a model is missing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbProp } from './glbModels.js';
import { createHeap, setHeap } from './piles.js';
import { planks } from './textures.js';
import { inRect } from './map.js';

const BAY_HEAP_MAX = 170; // tonnes: the most a depot bay's heap shows (it fills the bay)

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// House footprints (length along the front, depth), matching blender/buildings.py.
const HOUSE_SIZE = { cottage: [8.4, 6.0], semi: [9.6, 7.2], bungalow: [12.0, 7.6], pub: [13.0, 7.4] };

// ---------------------------------------------------------------- signs

// A painted board: `lines` is [{ text, size, color?, font? }], on a coloured background.
function boardTexture(lines, { width = 1024, height = 512, bg = '#e4dccb', fg = '#1f3b24', border = true, weather = 0.5, seed = 3 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, width, height);
  const r = rng(seed);
  for (let i = 0; i < 200 * weather; i++) {
    const v = 150 + r() * 70;
    g.fillStyle = `rgba(${v},${v - 10},${v - 30},${0.04 + r() * 0.1})`;
    g.beginPath();
    g.arc(r() * width, r() * height, 6 + r() * 40, 0, Math.PI * 2);
    g.fill();
  }
  if (border) {
    g.strokeStyle = fg;
    g.lineWidth = height * 0.035;
    g.strokeRect(height * 0.045, height * 0.045, width - height * 0.09, height - height * 0.09);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const total = lines.reduce((a, l) => a + l.size * 1.15, 0);
  let y = (height - total) / 2;
  for (const l of lines) {
    g.fillStyle = l.color ?? fg;
    g.font = l.font ?? `bold ${l.size}px "Barlow Condensed", Impact, sans-serif`;
    g.fillText(l.text, width / 2, y + l.size * 0.6);
    y += l.size * 1.15;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// A board on two posts (or on one post with `single`), facing `yaw` (camera-style: the board's
// face points along +Z turned by yaw).
function addBoard(scene, { x, y, z, yaw = 0, w = 3, h = 1.5, lift = 1.2, tex, postColor = 0x5b4c3b, single = false }) {
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x6f6454, roughness: 0.9 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), [edge, edge, edge, edge, face, face]);
  board.position.set(x, y + lift + h / 2, z);
  board.rotation.y = yaw;
  board.castShadow = true;
  scene.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: postColor, roughness: 0.95 });
  const offs = single ? [0] : [-w / 2 + 0.15, w / 2 - 0.15];
  for (const o of offs) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, lift + h, 0.1), postMat);
    post.position.set(x + Math.cos(yaw) * o, y + (lift + h) / 2, z - Math.sin(yaw) * o);
    post.castShadow = true;
    scene.add(post);
  }
  return board;
}

// A hanging cable between two points, sagging in the middle.
function wire(a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.013, 4, false);
}

// ---------------------------------------------------------------- the places

export function buildPlaces({ scene, physics, plan, heightAt, materials, bayNames = {} }) {
  const { RAPIER, world } = physics;
  const map = plan.map;
  const collider = (hx, hy, hz, x, y, z, yaw = 0) => world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }),
  );
  const place = (name, x, z, yaw = 0, scale = 1, y = null) => {
    const obj = glbProp(name);
    if (!obj) return null;
    obj.position.set(x, y ?? heightAt(x, z), z);
    obj.rotation.y = yaw;
    obj.scale.setScalar(scale);
    scene.add(obj);
    return obj;
  };
  const standIn = (w, h, d, x, z, yaw, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    m.position.set(x, heightAt(x, z) + h / 2, z);
    m.rotation.y = yaw;
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const r = rng(77);

  // ================================================================ your yard
  const home = map.home;
  const hwb = home.weighbridge;
  const hbx = (hwb.x0 + hwb.x1) / 2, hbz = (hwb.z0 + hwb.z1) / 2;
  const hby = heightAt(hbx, hbz);
  const homeBridge = place('weighbridge', hbx, hbz, 0, 1, hby + 0.01) ??
    standIn(hwb.x1-hwb.x0, 0.05, hwb.z1-hwb.z0, hbx, hbz, 0, 0x7a7c7e);
  homeBridge.visible = false;
  const homePole = collider(0.16, 1.4, 0.14, hwb.x1 + 0.7, hby + 1.4, hwb.z1 + 0.4);
  homePole.setEnabled(false);
  const y0 = heightAt(home.office.x, home.office.z);
  const off = home.office;
  if (!place('office', off.x, off.z, off.yaw, 1, y0)) {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4), new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.9 }));
    cabin.position.set(off.x, y0 + 1.5, off.z);
    scene.add(cabin);
  }
  collider(3.95, 1.6, 1.85, off.x, y0 + 1.6, off.z);
  place('fueltank', off.x + 8, off.z + 0.5, Math.PI / 2, 1);
  collider(0.8, 1.0, 1.7, off.x + 8, y0 + 1.0, off.z + 0.5);
  // Behind the office: the old container and the junk that collects round it.
  const cx = home.workshop.x;
  const cz = home.workshop.z;
  if (place('container', cx, cz, Math.PI, 1)) collider(3.03, 1.3, 1.22, cx, y0 + 1.3, cz);
  place('drum', cx + 4.2, cz + 2.2, 0.4);
  place('drumrust', cx + 4.9, cz + 2.6, 1.3);
  place('drum', cx + 4.4, cz + 3.3, 2.2);
  collider(0.6, 0.45, 0.8, cx + 4.6, y0 + 0.45, cz + 2.7);
  if (place('tyres', cx - 4.6, cz + 1.5)) collider(0.55, 0.7, 0.55, cx - 4.6, y0 + 0.7, cz + 1.5);
  place('pallets', cx + 3.8, cz - 2.2, 0.3);
  if (place('portaloo', off.x + 6.5, off.z + 4, -Math.PI / 2)) collider(0.6, 1.2, 0.6, off.x + 6.5, y0 + 1.2, off.z + 4);
  // Commissioning reuses the existing container and tank footprints and colliders.
  const facilitySigns = {};
  for (const [id, x, z, text] of [
    ['workshop', cx, cz + 1.35, 'WORKSHOP'],
    ['fuelTank', off.x + 8, off.z + 2.35, 'BULK FUEL'],
  ]) {
    const sign = addBoard(scene, { x, y: y0 + 0.9, z, w: 2.2, h: 0.55, lift: 0,
      tex: boardTexture([{ text, size: 100 }], { bg: '#294a36', fg: '#f0ead8', weather: 0.2 }) });
    sign.name = `facility-${id}`;
    sign.visible = false;
    facilitySigns[id] = sign;
  }
  // Cones along the yard's edge by the field.
  for (const z of [-4, 4, 24, 32]) place('cone', home.yard.x0 + 1.2, z, 0);

  // Fence and gates along the lane side of the yard; fence between the yard and the field
  // (with a gap to drive through).
  const fenceZ = home.yard.z0 - 1;
  const dw = home.driveway;
  const fencePosts = [];
  for (let x = home.yard.x0 - 3; x + 3 <= dw.x0 - 0.2; x += 3) fencePosts.push([x, fenceZ, 0]);
  for (let x = dw.x1 + 0.2; x + 3 <= home.yard.x1; x += 3) fencePosts.push([x, fenceZ, 0]);
  const fieldX = home.plot.x1 + 3;
  for (let z = home.yard.z0; z + 3 <= home.fieldGap.z0; z += 3) fencePosts.push([fieldX, z, -Math.PI / 2]);
  for (let z = home.fieldGap.z1; z + 3 <= home.yard.z1 + 4; z += 3) fencePosts.push([fieldX, z, -Math.PI / 2]);
  for (const [x, z, yaw] of fencePosts) place('fence', x, z, yaw, 1, heightAt(x, z));
  place('gate', dw.x0, fenceZ, -1.75, 1, heightAt(dw.x0, fenceZ));
  place('gate', dw.x1, fenceZ, Math.PI + 1.75, 1, heightAt(dw.x1, fenceZ));
  for (const x of [dw.x0, dw.x1]) collider(0.15, 1, 0.15, x, heightAt(x, fenceZ) + 0.5, fenceZ);
  // Low invisible rails so machines can't drive through the fences.
  for (const [x0, x1] of [[home.yard.x0 - 3, dw.x0], [dw.x1, home.yard.x1]]) {
    collider((x1 - x0) / 2, 0.7, 0.1, (x0 + x1) / 2, heightAt((x0 + x1) / 2, fenceZ) + 0.4, fenceZ);
  }
  for (const [z0, z1] of [[home.yard.z0, home.fieldGap.z0], [home.fieldGap.z1, home.yard.z1 + 4]]) {
    collider(0.1, 0.7, (z1 - z0) / 2, fieldX, heightAt(fieldX, (z0 + z1) / 2) + 0.4, (z0 + z1) / 2);
  }
  // The old sign by the gate.
  const sign = home.sign;
  addBoard(scene, {
    x: sign.x, y: heightAt(sign.x, sign.z), z: sign.z, yaw: 0.12, w: 3.2, h: 1.6, lift: 1.1,
    tex: boardTexture([
      { text: 'MILL LANE PIT', size: 120 },
      { text: 'TOPSOIL  ·  SAND  ·  GRAVEL  ·  FILL', size: 52 },
      { text: 'UNDER NEW MANAGEMENT', size: 46, color: '#b3261e' },
    ]),
  });
  collider(1.7, 1.3, 0.15, sign.x, heightAt(sign.x, sign.z) + 1.2, sign.z, 0.12);

  // ================================================================ power line along Mill Lane
  const lane = plan.byId.millLane;
  const wires = [];
  const poleTop = 8.6;
  const poles = [];
  for (let i = 0; i < lane.samples.length; i += 22) {
    const p = lane.samples[i];
    if (p.x < -700 || p.x > 420) continue;
    const x = p.x + p.dz * 6; // north side of the lane
    const z = p.z - p.dx * 6;
    if (place('pole', x, z, Math.atan2(-p.dz, p.dx))) poles.push(new THREE.Vector3(x, heightAt(x, z) + poleTop, z)); // crossarm across the lane
  }
  for (let i = 0; i + 1 < poles.length; i++) {
    const a = poles[i];
    const b = poles[i + 1];
    const side = new THREE.Vector3(b.z - a.z, 0, a.x - b.x).normalize();
    for (const k of [-0.8, 0, 0.8]) wires.push(wire(a.clone().addScaledVector(side, k), b.clone().addScaledVector(side, k), 1.1));
  }
  // Service drop: lane pole -> pole by the yard -> office roof.
  const inner = new THREE.Vector3(home.yard.x1 - 3, 0, home.yard.z0 + 2);
  if (poles.length && place('pole', inner.x, inner.z, 0)) {
    collider(0.15, 4.5, 0.15, inner.x, heightAt(inner.x, inner.z) + 4.5, inner.z);
    inner.y = heightAt(inner.x, inner.z) + 8.6;
    const near = poles.reduce((a, b) => (a.distanceTo(inner) < b.distanceTo(inner) ? a : b));
    wires.push(wire(near, inner, 1.4));
    wires.push(wire(inner, new THREE.Vector3(off.x + 3.5, y0 + 3.2, off.z - 1.6), 0.8));
  }
  if (wires.length) {
    scene.add(new THREE.Mesh(mergeGeometries(wires), new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.5, metalness: 0.6 })));
  }

  // ================================================================ Ashby
  for (const h of [...plan.houses, { ...plan.pub, style: 'pub' }]) {
    const [L, W] = HOUSE_SIZE[h.style];
    const y = heightAt(h.x, h.z);
    if (!place(`house_${h.style}`, h.x, h.z, h.yaw, 1, y - 0.05)) standIn(L, 5, W, h.x, h.z, h.yaw, 0xa0604a);
    collider(L / 2, 2.8, W / 2, h.x, y + 2.8, h.z, h.yaw);
  }
  // The pub's hanging sign, out by the road.
  {
    const p = plan.pub;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const sx = p.x + fx * 6.2 + fz * 5;
    const sz = p.z + fz * 6.2 - fx * 5;
    addBoard(scene, {
      x: sx, y: heightAt(sx, sz), z: sz, yaw: p.yaw + Math.PI / 2, w: 1.4, h: 1.6, lift: 2.2, single: true,
      tex: boardTexture([{ text: 'THE', size: 70 }, { text: p.name.replace(/^The /, '').toUpperCase(), size: 130 }, { text: 'FREE HOUSE', size: 60 }],
        { width: 512, height: 600, bg: '#2a3b2c', fg: '#e9d9a6', weather: 0.2 }),
    });
  }
  for (const [x, z] of map.village.signs) {
    const q = plan.nearestOnRoad(lane, x, z);
    addBoard(scene, {
      x, y: heightAt(x, z), z, yaw: Math.atan2(-q.dx, -q.dz), w: 1.8, h: 0.7, lift: 0.9,
      postColor: 0x333333,
      tex: boardTexture([{ text: map.village.name.toUpperCase(), size: 150 }, { text: 'Please drive carefully', size: 60 }],
        { width: 1024, height: 400, bg: '#f4f1e8', fg: '#161616', weather: 0.1, border: true }),
    });
  }

  // ================================================================ Ashby Plant (the dealer)
  const dl = map.dealer;
  const dy = heightAt(dl.shed.x, dl.shed.z);
  if (!place('shed', dl.shed.x, dl.shed.z, dl.shed.yaw, 1, dy)) standIn(24, 7, 16, dl.shed.x, dl.shed.z, dl.shed.yaw, 0x5d6e60);
  collider(12, 3.6, 8, dl.shed.x, dy + 3.6, dl.shed.z, dl.shed.yaw);
  {
    const sx = dl.yard.x0 - 1.5;
    const sz = dl.driveway.z0 - 4;
    addBoard(scene, {
      x: sx, y: heightAt(sx, sz), z: sz, yaw: -Math.PI / 2, w: 4, h: 1.5, lift: 1.4, postColor: 0x333333,
      tex: boardTexture([{ text: 'ASHBY PLANT', size: 140, color: '#f5b82e' }, { text: 'SALES  ·  HIRE  ·  REPAIRS', size: 64, color: '#f2efe6' }],
        { bg: '#1c2a3a', fg: '#f5b82e', weather: 0.15 }),
    });
  }

  // ================================================================ Ashby Aggregates (the depot)
  const dp = map.depot;
  const wb = dp.weighbridge;
  const wbx = (wb.x0 + wb.x1) / 2;
  const wbz = (wb.z0 + wb.z1) / 2;
  const wy = heightAt(wbx, wbz);
  const bridge = place('weighbridge', wbx, wbz, 0, 1, wy + 0.01);
  if (!bridge) {
    const deck = standIn(wb.x1 - wb.x0, 0.05, wb.z1 - wb.z0, wbx, wbz, 0, 0x7a7c7e);
    deck.position.y = wy + 0.03;
  }
  // The traffic light's two lamps (their own materials, so only this light changes).
  const lamps = [];
  bridge?.traverse((o) => {
    if (o.isMesh && /^(Red|Green)/.test(o.name)) {
      o.material = o.material.clone();
      lamps.push(o);
    }
  });
  const dox = dp.office;
  const doy = heightAt(dox.x, dox.z);
  if (!place('office', dox.x, dox.z, dox.yaw, 1, doy)) standIn(8, 3, 4, dox.x, dox.z, dox.yaw, 0xcfcac0);
  collider(3.95, 1.6, 1.85, dox.x, doy + 1.6, dox.z, dox.yaw);
  addBoard(scene, {
    x: dox.x + 3, y: doy, z: wb.z1 + 3, yaw: Math.PI / 2, w: 2.4, h: 0.9, lift: 1.3, postColor: 0x333333,
    tex: boardTexture([{ text: 'WEIGH IN HERE', size: 150 }, { text: 'Stop on the bridge', size: 70 }],
      { width: 1024, height: 400, bg: '#f5b82e', fg: '#161616', weather: 0.1 }),
  });
  {
    const sx = dp.driveway.x0 - 5;
    const sz = dp.yard.z1 + 4;
    addBoard(scene, {
      x: sx, y: heightAt(sx, sz), z: sz, yaw: 0, w: 4.4, h: 1.7, lift: 1.3, postColor: 0x333333,
      tex: boardTexture([
        { text: 'ASHBY', size: 110, color: '#f2efe6' }, { text: 'AGGREGATES', size: 110, color: '#f5b82e' },
        { text: 'WEIGHBRIDGE  ·  TOPSOIL  ·  SAND  ·  GRAVEL', size: 44, color: '#f2efe6' },
      ], { bg: '#233423', fg: '#f5b82e', weather: 0.2 }),
    });
  }

  // The bays: walls of concrete blocks (three high) between them and along the back.
  const bz = dp.bayZ;
  const blockRow = (x0, z0, x1, z1, rows = 3) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = -Math.atan2(z1 - z0, x1 - x0);
    const n = Math.max(1, Math.round(len / 1.62));
    const hasBlocks = !!glbProp('block');
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const by = heightAt(x, z);
      for (let k = 0; k < rows; k++) {
        const shift = k % 2 ? 0.4 : 0;
        const bx = x + Math.cos(yaw) * shift;
        const bzz = z - Math.sin(yaw) * shift;
        if (hasBlocks) place('block', bx, bzz, yaw, 1, by + k * 0.8);
      }
    }
    if (!hasBlocks) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(len, rows * 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x9a968d, roughness: 0.9 }));
      wall.position.set((x0 + x1) / 2, heightAt((x0 + x1) / 2, (z0 + z1) / 2) + rows * 0.4, (z0 + z1) / 2);
      wall.rotation.y = yaw;
      wall.castShadow = true;
      scene.add(wall);
    }
    collider(len / 2, rows * 0.4, 0.4, (x0 + x1) / 2, heightAt((x0 + x1) / 2, (z0 + z1) / 2) + rows * 0.4, (z0 + z1) / 2, yaw);
  };
  const bays = dp.bays;
  blockRow(bays[0].x0 - 1, bz.z0 - 0.4, bays[bays.length - 1].x1 + 1, bz.z0 - 0.4); // back wall
  for (let i = 0; i <= bays.length; i++) {
    const x = i === 0 ? bays[0].x0 - 1 : i === bays.length ? bays[bays.length - 1].x1 + 1 : (bays[i - 1].x1 + bays[i].x0) / 2;
    blockRow(x, bz.z0 + 0.4, x, bz.z1 - 0.6);
  }
  const bayInfo = bays.map((b, i) => {
    const cxb = (b.x0 + b.x1) / 2;
    // Sign on the back wall.
    const tex = boardTexture([{ text: (bayNames[b.id] ?? b.id).toUpperCase(), size: 150 }],
      { width: 1024, height: 300, bg: '#f2efe6', fg: '#161616', weather: 0.15, seed: 20 + i });
    addBoard(scene, { x: cxb, y: heightAt(cxb, bz.z0), z: bz.z0 + 0.35, yaw: 0, w: 3.6, h: 1.0, lift: 2.5, tex, postColor: 0x555555 });
    // What's been tipped here already (grows a little as you sell).
    const heap = createHeap(60 + i);
    heap.position.set(cxb, heightAt(cxb, bz.z0 + 5), bz.z0 + 5);
    scene.add(heap);
    // (a working depot's bays hold a good heap each: 60 to 120 t, about 4 m tall at the top)
    return { id: b.id, name: bayNames[b.id] ?? b.id, rect: { x0: b.x0, x1: b.x1, z0: bz.z0, z1: bz.z1 }, heap, stock: 60 + r() * 60 };
  });
  for (const b of bayInfo) setHeap(b.heap, Math.min(b.stock, BAY_HEAP_MAX), b.id === 'mixed' ? { topsoil: 1, clay: 1, gravel: 1 } : { [b.id]: 1 }, materials);
  for (const [x, z, id, size] of dp.stockpiles) {
    const heap = createHeap(90 + x);
    heap.position.set(x, heightAt(x, z), z);
    const t = 1.7 * (0.6 * Math.PI * size ** 3) / 3;
    scene.add(heap);
    setHeap(heap, t, { [id]: 1 }, materials);
  }

  return {
    setBuilding(id, owned) {
      if (facilitySigns[id]) facilitySigns[id].visible = owned;
      if (id === 'weighbridge') { homeBridge.visible = owned; homePole.setEnabled(owned); }
    },
    officeDoor: { x: off.x + 0.5, z: off.z + 2.6 },
    dealerDoor: dl.door,
    weighbridge: wb,
    bays: bayInfo,
    // Which depot bay (if any) a point is in (the bay rectangle, with a little slack at the mouth).
    bayAt(x, z) {
      return bayInfo.find((b) => inRect({ ...b.rect, z1: b.rect.z1 + 3 }, x, z)) ?? null;
    },
    onWeighbridge: (x, z) => inRect(wb, x, z, 0.3),
    // A delivery landed in a bay: its heap grows.
    delivered(bayId, tonnes) {
      const b = bayInfo.find((x) => x.id === bayId);
      if (!b) return;
      b.stock += tonnes;
      setHeap(b.heap, Math.min(b.stock, BAY_HEAP_MAX)); // (the depot ships out as much as comes in)
    },
    // The weighbridge light: green while a vehicle can drive on, red while one is weighing.
    setLight(green) {
      for (const l of lamps) {
        const isGreen = /^Green/.test(l.name);
        if (l.material.emissive) l.material.emissiveIntensity = isGreen === green ? 2.2 : 0.05;
      }
    },
  };
}

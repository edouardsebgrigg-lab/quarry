// Site props from the Blender models (office, fuel tank, block walls, boulders, cones),
// with simple stand-ins for the essentials when the models aren't there.
import * as THREE from 'three';
import { glbProp } from './glbModels.js';
import { planks } from './textures.js';
import { inRect } from './layouts.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addProps({ scene, physics, layout, heightAt, plot = null }) {
  const { RAPIER, world } = physics;
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

  // ---- site office ----
  const c = layout.cabin;
  if (!place('office', c.x, c.z, c.yaw, 1, 0)) addCabinStandIn(scene, c);
  collider(3.95, 1.6, 1.85, c.x, 1.6, c.z);
  place('fueltank', c.x + 7.5, c.z - 0.5, Math.PI / 2, 1, 0);
  collider(0.8, 1.0, 1.7, c.x + 7.5, 1.0, c.z - 0.5);

  // ---- behind the office: the old container and the junk that collects round it ----
  const cx = c.x - 13;
  const cz = c.z - 3;
  if (place('container', cx, cz, Math.PI, 1, 0)) collider(3.03, 1.3, 1.22, cx, 1.3, cz);
  place('drum', cx + 4.2, cz + 2.2, 0.4, 1, 0);
  place('drumrust', cx + 4.9, cz + 2.6, 1.3, 1, 0);
  place('drum', cx + 4.4, cz + 3.3, 2.2, 1, 0);
  const fallen = place('drumrust', cx + 6.2, cz + 1.2, 0.6, 1, 0.29);
  if (fallen) fallen.rotation.set(Math.PI / 2, 0.6, 0, 'YXZ');
  collider(0.6, 0.45, 0.8, cx + 4.6, 0.45, cz + 2.7);
  if (place('tyres', cx - 4.4, cz + 2.2, 0, 1, 0)) collider(0.55, 0.7, 0.55, cx - 4.4, 0.7, cz + 2.2);
  place('pallets', cx + 3.8, cz - 2.6, 0.3, 1, 0);
  if (place('portaloo', cx + 6.2, cz + 0.4, -Math.PI / 2, 1, 0)) collider(0.6, 1.2, 0.6, cx + 6.2, 1.2, cz + 0.4);

  // ---- your old pickup, parked where you left it ----
  const pk = layout.pickup;
  if (pk && place('pickup', pk.x, pk.z, pk.yaw, 1, 0)) collider(2.7, 0.9, 0.95, pk.x, 0.9, pk.z, pk.yaw);

  // ---- block walls behind the stockpiles (two blocks high) ----
  const wallX = layout.yard.x1 - 1.2;
  const z0 = layout.yard.z0 + 2;
  const z1 = layout.yard.z1 - 2;
  const hasBlocks = !!glbProp('block');
  if (hasBlocks) {
    for (let z = z0 + 0.8; z <= z1 - 0.8; z += 1.62) {
      place('block', wallX, z, Math.PI / 2, 1, 0);
      if (z + 0.81 <= z1 - 0.8) place('block', wallX, z + 0.81, Math.PI / 2, 1, 0.8);
    }
  } else {
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a968d, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, z1 - z0), mat);
    wall.position.set(wallX, 0.8, (z0 + z1) / 2);
    wall.castShadow = true;
    scene.add(wall);
  }
  collider(0.4, 0.8, (z1 - z0) / 2, wallX, 0.8, (z0 + z1) / 2);

  // ---- cones around the tipping bay ----
  const bay = layout.tipBay;
  for (const [x, z] of [[bay.x0, bay.z0], [bay.x1, bay.z0], [bay.x0, bay.z1], [bay.x1, bay.z1]]) {
    place('cone', x, z, 0, 1, 0.03);
  }
  for (let x = 4; x <= 36; x += 8) {
    place('cone', x, -5.2, 0, 1, 0);
    place('cone', x, 5.2, 0, 1, 0);
  }

  // ---- boulders around the edge of the site and on the pit rims ----
  const r = rng(99);
  const T = layout.terrain;
  const gate = layout.entrance ?? { x0: 0, x1: 0 };
  const keepClear = (x, z) => inRect(layout.yard, x, z, 3) || inRect({ x0: -60, x1: 45, z0: -6, z1: 6 }, x, z)
    || (plot && inRect(plot, x, z, 3))
    || inRect({ x0: gate.x0 - 5, x1: gate.x1 + 5, z0: T.z0 - 2, z1: T.z0 + 16 }, x, z)
    || inRect({ x0: c.x - 20, x1: c.x + 12, z0: c.z - 12, z1: c.z + 5 }, x, z)
    || Object.values(layout.zones).some((zr) => inRect(zr, x, z, 1.5)) || Math.hypot(x - c.x, z - c.z) < 9;
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 38; tries++) {
    const edge = r() < 0.75;
    let x;
    let z;
    if (edge) {
      // Near the earth bank around the site.
      const side = Math.floor(r() * 4);
      const along = r();
      const inset = 3 + r() * 9;
      x = side < 2 ? T.x0 + (T.x1 - T.x0) * along : (side === 2 ? T.x0 + inset : T.x1 - inset);
      z = side >= 2 ? T.z0 + (T.z1 - T.z0) * along : (side === 0 ? T.z0 + inset : T.z1 - inset);
    } else {
      x = T.x0 + 12 + r() * (T.x1 - T.x0 - 24);
      z = T.z0 + 12 + r() * (T.z1 - T.z0 - 24);
    }
    if (keepClear(x, z)) continue;
    const scale = 0.5 + r() * r() * 1.8;
    const obj = place(`boulder${1 + Math.floor(r() * 3)}`, x, z, r() * Math.PI * 2, scale);
    if (!obj) break;
    if (scale > 0.9) collider(0.9 * scale, 0.6 * scale, 0.8 * scale, x, heightAt(x, z) + 0.4 * scale, z);
    placed += 1;
  }
}

function addCabinStandIn(scene, c) {
  const cabin = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4), new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.9 }));
  walls.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 4.8), new THREE.MeshStandardMaterial({ color: 0x4a4f55 }));
  roof.position.y = 3.15;
  cabin.add(walls, roof);
  cabin.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  cabin.position.set(c.x, 0, c.z);
  cabin.rotation.y = c.yaw;
  scene.add(cabin);
}

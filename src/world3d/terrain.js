// The quarry ground: one heightfield (1 sample per metre) for both the visible mesh and
// the physics collider. Zones are dug as terraced pits whose depth comes from the game state.
import * as THREE from 'three';
import { createGroundMaterial } from './groundMaterial.js';
import { addProps } from './props.js';
import { inRect } from './layouts.js';

const RIM = 0.75; // flat lip at the top of each pit wall

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function createTerrain({ scene, physics, layout, siteData, materials, getDepths }) {
  const { RAPIER, world } = physics;
  const T = layout.terrain;
  const ncols = T.x1 - T.x0; // cells along x
  const nrows = T.z1 - T.z0; // cells along z
  const vx = ncols + 1;
  const vz = nrows + 1;
  const t = siteData.layerThickness;
  const layers = siteData.layerProfile.length;
  // Strata tints: each layer's material colour, relative to its own brightness (the
  // textures already carry the detail, the tint only shifts the hue and lightness a little).
  const layerTints = siteData.layerProfile.map((layer) => {
    const rgb = [0, 0, 0];
    for (const [id, share] of Object.entries(layer.mix)) {
      const c = hexToRgb(materials[id]?.color ?? '#999999');
      for (let k = 0; k < 3; k++) rgb[k] += c[k] * share;
    }
    const lum = (rgb[0] + rgb[1] + rgb[2]) / 3;
    return rgb.map((v) => (1 + 0.6 * (v / lum - 1)) * (0.8 + 0.35 * lum));
  });

  let depths = { ...getDepths() };

  function heightAt(x, z, d = depths) {
    // Earth bank around the edge of the site.
    const edge = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z);
    if (edge < 10) {
      const s = (10 - Math.max(0, edge)) / 10;
      const bank = 3 * Math.sin(Math.PI * s) - 0.3 * s;
      const gate = layout.entrance;
      if (!gate || z > T.z0 + 11) return bank;
      // The entrance: the bank is cut away with sloped shoulders either side.
      const open = 1 - smoothstep(0, 4, Math.max(gate.x0 - x, 0, x - gate.x1));
      return bank * (1 - open) - 0.3 * s * open;
    }
    for (const [id, r] of Object.entries(layout.zones)) {
      if (!inRect(r, x, z)) continue;
      const e = Math.min(x - r.x0, r.x1 - x, z - r.z0, r.z1 - z);
      if (e < RIM) return 0;
      const band = Math.floor((e - RIM) / layout.benchInset);
      const cap = Math.min(layers, band + 1) * t;
      return -Math.min(d[id] ?? 0, cap);
    }
    return 0;
  }

  // Worked ground (tracks, yard, around the pits and office) versus untouched grass.
  const worked = [
    ...layout.road.map((r) => [r, 3.5]),
    [layout.yard, 4],
    ...Object.values(layout.zones).map((r) => [r, 4.5]),
    [{ x0: layout.cabin.x - 9, x1: layout.cabin.x + 5, z0: layout.cabin.z - 4, z1: layout.cabin.z + 5 }, 3],
  ];
  function workedness(x, z) {
    let best = 0;
    for (const [r, fall] of worked) {
      const d = rectDistance(r, x, z);
      best = Math.max(best, 1 - smoothstep(0, fall, d));
    }
    return best;
  }

  // ---- mesh ----
  const positions = new Float32Array(vx * vz * 3);
  const colors = new Float32Array(vx * vz * 3);
  const splats = new Float32Array(vx * vz * 4);
  const heights = new Float32Array(vx * vz); // physics order: column-major (x columns, z rows)
  for (let r = 0; r < vz; r++) {
    for (let c = 0; c < vx; c++) {
      const i = r * vx + c;
      positions[i * 3] = T.x0 + c;
      positions[i * 3 + 2] = T.z0 + r;
    }
  }
  const index = [];
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const a = r * vx + c;
      const b = a + 1;
      const d = a + vx;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('splat', new THREE.BufferAttribute(splats, 4));
  geometry.setIndex(index);

  const material = createGroundMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  const hAt = (c, r) => positions[(Math.min(vz - 1, Math.max(0, r)) * vx + Math.min(vx - 1, Math.max(0, c))) * 3 + 1];

  // Surface mix (grass, dirt, gravel, rock) and tint for one vertex.
  function surface(c, r, out) {
    const x = T.x0 + c;
    const z = T.z0 + r;
    const h = hAt(c, r);
    const slope = Math.hypot(hAt(c + 1, r) - hAt(c - 1, r), hAt(c, r + 1) - hAt(c, r - 1)) / 2;
    const n1 = fbm(x * 0.06, z * 0.06);
    const n2 = fbm(x * 0.21 + 17.3, z * 0.21 - 4.1);
    let g = 0;
    let d = 0;
    let v = 0;
    let k = 0;
    let tint = [1, 1, 1];
    const edge = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z);
    const zone = Object.values(layout.zones).find((zr) => inRect(zr, x, z));
    if (h < -0.05 && zone) {
      // Inside a dug pit: rock on the walls, gravel on the floors and benches.
      k = smoothstep(0.55, 1.1, slope);
      v = (1 - k) * (0.75 + 0.25 * n2);
      d = (1 - k) * smoothstep(0.5, 0.8, n2) * 0.8;
      const layer = Math.min(layers - 1, Math.floor(-h / t - 1e-4));
      const shade = 1 - (-h / (layers * t)) * 0.18;
      tint = layerTints[layer].map((val) => val * shade);
    } else if (edge < 10.5) {
      // Earth bank: rough grass, bare where it's steep or worn.
      const bare = smoothstep(0.55, 0.85, n2 + slope * 0.35);
      g = 1 - bare;
      d = bare;
      tint = [0.97, 0.96, 0.88];
    } else {
      // Flat ground: worn dirt where machines work, patchy rough grass taking over elsewhere.
      const w = Math.min(1, workedness(x, z) + (n1 - 0.5) * 0.5);
      const n4 = fbm(x * 0.11 - 31.7, z * 0.11 + 12.9);
      g = smoothstep(0.35, 0.65, 1 - w + (n2 - 0.5) * 0.4) * smoothstep(0.25, 0.5, n4);
      const roadness = Math.max(...layout.road.map((rr) => 1 - smoothstep(0, 2.5, rectDistance(rr, x, z))),
        1 - smoothstep(0, 1.5, rectDistance(layout.yard, x, z)));
      v = (1 - g) * (0.2 + 0.45 * roadness) * (0.5 + 0.9 * n2);
      d = (1 - g) * (1 - 0.3 * roadness) + g * 0.35;
      const trodden = 0.9 + 0.1 * n1 - 0.1 * roadness;
      tint = [trodden, trodden * 0.97, trodden * 0.9];
    }
    const sum = g + d + v + k || 1;
    out[0] = g / sum;
    out[1] = d / sum;
    out[2] = v / sum;
    out[3] = k / sum;
    const n3 = 0.94 + 0.12 * fbm(x * 0.5 - 3.3, z * 0.5 + 8.1);
    return tint.map((val) => val * n3);
  }

  const mix4 = [0, 0, 0, 0];
  function rebuild(region = null) {
    const inside = (x, z, m) => !region || (x >= region.x0 - m && x <= region.x1 + m && z >= region.z0 - m && z <= region.z1 + m);
    for (let r = 0; r < vz; r++) {
      for (let c = 0; c < vx; c++) {
        const x = T.x0 + c;
        const z = T.z0 + r;
        if (!inside(x, z, 2)) continue;
        const i = r * vx + c;
        const h = heightAt(x, z);
        positions[i * 3 + 1] = h;
        heights[c * vz + r] = h;
      }
    }
    for (let r = 0; r < vz; r++) {
      for (let c = 0; c < vx; c++) {
        if (!inside(T.x0 + c, T.z0 + r, 1)) continue;
        const i = r * vx + c;
        const col = surface(c, r, mix4);
        colors.set(col, i * 3);
        splats.set(mix4, i * 4);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.attributes.splat.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }

  let collider = null;
  function rebuildCollider() {
    if (collider) world.removeCollider(collider, true);
    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, { x: ncols, y: 1, z: nrows })
      .setTranslation((T.x0 + T.x1) / 2, 0, (T.z0 + T.z1) / 2)
      .setFriction(0.9);
    collider = world.createCollider(desc);
  }

  rebuild();
  rebuildCollider();
  // Flat ground beyond the site (at the level of the grass outside), so you can walk or
  // drive out through the gate.
  const R = 600;
  for (const [x0, x1, z0, z1] of [[-R, R, -R, T.z0], [-R, R, T.z1, R], [-R, T.x0, T.z0, T.z1], [T.x1, R, T.z0, T.z1]]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 1, (z1 - z0) / 2)
      .setTranslation((x0 + x1) / 2, -1.3, (z0 + z1) / 2).setFriction(0.9));
  }
  addSiteDressing(scene, layout);
  addProps({ scene, physics, layout, heightAt: (x, z) => heightAt(x, z) });

  let sinceCheck = 0;
  return {
    heightAt: (x, z) => heightAt(x, z),
    // Height and surface mix at the nearest terrain point (outside the site: grass).
    surfaceAt(x, z) {
      const c = Math.round(x - T.x0);
      const r = Math.round(z - T.z0);
      if (c < 0 || r < 0 || c >= vx || r >= vz) return { height: -0.3, grass: 1, dirt: 0, gravel: 0, rock: 0, outside: true };
      const i = r * vx + c;
      return { height: heightAt(x, z), grass: splats[i * 4], dirt: splats[i * 4 + 1], gravel: splats[i * 4 + 2], rock: splats[i * 4 + 3] };
    },
    get collider() { return collider; },
    // Re-shape pits whose depth changed (checked a few times a second).
    update(dt) {
      sinceCheck += dt;
      if (sinceCheck < 0.4) return;
      sinceCheck = 0;
      const now = getDepths();
      const changed = Object.keys(now).filter((id) => Math.abs((now[id] ?? 0) - (depths[id] ?? 0)) > 0.004);
      if (changed.length === 0) return;
      depths = { ...now };
      for (const id of changed) rebuild(layout.zones[id]);
      rebuildCollider();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

function smoothstep(e0, e1, x) {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
}

function rectDistance(r, x, z) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

// Smooth value noise (0..1), a few octaves. Deterministic, so the site always looks the same.
function hash(x, z) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0);
  const b = hash(x0 + 1, z0);
  const c = hash(x0, z0 + 1);
  const d = hash(x0 + 1, z0 + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.2, z * 2.1 - 1.7) * 0.3 + vnoise(x * 4.3 - 9.1, z * 4.3 + 3.3) * 0.15;
}

// Road, yard slab, tipping bay markings, signs.
function addSiteDressing(scene, layout) {
  // Road and yard are part of the terrain surface (see surface() above).
  // Tipping bay: yellow painted lines.
  const bay = layout.tipBay;
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2b632, roughness: 0.6 });
  const line = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.3), paint);
    m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    scene.add(m);
  };
  line(bay.x0, bay.z0, bay.x1, bay.z0);
  line(bay.x1, bay.z0, bay.x1, bay.z1);
  line(bay.x1, bay.z1, bay.x0, bay.z1);
  line(bay.x0, bay.z1, bay.x0, bay.z0);
  line(bay.x0, bay.z0, bay.x1, bay.z1);
  addSign(scene, 'TIP HERE', (bay.x0 + bay.x1) / 2, bay.z1 + 1.5);

  // Office, block walls, boulders and cones are in props.js.
  addSign(scene, 'SITE OFFICE', layout.cabin.x - 5, layout.cabin.z + 3.5);
}

function addSign(scene, text, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f2b632';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#1b1a17';
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(3, 0.75, 0.08), [
    null, null, null, null,
    new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex }),
  ].map((m) => m ?? new THREE.MeshStandardMaterial({ color: 0xf2b632 })));
  board.position.set(x, 2.2, z);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
  for (const px of [-1.2, 1.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2), postMat);
    post.position.set(x + px, 1.1, z);
    post.castShadow = true;
    scene.add(post);
  }
  board.castShadow = true;
  scene.add(board);
}

// The quarry ground: one heightfield (1 sample per metre) for both the visible mesh and
// the physics collider. Zones are dug as terraced pits whose depth comes from the game state.
import * as THREE from 'three';
import { gravelDetail, roadGravel, concrete, planks } from './textures.js';
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
  const layerColors = siteData.layerProfile.map((layer) => {
    const rgb = [0, 0, 0];
    for (const [id, share] of Object.entries(layer.mix)) {
      const c = hexToRgb(materials[id]?.color ?? '#999999');
      for (let k = 0; k < 3; k++) rgb[k] += c[k] * share;
    }
    return rgb.map((v) => v * 0.8);
  });
  const topsoil = hexToRgb('#8c7556');
  const bermGrass = hexToRgb('#5a6a3a');

  let depths = { ...getDepths() };

  function heightAt(x, z, d = depths) {
    // Earth bank around the edge of the site.
    const edge = Math.min(x - T.x0, T.x1 - x, z - T.z0, T.z1 - z);
    if (edge < 10) {
      const s = (10 - Math.max(0, edge)) / 10;
      return 3 * Math.sin(Math.PI * s) - 0.3 * s;
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

  // ---- mesh ----
  const positions = new Float32Array(vx * vz * 3);
  const colors = new Float32Array(vx * vz * 3);
  const uvs = new Float32Array(vx * vz * 2);
  const noise = new Float32Array(vx * vz);
  const heights = new Float32Array(vx * vz); // physics order: column-major (x columns, z rows)
  for (let r = 0; r < vz; r++) {
    for (let c = 0; c < vx; c++) {
      const i = r * vx + c;
      positions[i * 3] = T.x0 + c;
      positions[i * 3 + 2] = T.z0 + r;
      uvs[i * 2] = (T.x0 + c) / 6;
      uvs[i * 2 + 1] = (T.z0 + r) / 6;
      noise[i] = 0.9 + Math.random() * 0.2;
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
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(index);

  const detail = gravelDetail();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, map: detail, roughness: 0.95, metalness: 0,
  }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  scene.add(mesh);

  function colorFor(x, z, h, n) {
    if (h > 0.3) return bermGrass.map((v) => v * n);
    if (h > -0.05) return topsoil.map((v) => v * n);
    const layer = Math.min(layers - 1, Math.floor(-h / t - 1e-4));
    const shade = 1 - (-h / (layers * t)) * 0.25;
    return layerColors[layer].map((v) => v * n * shade);
  }

  function rebuild(region = null) {
    for (let r = 0; r < vz; r++) {
      const z = T.z0 + r;
      if (region && (z < region.z0 - 1 || z > region.z1 + 1)) continue;
      for (let c = 0; c < vx; c++) {
        const x = T.x0 + c;
        if (region && (x < region.x0 - 1 || x > region.x1 + 1)) continue;
        const i = r * vx + c;
        const h = heightAt(x, z);
        positions[i * 3 + 1] = h;
        heights[c * vz + r] = h;
        const col = colorFor(x, z, h, noise[i]);
        colors[i * 3] = col[0];
        colors[i * 3 + 1] = col[1];
        colors[i * 3 + 2] = col[2];
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
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
  addSiteDressing(scene, physics, layout);

  let sinceCheck = 0;
  return {
    heightAt: (x, z) => heightAt(x, z),
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
      detail.dispose();
    },
  };
}

// Road, yard slab, tipping bay, site cabin.
function addSiteDressing(scene, physics, layout) {
  const { RAPIER, world } = physics;
  const flat = (r, tex, y, repeatScale) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(w / repeatScale, d / repeatScale);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const roadTex = roadGravel();
  for (const r of layout.road) {
    const m = flat(r, roadTex, 0.02, 8);
    m.material.map.rotation = Math.PI / 2;
  }
  flat(layout.yard, concrete(), 0.03, 6);

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

  // Concrete blocks behind the stockpiles.
  const blockMat = new THREE.MeshStandardMaterial({ color: 0x9a968d, roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 4), blockMat);
    b.position.set(layout.yard.x1 - 2, 0.8, layout.yard.z0 + 3 + i * 4.4);
    b.castShadow = true;
    b.receiveShadow = true;
    scene.add(b);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.8, 0.8, 2).setTranslation(b.position.x, 0.8, b.position.z));
  }

  // Site cabin.
  const c = layout.cabin;
  const cabin = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(8, 3, 4),
    new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.9 }));
  walls.position.y = 1.5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.25, 4.8),
    new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.6, metalness: 0.4 }));
  roof.position.y = 3.15;
  roof.rotation.z = 0.05;
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.1, metalness: 0.6 });
  for (const wx of [-2.2, 2.2]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.05), windowMat);
    w.position.set(wx, 1.8, 2.01);
    cabin.add(w);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x5b3b25 }));
  door.position.set(0, 1.05, 2.01);
  cabin.add(walls, roof, door);
  cabin.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
  cabin.position.set(c.x, 0, c.z);
  cabin.rotation.y = c.yaw;
  scene.add(cabin);
  world.createCollider(RAPIER.ColliderDesc.cuboid(4, 1.5, 2).setTranslation(c.x, 1.5, c.z));
  addSign(scene, 'SITE OFFICE', c.x, c.z + 3.2);
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

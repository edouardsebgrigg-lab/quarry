// Grass tufts and weeds: crossed cards textured from the Blender atlas (blender/vegetation.py),
// scattered where the terrain is grassy, thickest along the grass edges. They sway in the wind.
import * as THREE from 'three';

// Atlas cells, left to right, with their size range (metres) and sway strength.
const KINDS = [
  { name: 'tuft', cell: 0, size: [0.8, 1.3], sway: 1 },
  { name: 'dry', cell: 1, size: [0.9, 1.4], sway: 1.2 },
  { name: 'ragwort', cell: 2, size: [0.9, 1.25], sway: 0.6 },
  { name: 'thistle', cell: 3, size: [0.9, 1.3], sway: 0.4 },
];
const CELLS = 4;
const COUNT = { low: 6000, medium: 14000, high: 24000, ultra: 36000 };

let atlas = null;
let treeAtlas = null;

async function loadAtlas(file, renderer) {
  try {
    const t = await new THREE.TextureLoader().loadAsync(file);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return t;
  } catch {
    return null; // not made yet: the game just leaves these out
  }
}

export async function preloadVegetation(renderer) {
  [atlas, treeAtlas] = await Promise.all([loadAtlas('textures/vegetation.png', renderer), loadAtlas('textures/trees.png', renderer)]);
}

// Three vertical cards through the middle, 60 degrees apart. Base at y = 0, 1 unit tall.
function cardGeometry(cell, cells = CELLS) {
  const pos = [];
  const uv = [];
  const idx = [];
  const u0 = cell / cells;
  const u1 = (cell + 1) / cells;
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3;
    const dx = Math.cos(a) * 0.5;
    const dz = Math.sin(a) * 0.5;
    const o = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Normals point up, so the plants are lit like the ground they stand on.
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

// Alpha-tested cards that sway in the wind (more at the top). `sway` scales the movement.
function swayingCardMaterial(map, time, sway) {
  const material = new THREE.MeshStandardMaterial({
    map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.6,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 root = instanceMatrix[3].xyz;
          float bend = position.y * position.y;
          float gust = sin(uTime * 1.3 + root.x * 0.08 + root.z * 0.05) * 0.5 + 0.5;
          float flutter = sin(uTime * 3.7 + root.x * 1.7 + root.z * 1.3);
          transformed.x += bend * (0.06 + 0.05 * gust) * (0.6 + 0.4 * flutter) * ${sway.toFixed(3)};
          transformed.z += bend * 0.03 * flutter * ${sway.toFixed(3)};
        }`);
    // Both sides of a card are lit as if facing up (no dark back faces).
    // Leaning the normal a little toward the camera and damping the sheen stops the cards
    // mirroring the bright sky when seen edge-on.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize(normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz) + vec3(0.0, 0.0, 0.5));`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= 0.3;
        material.specularF90 = 0.1;`);
  };

  material.customProgramCacheKey = () => `cards-${sway}`;
  return material;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// `surfaceAt(x, z)` -> { height, grass, dirt, gravel, rock }; `blocked(x, z)` -> true where
// nothing should grow (pits, buildings, parking).
export function createVegetation({ scene, quality, area, surfaceAt, blocked }) {
  if (!atlas) return { update() {} };
  const time = { value: 0 };
  const material = swayingCardMaterial(atlas, time, 1);

  const random = rng(97);
  const n = COUNT[quality] ?? COUNT.medium;
  const placed = KINDS.map(() => []);
  const w = area.x1 - area.x0;
  const d = area.z1 - area.z0;
  let tries = 0;
  let count = 0;
  while (count < n && tries < n * 30) {
    tries++;
    const x = area.x0 + random() * w;
    const z = area.z0 + random() * d;
    if (blocked(x, z)) continue;
    const s = surfaceAt(x, z);
    if (s.rock > 0.2 || s.gravel > 0.45) continue;
    // Most likely in grass, and along the ragged edge where grass meets dirt.
    const edge = 1 - Math.abs(s.grass - 0.5) * 2;
    const p = (s.grass * 0.55 + edge * 0.5 + s.dirt * 0.03) * (s.outside ? 0.25 : 1);
    if (random() > p) continue;
    const r = random();
    let kind;
    if (r < 0.04) kind = 2;
    else if (r < 0.08 && s.dirt > 0.2) kind = 3;
    else kind = random() < (s.grass > 0.6 ? 0.8 : 0.55) ? 0 : 1;
    placed[kind].push([x, s.height, z]);
    count++;
    // Tufts grow in little clumps.
    if (kind < 2 && random() < 0.5) {
      for (let k = 0; k < 2; k++) {
        const cx = x + (random() - 0.5) * 0.9;
        const cz = z + (random() - 0.5) * 0.9;
        if (!blocked(cx, cz)) {
          placed[kind].push([cx, surfaceAt(cx, cz).height, cz]);
          count++;
        }
      }
    }
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tint = new THREE.Color();
  const meshes = KINDS.map((kind, i) => {
    const list = placed[i];
    const mesh = new THREE.InstancedMesh(cardGeometry(kind.cell), material, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach(([x, y, z], j) => {
      const s = kind.size[0] + random() * (kind.size[1] - kind.size[0]);
      sc.set(s, s * (0.85 + random() * 0.3), s);
      q.setFromAxisAngle(up, random() * Math.PI);
      pos.set(x, y - 0.03, z);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(j, m);
      const shade = (kind.name === 'dry' ? 0.72 : 0.85) + random() * 0.2;
      mesh.setColorAt(j, tint.setRGB(shade, shade, shade * 0.95));
    });
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  });

  return {
    meshes,
    update(dt) {
      time.value += dt;
    },
  };
}

// ---------------------------------------------------------------- countryside trees

// Tree atlas cells (blender/trees.py): the size is the metres one cell covers.
const TREES = [
  { name: 'oak', size: 16 },
  { name: 'poplar', size: 15 },
  { name: 'hawthorn', size: 7.5 },
];

// Farmland around the site: hedgerows along field edges (hawthorn with the odd oak),
// copses, a row of poplars along the road and single trees in the fields.
// `keepClear(x, z)` -> true where no tree may stand (the site, the road).
export function createTrees({ scene, quality, keepClear, groundHeight }) {
  if (!treeAtlas) return { update() {} };
  const time = { value: 0 };
  const material = swayingCardMaterial(treeAtlas, time, 0.06);
  const random = rng(1234);
  const density = { low: 0.5, medium: 0.8, high: 1, ultra: 1 }[quality] ?? 0.8;
  const placed = TREES.map(() => []);
  const add = (kind, x, z, scale = 1) => {
    if (keepClear(x, z)) return;
    placed[kind].push([x, z, scale * (0.8 + random() * 0.4)]);
  };

  // Hedgerows.
  const R = 650;
  const hedge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const step = 3.2 / density;
    for (let d = 0; d < len; d += step * (0.7 + random() * 0.6)) {
      if (random() < 0.05) {
        d += 6; // a gap
        continue;
      }
      const t = d / len;
      const x = x0 + (x1 - x0) * t + (random() - 0.5) * 1.2;
      const z = z0 + (z1 - z0) * t + (random() - 0.5) * 1.2;
      add(random() < 0.08 ? 0 : 2, x, z);
    }
  };
  for (const x of [-440, -300, -150, 145, 290, 430]) hedge(x, -R, x, R);
  for (const z of [-400, -250, -112, 96, 235, 380]) hedge(-R, z, R, z);

  // Copses.
  for (let i = 0; i < Math.round(10 * density); i++) {
    const a = random() * Math.PI * 2;
    const dist = 200 + random() * 420;
    const cx = Math.cos(a) * dist;
    const cz = Math.sin(a) * dist;
    const n = 12 + Math.floor(random() * 22);
    for (let k = 0; k < n; k++) {
      const r = Math.sqrt(random()) * 28;
      const b = random() * Math.PI * 2;
      add(random() < 0.75 ? 0 : 1, cx + Math.cos(b) * r, cz + Math.sin(b) * r);
    }
  }

  // Poplars along the far side of the road, east of the site.
  for (let x = 150; x < 420; x += 11 + random() * 3) add(1, x, -84 + random());

  // Lone field trees.
  for (let i = 0; i < 40 * density; i++) {
    add(0, (random() - 0.5) * 2 * R, (random() - 0.5) * 2 * R, 1.1);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const meshes = TREES.map((tree, i) => {
    const list = placed[i];
    const mesh = new THREE.InstancedMesh(cardGeometry(i, TREES.length), material, Math.max(1, list.length));
    mesh.count = list.length;
    list.forEach(([x, z, s], j) => {
      const size = tree.size * s;
      sc.set(size, size, size);
      q.setFromAxisAngle(up, random() * Math.PI);
      pos.set(x, groundHeight(x, z) - 0.05, z);
      m.compose(pos, q, sc);
      mesh.setMatrixAt(j, m);
    });
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  });
  return {
    meshes,
    update(dt) {
      time.value += dt;
    },
  };
}

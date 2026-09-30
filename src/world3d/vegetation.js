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
// Grass tufts, dry grass, ragwort and thistles, in 16 m patches generated around you as you
// move (the same patch always grows the same plants). `surfaceAt(x, z)` gives the ground mix;
// `blocked(x, z)` is true where nothing may grow.
export function createVegetation({ scene, quality, surfaceAt, blocked }) {
  if (!atlas) return { update() {} };
  const time = { value: 0 };
  const material = swayingCardMaterial(atlas, time, 1);
  const CELL = 16;
  const R = { low: 55, medium: 75, high: 95, ultra: 120 }[quality] ?? 75;
  const tries = Math.round(CELL * CELL * ({ low: 0.35, medium: 0.5, high: 0.6, ultra: 0.7 }[quality] ?? 0.5));
  const span = Math.ceil(R / CELL);
  const capacity = Math.ceil((2 * span + 1) ** 2 * tries * 1.6);
  const meshes = KINDS.map((kind) => {
    const mesh = new THREE.InstancedMesh(cardGeometry(kind.cell), material, capacity);
    mesh.count = 0;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // it's all around you anyway
    scene.add(mesh);
    return mesh;
  });

  // One patch: a list of plants [kind, x, y, z, size, stretch, turn, shade].
  const cache = new Map();
  function patch(cx, cz) {
    const key = `${cx},${cz}`;
    if (cache.has(key)) return cache.get(key);
    const random = rng((Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ 97) >>> 0);
    const out = [];
    const add = (kind, x, z) => {
      const k = KINDS[kind];
      const size = k.size[0] + random() * (k.size[1] - k.size[0]);
      const shade = (k.name === 'dry' ? 0.72 : 0.85) + random() * 0.2;
      out.push([kind, x, surfaceAt(x, z).height, z, size, 0.85 + random() * 0.3, random() * Math.PI, shade]);
    };
    for (let t = 0; t < tries; t++) {
      const x = (cx + random()) * CELL;
      const z = (cz + random()) * CELL;
      if (blocked(x, z)) continue;
      const s = surfaceAt(x, z);
      if (s.road || s.rock > 0.2 || s.gravel > 0.45) continue;
      const edge = 1 - Math.abs(s.grass - 0.5) * 2;
      const p = s.grass * 0.55 + edge * 0.5 + s.dirt * 0.03;
      if (random() > p) continue;
      const r = random();
      let kind;
      if (r < 0.04) kind = 2;
      else if (r < 0.08 && s.dirt > 0.2) kind = 3;
      else kind = random() < (s.grass > 0.6 ? 0.8 : 0.55) ? 0 : 1;
      add(kind, x, z);
      if (kind < 2 && random() < 0.5) {
        for (let k = 0; k < 2; k++) {
          const px = x + (random() - 0.5) * 0.9;
          const pz = z + (random() - 0.5) * 0.9;
          if (!blocked(px, pz)) add(kind, px, pz);
        }
      }
    }
    cache.set(key, out);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
    return out;
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tint = new THREE.Color();
  let centre = null;

  function rebuild(ccx, ccz) {
    const counts = KINDS.map(() => 0);
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        if (dx * dx + dz * dz > (span + 0.5) ** 2) continue;
        for (const [kind, x, y, z, size, stretch, turn, shade] of patch(ccx + dx, ccz + dz)) {
          const mesh = meshes[kind];
          const j = counts[kind]++;
          if (j >= capacity) continue;
          sc.set(size, size * stretch, size);
          q.setFromAxisAngle(up, turn);
          pos.set(x, y - 0.03, z);
          m.compose(pos, q, sc);
          mesh.setMatrixAt(j, m);
          mesh.setColorAt(j, tint.setRGB(shade, shade, shade * 0.95));
        }
      }
    }
    meshes.forEach((mesh, i) => {
      mesh.count = Math.min(capacity, counts[i]);
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  return {
    meshes,
    // `at` is where you are: the patches around it are (re)built when you move to a new one.
    update(dt, at) {
      time.value += dt;
      if (!at) return;
      const ccx = Math.floor(at.x / CELL);
      const ccz = Math.floor(at.z / CELL);
      if (centre && centre[0] === ccx && centre[1] === ccz) return;
      centre = [ccx, ccz];
      rebuild(ccx, ccz);
    },
    // Forget the plants near (x, z) (after the ground there has changed).
    refresh(x, z) {
      cache.delete(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
      centre = null;
    },
  };
}

// ---------------------------------------------------------------- countryside trees

// Tree atlas cells (blender/trees.py): the size is the metres one cell covers.
const TREES = [
  { name: 'oak', size: 16 },
  { name: 'poplar', size: 15 },
  { name: 'hawthorn', size: 7.5, wide: 1.35 }, // (spread wider than tall, so a hedge closes up)
];

// Farmland: hedgerows (hawthorn with the odd oak) along the given lines, copses, rows of
// poplars and single trees in the fields. `plan` = { hedges: [[[x, z], ...], ...],
// copses: [[x, z, radius], ...], rows: [[[x0, z0], [x1, z1]], ...], lone: { count, half } };
// `keepClear(x, z)` -> true where no tree may stand (roads, yards, buildings).
export function createTrees({ scene, quality, plan, keepClear, groundHeight }) {
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

  // Hedgerows: hawthorn close enough to grow into one another, with an oak standing out of it
  // every so often.
  const hedge = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const step = 2.3 / density;
    for (let d = 0; d < len; d += step * (0.7 + random() * 0.6)) {
      if (random() < 0.05) {
        d += 6; // a gap
        continue;
      }
      const t = d / len;
      const x = x0 + (x1 - x0) * t + (random() - 0.5) * 1.2;
      const z = z0 + (z1 - z0) * t + (random() - 0.5) * 1.2;
      if (random() < 0.07) add(0, x, z, 1.15);
      else add(2, x, z, 0.85 + random() * 0.4);
    }
  };
  for (const line of plan.hedges ?? []) {
    for (let i = 0; i + 1 < line.length; i++) hedge(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
  }

  // Copses.
  for (const [cx, cz, radius] of plan.copses ?? []) {
    const n = Math.round((10 + random() * 16) * density * (radius / 30) ** 2 + 6);
    for (let k = 0; k < n; k++) {
      const r = Math.sqrt(random()) * radius;
      const b = random() * Math.PI * 2;
      add(random() < 0.75 ? 0 : 1, cx + Math.cos(b) * r, cz + Math.sin(b) * r);
    }
  }

  // Rows of poplars.
  for (const [[x0, z0], [x1, z1]] of plan.rows ?? []) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let d = 0; d < len; d += 11 + random() * 3) add(1, x0 + (x1 - x0) * (d / len), z0 + (z1 - z0) * (d / len) + random());
  }

  // Trees in gardens and odd corners.
  for (const [x, z, kind] of plan.singles ?? []) add(kind ?? 0, x, z, 1);

  // Lone field trees.
  const lone = plan.lone ?? { count: 40, half: 650 };
  for (let i = 0; i < lone.count * density; i++) {
    add(0, (random() - 0.5) * 2 * lone.half, (random() - 0.5) * 2 * lone.half, 1.1);
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
      sc.set(size * (tree.wide ?? 1), size, size * (tree.wide ?? 1));
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

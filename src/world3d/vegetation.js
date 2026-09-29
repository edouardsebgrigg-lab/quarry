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

export async function preloadVegetation(renderer) {
  try {
    atlas = await new THREE.TextureLoader().loadAsync('textures/vegetation.png');
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  } catch {
    atlas = null; // no vegetation then
  }
}

// Three vertical cards through the middle, 60 degrees apart. Base at y = 0, 1 unit tall.
function cardGeometry(cell) {
  const pos = [];
  const uv = [];
  const idx = [];
  const u0 = cell / CELLS;
  const u1 = (cell + 1) / CELLS;
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
  const material = new THREE.MeshStandardMaterial({
    map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, metalness: 0, envMapIntensity: 0.6,
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
          transformed.x += bend * (0.06 + 0.05 * gust) * (0.6 + 0.4 * flutter);
          transformed.z += bend * 0.03 * flutter;
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
    else kind = s.grass > 0.6 && random() < 0.7 ? 0 : 1;
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

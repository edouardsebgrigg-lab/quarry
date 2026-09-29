// Draws and collides the diggable plot (src/ground): one mesh and one physics heightfield per
// 16 m chunk, rebuilt only when that part of the ground changes. The surface shows what is on
// top: grass on untouched topsoil, bare soil where it's been disturbed, then clay, sand,
// gravel, and layered rock faces on steep cut walls.
import * as THREE from 'three';
import { createGroundMaterial } from './groundMaterial.js';

// Surface mix (grass, dirt, gravel, rock) and colour tint for each material.
const LOOK = {
  topsoil: { splat: [0, 1, 0, 0], tint: [0.8, 0.72, 0.62] },
  clay: { splat: [0, 1, 0, 0], tint: [1.08, 0.8, 0.6] },
  sand: { splat: [0, 0.85, 0.15, 0], tint: [1.42, 1.25, 0.92] },
  gravel: { splat: [0, 0.1, 0.9, 0], tint: [1, 0.98, 0.94] },
  rock: { splat: [0, 0, 0.1, 0.9], tint: [0.92, 0.9, 0.86] },
};
const GRASS = { splat: [0.85, 0.15, 0, 0], tint: [0.97, 0.96, 0.88] };
const REBUILDS_PER_FRAME = 6;

export function createGroundView({ scene, physics, ground }) {
  const { RAPIER, world } = physics;
  const cell = ground.cellSize;
  const nx = ground.nx;
  const nz = ground.nz;
  const matIds = ground.materials;
  const material = createGroundMaterial();
  const chunks = new Map(); // chunk index -> { mesh, collider }
  const pending = new Set();
  for (let c = 0; c < ground.chunksX * ground.chunksZ; c++) pending.add(c);

  // Vertex positions: cell centres, except the plot's outer edge, which is pulled out to the
  // boundary so the plot meets the surrounding terrain without a gap.
  const vx = (i) => (i === 0 ? ground.x0 : i === nx - 1 ? ground.x0 + nx * cell : ground.x0 + (i + 0.5) * cell);
  const vz = (j) => (j === 0 ? ground.z0 : j === nz - 1 ? ground.z0 + nz * cell : ground.z0 + (j + 0.5) * cell);

  function build(c) {
    const { i0, j0, i1, j1 } = ground.chunkRange(c);
    // Include the first row/column of the next chunk so neighbours share their edge.
    const ie = Math.min(i1, nx - 1);
    const je = Math.min(j1, nz - 1);
    const cols = ie - i0 + 1;
    const rows = je - j0 + 1;
    const n = cols * rows;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const spl = new Float32Array(n * 4);
    const hf = new Float32Array(n); // collider heights, column-major
    const h = (i, j) => ground.cellHeight(i, j);
    let v = 0;
    for (let j = j0; j <= je; j++) {
      for (let i = i0; i <= ie; i++, v++) {
        const y = h(i, j);
        pos.set([vx(i), y, vz(j)], v * 3);
        // Smooth normals from the heights around (the same on both sides of a chunk edge).
        const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * cell);
        const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * cell);
        const len = Math.hypot(dx, 1, dz);
        nor.set([-dx / len, 1 / len, -dz / len], v * 3);
        const slope = Math.hypot(dx, dz);
        const mat = matIds[ground.cellSurface(i, j)];
        const look = mat === 'topsoil' && !ground.cellDisturbed(i, j) ? GRASS : LOOK[mat];
        // Steep cut faces show the layered pit-face texture, tinted by the material.
        const face = Math.min(1, Math.max(0, (slope - 0.75) / 0.6)) * (look === GRASS ? 0.3 : 1);
        spl.set([look.splat[0] * (1 - face), look.splat[1] * (1 - face), look.splat[2] * (1 - face), look.splat[3] * (1 - face) + face], v * 4);
        const loose = ground.cellLoose(i, j) > 0.03 ? 1.06 : 1; // freshly dumped heaps look a touch lighter
        col.set(look.tint.map((t) => t * loose), v * 3);
        hf[(i - i0) * rows + (j - j0)] = y;
      }
    }
    const index = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let q = 0; q < cols - 1; q++) {
        const a = r * cols + q;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
    let chunk = chunks.get(c);
    if (!chunk) {
      const geometry = new THREE.BufferGeometry();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      scene.add(mesh);
      chunk = { mesh, collider: null };
      chunks.set(c, chunk);
    }
    const g = chunk.mesh.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('splat', new THREE.BufferAttribute(spl, 4));
    g.setIndex(index);
    g.computeBoundingSphere();

    // Physics: a heightfield over the cell centres of this chunk.
    if (chunk.collider) world.removeCollider(chunk.collider, true);
    const cx = ground.x0 + (i0 + 0.5) * cell;
    const cz = ground.z0 + (j0 + 0.5) * cell;
    const w = (cols - 1) * cell;
    const d = (rows - 1) * cell;
    chunk.collider = world.createCollider(
      RAPIER.ColliderDesc.heightfield(rows - 1, cols - 1, hf, { x: w, y: 1, z: d })
        .setTranslation(cx + w / 2, 0, cz + d / 2)
        .setFriction(0.9),
    );
  }

  // Build everything once at the start.
  for (const c of pending) build(c);
  pending.clear();
  ground.takeDirtyChunks();

  return {
    // Rebuild the chunks whose ground changed (a few per frame).
    update() {
      for (const c of ground.takeDirtyChunks()) pending.add(c);
      let n = 0;
      for (const c of pending) {
        if (n++ >= REBUILDS_PER_FRAME) break;
        build(c);
        pending.delete(c);
      }
    },
    dispose() {
      for (const { mesh, collider } of chunks.values()) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        if (collider) world.removeCollider(collider, false);
      }
      material.dispose();
    },
  };
}

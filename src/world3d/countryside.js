// The countryside around your field: 2 km of gently rolling farmland (one height sample every
// 4 m), flattened where there are yards, houses and roads, with tarmac roads laid on top.
// One heightfield serves the visible mesh and the physics collider. Your field itself (the
// diggable ground plot) is drawn and collided by groundChunks.js; this terrain leaves a hole
// for it and meets its edge.
import * as THREE from 'three';
import { farmRect } from './farms.js';
import { createGroundMaterial, dampSheen } from './groundMaterial.js';
import { MAP, inRect } from './map.js';

const ROAD_STEP = 2; // metres between road samples
let asphaltTexture = null;

// Load the tarmac texture before building the roads.
export async function preloadCountryside(renderer) {
  try {
    asphaltTexture = await new THREE.TextureLoader().loadAsync('textures/ground/asphalt_albedo.jpg');
    asphaltTexture.wrapS = asphaltTexture.wrapT = THREE.RepeatWrapping;
    asphaltTexture.colorSpace = THREE.SRGBColorSpace;
    asphaltTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  } catch {
    asphaltTexture = null;
  }
}
const HOLE_DEPTH = -40; // collider height inside the plot (its own chunks collide there)

// ---------------------------------------------------------------- noise (deterministic)

function hash(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, seed);
  const b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed);
  const d = hash(x0 + 1, z0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, seed = 0) {
  return vnoise(x, z, seed) * 0.55 + vnoise(x * 2.07 + 5.2, z * 2.07 - 1.7, seed + 1) * 0.3
    + vnoise(x * 4.3 - 9.1, z * 4.3 + 3.3, seed + 2) * 0.15;
}
const smoothstep = (e0, e1, x) => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};
export function rectDistance(r, x, z) {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dz = Math.max(r.z0 - z, 0, z - r.z1);
  return Math.hypot(dx, dz);
}

// Rolling farmland: long gentle swells, smaller undulations, and hills rising at the map edge.
function naturalHeight(x, z, half) {
  const swell = (fbm(x / 420 + 3.1, z / 420 - 7.7, 11) - 0.5) * 2 * 9;
  const roll = (fbm(x / 120 - 2.3, z / 120 + 4.4, 21) - 0.5) * 2 * 2.2;
  const bumps = (fbm(x / 34, z / 34, 31) - 0.5) * 2 * 0.35;
  const edge = smoothstep(half - 230, half - 20, Math.max(Math.abs(x), Math.abs(z))) * 38;
  return swell + roll + bumps + edge;
}

// ---------------------------------------------------------------- roads

// A smooth curve through the points (Catmull-Rom), resampled every ROAD_STEP metres.
function sampleCurve(points) {
  const P = points.map(([x, z]) => ({ x, z }));
  const ext = [{ x: 2 * P[0].x - P[1].x, z: 2 * P[0].z - P[1].z }, ...P,
    { x: 2 * P[P.length - 1].x - P[P.length - 2].x, z: 2 * P[P.length - 1].z - P[P.length - 2].z }];
  const dense = [];
  for (let i = 1; i < ext.length - 2; i++) {
    const [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / 0.5));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  dense.push(P[P.length - 1]);
  // Resample by distance along the curve.
  const out = [{ ...dense[0], s: 0 }];
  let acc = 0;
  let next = ROAD_STEP;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, s: next });
      next += ROAD_STEP;
    }
    acc += seg;
  }
  const last = dense[dense.length - 1];
  if (Math.hypot(last.x - out[out.length - 1].x, last.z - out[out.length - 1].z) > 0.2) out.push({ ...last, s: acc });
  // Direction along the road at each sample.
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    out[i].dx = (b.x - a.x) / len;
    out[i].dz = (b.z - a.z) / len;
  }
  return out;
}

// The layout worked out from the map: road samples, and houses set back from their road.
export function planWorld(map = MAP) {
  const roads = map.roads.map((r) => ({ ...r, hw: r.width / 2, samples: sampleCurve(r.points) }));
  const byId = Object.fromEntries(roads.map((r) => [r.id, r]));

  // Nearest point on a road to (x, z): { i, x, z, dx, dz, dist, side } (side: +1 = left of travel).
  function nearestOnRoad(road, x, z) {
    let best = null;
    for (let i = 0; i < road.samples.length; i++) {
      const p = road.samples[i];
      const d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.dist) best = { i, ...p, dist: d };
    }
    best.side = Math.sign(best.dx * (z - best.z) - best.dz * (x - best.x)) || 1;
    return best;
  }

  // A building `setback` metres from its road, facing it (yaw turns its front, +Z, to the road).
  function besideRoad({ near, road = 'millLane' }, setback = 15) {
    const p = nearestOnRoad(byId[road], near[0], near[1]);
    // Perpendicular to the road, pointing to the building's side.
    const nx = -p.dz * p.side;
    const nz = p.dx * p.side;
    const x = p.x + nx * setback;
    const z = p.z + nz * setback;
    return { x, z, yaw: Math.atan2(-nx, -nz) };
  }

  const houses = map.village.houses.map((h, i) => ({ ...h, ...besideRoad(h, h.style === 'bungalow' ? 14 : 15), seed: i }));
  const pub = { ...map.village.pub, ...besideRoad(map.village.pub, 16) };
  const farms = map.farms ?? [];
  return { map, roads, byId, nearestOnRoad, houses, pub, farms };
}

// ---------------------------------------------------------------- the countryside

export function createCountryside({ scene, physics, ground, plan, asphalt = asphaltTexture }) {
  const { RAPIER, world } = physics;
  const { map, roads } = plan;
  const half = map.half;
  const step = map.cell;
  const N = Math.round((2 * half) / step) + 1; // vertices along each side
  const X0 = -half;
  const vi = (c, r) => r * N + c;
  const H = new Float32Array(N * N);
  const roadDist = new Float32Array(N * N).fill(1e9); // distance to the nearest road centre line
  const roadHW = new Float32Array(N * N); // that road's half width

  const plot = ground
    ? { x0: ground.x0, z0: ground.z0, x1: ground.x0 + ground.nx * ground.cellSize, z1: ground.z0 + ground.nz * ground.cellSize }
    : null;
  const onPlot = (x, z) => plot && x >= plot.x0 && x <= plot.x1 && z >= plot.z0 && z <= plot.z1;
  const deepInPlot = (x, z) => plot && x > plot.x0 + 1.01 && x < plot.x1 - 1.01 && z > plot.z0 + 1.01 && z < plot.z1 - 1.01;

  // ---- 1. natural ground
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) H[vi(c, r)] = naturalHeight(X0 + c * step, X0 + r * step, half);
  }
  const gridHeight = (x, z) => {
    const u = Math.min(N - 1.001, Math.max(0, (x - X0) / step));
    const v = Math.min(N - 1.001, Math.max(0, (z - X0) / step));
    const c = Math.floor(u);
    const r = Math.floor(v);
    const fu = u - c;
    const fv = v - r;
    const a = H[vi(c, r)];
    const b = H[vi(c + 1, r)];
    const d = H[vi(c, r + 1)];
    const e = H[vi(c + 1, r + 1)];
    // Same triangles as the mesh (split along the b-d diagonal).
    if (fu + fv <= 1) return a + (b - a) * fu + (d - a) * fv;
    return e + (d - e) * (1 - fu) + (b - e) * (1 - fv);
  };

  // ---- 2. flat places: your land, the depot, the dealer's yard, house plots
  const home = map.home;
  const flats = [
    { rect: { x0: home.boundary.x0 - 6, x1: home.boundary.x1 + 4, z0: home.boundary.z0 - 6, z1: home.boundary.z1 + 6 }, h: 0, margin: 45 },
    { rect: { x0: map.depot.yard.x0 - 2, x1: map.depot.yard.x1 + 2, z0: map.depot.yard.z0 - 2, z1: map.depot.yard.z1 + 2 }, margin: 30 },
    { rect: map.dealer.yard, margin: 20 },
    ...[...plan.houses, plan.pub].map((h) => ({ rect: { x0: h.x - 8, x1: h.x + 8, z0: h.z - 8, z1: h.z + 8 }, margin: 10 })),
    ...(plan.farms ?? []).map((f) => ({ rect: farmRect(f), margin: 30 })),
  ];
  for (const f of flats) {
    const r0 = f.rect;
    const target = f.h ?? gridHeight((r0.x0 + r0.x1) / 2, (r0.z0 + r0.z1) / 2);
    const c0 = Math.max(0, Math.floor((r0.x0 - f.margin - X0) / step));
    const c1 = Math.min(N - 1, Math.ceil((r0.x1 + f.margin - X0) / step));
    const rr0 = Math.max(0, Math.floor((r0.z0 - f.margin - X0) / step));
    const rr1 = Math.min(N - 1, Math.ceil((r0.z1 + f.margin - X0) / step));
    for (let r = rr0; r <= rr1; r++) {
      for (let c = c0; c <= c1; c++) {
        const w = 1 - smoothstep(0, f.margin, rectDistance(r0, X0 + c * step, X0 + r * step));
        const k = vi(c, r);
        H[k] += (target - H[k]) * w;
      }
    }
  }

  // ---- 3. roads: a smooth profile along each road, and the ground flattened across it
  for (const road of roads) {
    const S = road.samples;
    let prof = S.map((p) => gridHeight(p.x, p.z));
    for (let pass = 0; pass < 3; pass++) {
      prof = prof.map((_, i) => {
        let sum = 0;
        let n = 0;
        for (let j = Math.max(0, i - 10); j <= Math.min(S.length - 1, i + 10); j++) {
          sum += prof[j];
          n++;
        }
        return sum / n;
      });
    }
    road.heights = prof;
  }
  // A road that starts or ends on another road meets it at that road's height.
  for (const road of roads) {
    for (const end of [0, road.samples.length - 1]) {
      const p = road.samples[end];
      for (const other of roads) {
        if (other === road) continue;
        const q = plan.nearestOnRoad(other, p.x, p.z);
        if (q.dist < other.hw + 1) {
          const target = other.heights[q.i];
          const delta = target - road.heights[end];
          // Ease the difference in over the first/last 60 m.
          for (let k = 0; k < 30; k++) {
            const i = end === 0 ? k : road.samples.length - 1 - k;
            if (i < 0 || i >= road.samples.length) break;
            road.heights[i] += delta * (1 - k / 30);
          }
        }
      }
    }
  }
  const roadH = new Float32Array(N * N);
  for (const road of roads) {
    const S = road.samples;
    const R = road.hw + 14; // how far out the road levels the ground
    for (let i = 0; i + 1 < S.length; i++) {
      const a = S[i];
      const b = S[i + 1];
      const minX = Math.min(a.x, b.x) - R;
      const maxX = Math.max(a.x, b.x) + R;
      const minZ = Math.min(a.z, b.z) - R;
      const maxZ = Math.max(a.z, b.z) + R;
      const c0 = Math.max(0, Math.floor((minX - X0) / step));
      const c1 = Math.min(N - 1, Math.ceil((maxX - X0) / step));
      const r0 = Math.max(0, Math.floor((minZ - X0) / step));
      const r1 = Math.min(N - 1, Math.ceil((maxZ - X0) / step));
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const x = X0 + c * step;
          const z = X0 + r * step;
          const t = Math.min(1, Math.max(0, ((x - a.x) * ex + (z - a.z) * ez) / len2));
          const d = Math.hypot(x - (a.x + ex * t), z - (a.z + ez * t));
          const k = vi(c, r);
          if (d < roadDist[k]) {
            roadDist[k] = d;
            roadHW[k] = road.hw;
            roadH[k] = road.heights[i] + (road.heights[i + 1] - road.heights[i]) * t;
          }
        }
      }
    }
  }
  for (let k = 0; k < N * N; k++) {
    const d = roadDist[k];
    const hw = roadHW[k];
    if (d > hw + 14) continue;
    const w = 1 - smoothstep(hw + 1.2, hw + 14, d);
    H[k] += (roadH[k] - H[k]) * w;
  }

  // ---- 4. your field: the terrain meets its edge exactly (inside, it's a hole)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = X0 + c * step;
      const z = X0 + r * step;
      if (onPlot(x, z)) H[vi(c, r)] = ground.heightAt(x, z);
    }
  }

  function heightAt(x, z) {
    if (onPlot(x, z)) return ground.heightAt(x, z);
    return gridHeight(x, z);
  }

  // ---- nearest road (for tarmac grip and keeping grass off the road)
  const BUCKET = 24;
  const buckets = new Map();
  roads.forEach((road, ri) => road.samples.forEach((p, i) => {
    const key = `${Math.floor(p.x / BUCKET)},${Math.floor(p.z / BUCKET)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push([ri, i]);
  }));
  function roadAt(x, z) {
    const bx = Math.floor(x / BUCKET);
    const bz = Math.floor(z / BUCKET);
    let best = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [ri, i] of buckets.get(`${bx + dx},${bz + dz}`) ?? []) {
          const p = roads[ri].samples[i];
          const d = Math.hypot(p.x - x, p.z - z);
          if (!best || d < best.dist) best = { dist: d, road: roads[ri], i };
        }
      }
    }
    return best; // null: no road within ~24 m
  }
  const onRoad = (x, z, margin = 0) => {
    const r = roadAt(x, z);
    return !!r && r.dist <= r.road.hw + margin;
  };

  // ---- surface mix for each vertex: grass, worn verges, gravel yards, steep banks
  const yards = [
    [home.yard, 0.5], [map.depot.yard, 0.5], [map.dealer.yard, 0.5],
    [{ x0: home.driveway.x0, x1: home.driveway.x1, z0: home.yard.z0 - 14, z1: home.yard.z0 }, 0.5],
    [{ x0: map.depot.driveway.x0, x1: map.depot.driveway.x1, z0: map.depot.yard.z1, z1: map.depot.yard.z1 + 10 }, 0.5],
    [{ x0: map.dealer.yard.x0 - 14, x1: map.dealer.yard.x0, z0: map.dealer.driveway.z0, z1: map.dealer.driveway.z1 }, 0.5],
  ];
  const splat = new Float32Array(N * N * 4);
  const color = new Float32Array(N * N * 3);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const k = vi(c, r);
      const x = X0 + c * step;
      const z = X0 + r * step;
      const hx = (H[vi(Math.min(N - 1, c + 1), r)] - H[vi(Math.max(0, c - 1), r)]) / (2 * step);
      const hz = (H[vi(c, Math.min(N - 1, r + 1))] - H[vi(c, Math.max(0, r - 1))]) / (2 * step);
      const slope = Math.hypot(hx, hz);
      const n1 = fbm(x * 0.021, z * 0.021, 41);
      const n2 = fbm(x * 0.09 + 17.3, z * 0.09 - 4.1, 51);
      let g = 1;
      let d = 0.06 + 0.25 * smoothstep(0.62, 0.85, n2); // worn patches
      let v = 0;
      let rock = 0;
      // Verges: a strip of worn grass and grit along the roads.
      const rd = roadDist[k] - roadHW[k];
      if (rd < 2.5) {
        const t = 1 - smoothstep(0.2, 2.5, rd);
        d += t * 0.7;
        v += t * 0.5;
        g *= 1 - t * 0.8;
      }
      for (const [y, fall] of yards) {
        const t = 1 - smoothstep(0, 1.5 + fall, rectDistance(y, x, z));
        if (t > 0) {
          v = Math.max(v, t * 0.85);
          d = Math.max(d, t * 0.35);
          g *= 1 - t;
        }
      }
      if (slope > 0.45) {
        const t = smoothstep(0.45, 1.1, slope);
        d += t * 0.8;
        rock += smoothstep(0.9, 1.5, slope);
        g *= 1 - t * 0.7;
      }
      const sum = g + d + v + rock || 1;
      splat.set([g / sum, d / sum, v / sum, rock / sum], k * 4);
      const shade = 0.93 + 0.12 * n1;
      color.set([shade * 0.98, shade, shade * 0.9], k * 3);
    }
  }

  // ---- mesh
  const positions = new Float32Array(N * N * 3);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const k = vi(c, r);
      positions[k * 3] = X0 + c * step;
      positions[k * 3 + 1] = H[k];
      positions[k * 3 + 2] = X0 + r * step;
    }
  }
  const index = [];
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      const cx = X0 + c * step;
      const cz = X0 + r * step;
      if (plot && cx >= plot.x0 && cx + step <= plot.x1 && cz >= plot.z0 && cz + step <= plot.z1) continue; // the field's hole
      const a = vi(c, r);
      const b = a + 1;
      const d = a + N;
      const e = d + 1;
      index.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = createGroundMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // ---- physics: one heightfield over the whole map (dropping away inside the field)
  const hf = new Float32Array(N * N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = X0 + c * step;
      const z = X0 + r * step;
      hf[c * N + r] = deepInPlot(x, z) ? HOLE_DEPTH : H[vi(c, r)];
    }
  }
  world.createCollider(RAPIER.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: 2 * half, y: 1, z: 2 * half })
    .setTranslation(0, 0, 0).setFriction(0.9));
  // Walls round the edge of the map.
  for (const [x, z, hx, hz] of [[-half + 8, 0, 1, half], [half - 8, 0, 1, half], [0, -half + 8, half, 1], [0, half - 8, half, 1]]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 60, hz).setTranslation(x, 40, z));
  }

  // ---- roads: worn tarmac laid over the levelled ground, with a dashed centre line
  const roadMeshes = [];
  const junctions = [];
  for (const road of roads) {
    for (const p of [road.samples[0], road.samples[road.samples.length - 1]]) {
      for (const other of roads) if (other !== road && plan.nearestOnRoad(other, p.x, p.z).dist < other.hw + 1) junctions.push(p);
    }
  }
  roads.forEach((road, ri) => {
    const S = road.samples;
    const across = [-1, -0.5, 0, 0.5, 1];
    const pos = new Float32Array(S.length * across.length * 3);
    const uv = new Float32Array(S.length * across.length * 2);
    const nor = new Float32Array(S.length * across.length * 3);
    S.forEach((p, i) => {
      across.forEach((a, j) => {
        const x = p.x - p.dz * a * road.hw;
        const z = p.z + p.dx * a * road.hw;
        const k = i * across.length + j;
        pos.set([x, heightAt(x, z) + 0.05, z], k * 3);
        uv.set([(a + 1) * road.hw / 2, p.s / 2], k * 2);
        nor.set([0, 1, 0], k * 3);
      });
    });
    const idx = [];
    for (let i = 0; i + 1 < S.length; i++) {
      for (let j = 0; j + 1 < across.length; j++) {
        const a = i * across.length + j;
        const b = a + 1;
        const c = a + across.length;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = asphalt ? asphalt.clone() : null;
    if (tex) {
      tex.needsUpdate = true;
      tex.repeat.set(1, 1);
    }
    const mat = dampSheen(new THREE.MeshStandardMaterial({
      color: tex ? new THREE.Color(1.3, 1.18, 1.0) : 0x3b3a37, map: tex, roughness: 0.9, envMapIntensity: 0.7,
      polygonOffset: true, polygonOffsetFactor: -2 - ri, polygonOffsetUnits: -2 - ri,
    }));
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    scene.add(m);
    roadMeshes.push(m);

    // Centre dashes (none near junctions).
    const dashes = [];
    for (let s = 6; s < S[S.length - 1].s - 6; s += 9) {
      const i = Math.round(s / ROAD_STEP);
      const p = S[Math.min(S.length - 1, i)];
      if (junctions.some((j) => Math.hypot(j.x - p.x, j.z - p.z) < 20)) continue;
      dashes.push(p);
    }
    if (dashes.length) {
      const dashMat = dampSheen(new THREE.MeshStandardMaterial({
        color: 0xc9c4b4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -6 - ri, polygonOffsetUnits: -6 - ri,
      }));
      const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.12).rotateX(-Math.PI / 2), dashMat, dashes.length);
      const mtx = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const one = new THREE.Vector3(1, 1, 1);
      dashes.forEach((p, i) => {
        q.setFromAxisAngle(up, Math.atan2(-p.dz, p.dx));
        mtx.compose(new THREE.Vector3(p.x, heightAt(p.x, p.z) + 0.06, p.z), q, one);
        inst.setMatrixAt(i, mtx);
      });
      inst.receiveShadow = true;
      scene.add(inst);
      roadMeshes.push(inst);
    }
  });

  // What the ground is like at (x, z): height and surface mix (for grip, plants and sounds).
  function surfaceAt(x, z) {
    const c = Math.min(N - 1, Math.max(0, Math.round((x - X0) / step)));
    const r = Math.min(N - 1, Math.max(0, Math.round((z - X0) / step)));
    const k = vi(c, r);
    return {
      height: heightAt(x, z),
      grass: splat[k * 4],
      dirt: splat[k * 4 + 1],
      gravel: splat[k * 4 + 2],
      rock: splat[k * 4 + 3],
      road: onRoad(x, z),
    };
  }

  return {
    heightAt,
    surfaceAt,
    roadAt,
    onRoad,
    plot,
    half,
    // A heightmap picture of the map for the map screen: returns { data, size } in 0..1 heights.
    heightGrid: () => ({ H, N, X0, step }),
    dispose() {
      geometry.dispose();
      material.dispose();
      for (const m of roadMeshes) {
        m.geometry.dispose();
        m.material.map?.dispose?.();
        m.material.dispose();
      }
    },
  };
}

export { inRect };

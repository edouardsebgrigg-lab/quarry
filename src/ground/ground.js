// The ground you dig. The plot is a grid of columns (0.5 m cells). Each column is bedrock,
// then natural layers laid down long ago (data/ground.json: gravel, sand, clay, topsoil…),
// then any loose material that has been dumped there, with its own mix of materials.
//
// - dig() carves a bowl out of the top of the ground (loose material first, then the natural
//   layers from the top down) and returns the tonnes of each material it took.
// - deposit() drops loose material as a mound.
// - settle() lets loose material slump until no slope is steeper than it can stand, and makes
//   undercut natural walls cave in. It works a little at a time (call it every tick).
// Tonnes are always conserved. Dug material swells: 1 m³ in the ground is more once loose.
// Pure logic: no graphics. The 3D view reads heights and asks which chunks changed.

// ---------------------------------------------------------------- noise (deterministic)

function hash(x, z, seed) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
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
function fbm(x, z, seed) {
  return vnoise(x, z, seed) * 0.57 + vnoise(x * 2.03 + 11.3, z * 2.03 - 7.1, seed + 1) * 0.29 + vnoise(x * 4.1 - 3.7, z * 4.1 + 5.9, seed + 2) * 0.14;
}

// ---------------------------------------------------------------- base64 for saves

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(str) {
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

// A control byte describes 1..128 literal bytes or a run of 3..130 identical bytes.
// Byte planes put matching Float32 exponents together without rounding any value.
function packBytes(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    let run = 1;
    while (run < 130 && i + run < bytes.length && bytes[i + run] === bytes[i]) run++;
    if (run >= 3) { out.push(128 + run - 3, bytes[i]); i += run; }
    else {
      const start = i++;
      while (i - start < 128 && i < bytes.length) {
        if (i + 2 < bytes.length && bytes[i] === bytes[i + 1] && bytes[i] === bytes[i + 2]) break;
        i++;
      }
      out.push(i - start - 1);
      for (let n = start; n < i; n++) out.push(bytes[n]);
    }
  }
  return toBase64(Uint8Array.from(out));
}
function unpackBytes(text, length) {
  const bytes = fromBase64(text), out = new Uint8Array(length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const control = bytes[i], count = control < 128 ? control + 1 : control - 128 + 3;
    if (n + count > length) throw new Error('Invalid saved terrain data');
    if (control < 128) {
      if (i + count >= bytes.length) throw new Error('Invalid saved terrain data');
      out.set(bytes.subarray(i + 1, i + 1 + count), n); i += count;
    } else {
      if (++i >= bytes.length) throw new Error('Invalid saved terrain data');
      out.fill(bytes[i], n, n + count);
    }
    n += count;
  }
  if (n !== length) throw new Error('Invalid saved terrain data');
  return out;
}
function packFloats(values, fields) {
  const bytes = new Uint8Array(values.buffer), planes = new Uint8Array(bytes.length), count = values.length / fields;
  for (let f = 0; f < fields; f++) for (let b = 0; b < 4; b++) for (let n = 0; n < count; n++) {
    planes[(f * 4 + b) * count + n] = bytes[(n * fields + f) * 4 + b];
  }
  return packBytes(planes);
}
function unpackFloats(text, count, fields) {
  const planes = unpackBytes(text, count * fields * 4), bytes = new Uint8Array(planes.length);
  for (let f = 0; f < fields; f++) for (let b = 0; b < 4; b++) for (let n = 0; n < count; n++) {
    bytes[(n * fields + f) * 4 + b] = planes[(f * 4 + b) * count + n];
  }
  return new Float32Array(bytes.buffer);
}

// ---------------------------------------------------------------- the ground

export function createGround(groundData, plotId, opts = {}) {
  const plot = groundData.plots[plotId];
  const physics = groundData.physics ?? {};
  const { x0 = plot.origin?.[0] ?? 0, z0 = plot.origin?.[1] ?? 0, seed = 1 } = opts;
  const cell = groundData.cellSize;
  const area = cell * cell;
  const nx = Math.round(plot.width / cell);
  const nz = Math.round(plot.depth / cell);
  const N = nx * nz;
  const CC = groundData.chunkCells;
  const cnx = Math.ceil(nx / CC);
  const cnz = Math.ceil(nz / CC);

  const mats = Object.keys(groundData.materials);
  const M = mats.length;
  const mi = Object.fromEntries(mats.map((m, i) => [m, i]));
  const P = mats.map((m) => groundData.materials[m]);
  const bankDensity = P.map((p) => p.density); // t/m³ in the ground
  const swell = P.map((p) => p.swell);
  const looseDensity = P.map((p) => p.density / p.swell); // t/m³ once dug
  const tanRepose = P.map((p) => Math.tan((p.repose * Math.PI) / 180));
  const tanStanding = P.map((p) => Math.tan((p.standing * Math.PI) / 180));
  const layers = plot.strata.map((s) => mi[s.material]); // bottom to top
  const K = layers.length;
  const bedMat = mi[plot.bedrock];

  const bed = new Float32Array(N); // top of the bedrock
  const nat = layers.map(() => new Float32Array(N)); // natural layer thicknesses
  const loose = new Float32Array(N); // loose material thickness
  const compaction = new Float32Array(N); // firmness, not a change of density or mass
  const fill = new Float32Array(N); // compacted earthworks fill, in bank volume
  const fillMix = new Float32Array(N * M); // retain actual fill composition, including rock
  const mix = new Float32Array(N * M); // loose material: volume share of each material
  const disturbed = new Uint8Array(N); // bit 1: dug, dumped on or scraped (no more grass); bit 2: built on (graded and firm)
  const wear = new Float32Array(N); // turf worn by wheels and tracks: 0 untouched .. 1 torn through to bare soil
  // The outermost ring of cells never changes: the plot's edge meets the countryside around it
  // there, so it has to stay put (dig right up to it and it stands like the edge of a cutting).
  const fixed = new Uint8Array(N);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) fixed[j * nx + i] = 1;
  }
  const active = new Uint8Array(N); // queued to settle
  let queue = [];
  const dirty = new Set(); // chunks whose shape changed (for the 3D view)
  const touched = new Set(); // chunks that differ from the untouched field (for saves)

  // ---- generate the untouched field
  const initialBaseline = { version: 1, seed, x0, z0, surfaceRoll: plot.surfaceRoll,
    strata: plot.strata.map(s => ({ material: s.material, thickness: [...s.thickness] })) };
  let baseline = initialBaseline;
  function generate(targetBed, targetNat, spec) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = spec.x0 + (i + 0.5) * cell;
        const z = spec.z0 + (j + 0.5) * cell;
        const top = (fbm(x / 55, z / 55, spec.seed) - 0.5) * 2 * spec.surfaceRoll;
        let sum = 0;
        spec.strata.forEach((s, l) => {
          const t = s.thickness[0] + (s.thickness[1] - s.thickness[0]) * fbm(x / 38 + l * 17.1, z / 38 - l * 9.3, spec.seed + 10 + l * 3);
          targetNat[l][k] = t;
          sum += t;
        });
        targetBed[k] = top - sum;
      }
    }
  }
  generate(bed, nat, baseline);
  const bedBase = bed.slice();
  const geology = nat.map(layer => layer.slice()); // original contacts for exposed cut faces
  const bedBaseBits = new Uint32Array(bedBase.buffer);
  const geologyBits = geology.map(layer => new Uint32Array(layer.buffer));
  const rockDepth = plot.rockDepth ?? 0;
  let groundMoisture = 0;

  // ---- helpers
  const idx = (i, j) => j * nx + i;
  const height = (k) => {
    let h = bed[k] + loose[k] + fill[k];
    for (let l = 0; l < K; l++) h += nat[l][k];
    return h;
  };
  const chunkOf = (i, j) => Math.floor(j / CC) * cnx + Math.floor(i / CC);
  // A cell changed in a way that's saved but doesn't show (yet): no redraw.
  function touch(k) {
    const i = k % nx;
    touched.add(chunkOf(i, (k - i) / nx));
  }
  function changed(k) {
    const i = k % nx;
    const j = (k - i) / nx;
    const c = chunkOf(i, j);
    dirty.add(c);
    touched.add(c);
    // Chunk edges share vertices with their neighbours.
    const li = i % CC;
    const lj = j % CC;
    if (li === 0 && i > 0) dirty.add(chunkOf(i - 1, j));
    if (lj === 0 && j > 0) dirty.add(chunkOf(i, j - 1));
    if (li === 0 && lj === 0 && i > 0 && j > 0) dirty.add(chunkOf(i - 1, j - 1));
  }
  function activate(k) {
    if (!active[k]) {
      active[k] = 1;
      queue.push(k);
    }
  }
  function activateAround(k) {
    const i = k % nx;
    const j = (k - i) / nx;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < nx && b < nz) activate(idx(a, b));
      }
    }
  }
  const looseDensityOf = (k) => {
    let d = 0;
    for (let m = 0; m < M; m++) d += mix[k * M + m] * looseDensity[m];
    return d || looseDensity[0];
  };
  const reposeOf = (k) => {
    let t = 0;
    for (let m = 0; m < M; m++) t += mix[k * M + m] * tanRepose[m];
    return t || tanRepose[0];
  };
  function topNatural(k) {
    for (let l = K - 1; l >= 0; l--) if (nat[l][k] > 1e-4) return l;
    return -1;
  }
  function topMaterial(k) {
    if (loose[k] > 0.02) {
      let best = 0;
      for (let m = 1; m < M; m++) if (mix[k * M + m] > mix[k * M + best]) best = m;
      return best;
    }
    if (fill[k] > 1e-4) {
      let best = 0;
      for (let m = 1; m < M; m++) if (fillMix[k * M + m] > fillMix[k * M + best]) best = m;
      return best;
    }
    const l = topNatural(k);
    return l >= 0 ? layers[l] : bedMat;
  }

  // Add loose volume (m³ per material) to a cell.
  function addLoose(k, vols) {
    let add = 0;
    for (let m = 0; m < M; m++) add += vols[m];
    if (add <= 0) return;
    const thick = add / area;
    const old = loose[k];
    const nu = old + thick;
    compaction[k] *= old / nu; // fresh spoil loosens a compacted surface
    for (let m = 0; m < M; m++) mix[k * M + m] = (mix[k * M + m] * old + (vols[m] / area)) / nu;
    loose[k] = nu;
  }

  // Remove `dh` metres from the top of a column (not bedrock). Adds tonnes to `out`.
  // Returns the thickness actually removed.
  function removeTop(k, dh, out) {
    let rem = dh;
    if (loose[k] > 0 && rem > 0) {
      const take = Math.min(loose[k], rem);
      for (let m = 0; m < M; m++) out[m] += take * area * mix[k * M + m] * looseDensity[m];
      loose[k] -= take;
      if (loose[k] < 1e-6) {
        loose[k] = 0;
        mix.fill(0, k * M, k * M + M);
      }
      rem -= take;
    }
    if (fill[k] > 0 && rem > 0) {
      const take = Math.min(fill[k], rem);
      for (let m = 0; m < M; m++) out[m] += take * area * fillMix[k * M + m] * bankDensity[m];
      fill[k] -= take;
      if (fill[k] < 1e-6) { fill[k] = 0; fillMix.fill(0, k * M, k * M + M); }
      rem -= take;
    }
    for (let l = K - 1; l >= 0 && rem > 0; l--) {
      const take = Math.min(nat[l][k], rem);
      if (take <= 0) continue;
      out[layers[l]] += take * area * bankDensity[layers[l]];
      nat[l][k] -= take;
      rem -= take;
    }
    return dh - rem;
  }

  // Tonnes above height y in a column (without changing anything).
  function tonnesAbove(k, y) {
    let top = height(k);
    if (top <= y) return 0;
    let t = 0;
    const lt = Math.min(loose[k], top - y);
    if (lt > 0) t += lt * area * looseDensityOf(k);
    top -= loose[k];
    if (fill[k] > 0 && top > y) {
      const take = Math.min(fill[k], top - y);
      for (let m = 0; m < M; m++) t += take * area * fillMix[k * M + m] * bankDensity[m];
    }
    top -= fill[k];
    for (let l = K - 1; l >= 0 && top > y; l--) {
      const take = Math.min(nat[l][k], top - y);
      t += take * area * bankDensity[layers[l]];
      top -= nat[l][k];
    }
    return t;
  }

  // Loose volume (m³, once dug) above height y in a column.
  function looseAbove(k, y) {
    let top = height(k);
    if (top <= y) return 0;
    let v = 0;
    const lt = Math.min(loose[k], top - y);
    if (lt > 0) v += lt * area;
    top -= loose[k];
    if (fill[k] > 0 && top > y) {
      const take = Math.min(fill[k], top - y);
      for (let m = 0; m < M; m++) v += take * area * fillMix[k * M + m] * swell[m];
    }
    top -= fill[k];
    for (let l = K - 1; l >= 0 && top > y; l--) {
      const take = Math.min(nat[l][k], top - y);
      v += take * area * swell[layers[l]];
      top -= nat[l][k];
    }
    return v;
  }

  // Every cell whose centre is within r of the segment a..b (at least the cells it passes over).
  function cellsAlong(ax, az, bx, bz, r, fn) {
    const reach = Math.max(r, cell * 0.5);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + reach - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz) + reach - z0) / cell));
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * cell;
        const cz = z0 + (j + 0.5) * cell;
        const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / len2)) : 0;
        if (Math.hypot(cx - ax - dx * t, cz - az - dz * t) <= reach) fn(idx(i, j));
      }
    }
  }

  function cellsInRadius(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r - x0) / cell));
    const i1 = Math.min(nx - 1, Math.floor((x + r - x0) / cell));
    const j0 = Math.max(0, Math.floor((z - r - z0) / cell));
    const j1 = Math.min(nz - 1, Math.floor((z + r - z0) / cell));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * cell;
        const cz = z0 + (j + 0.5) * cell;
        const d = Math.hypot(cx - x, cz - z);
        if (d <= Math.max(r, cell * 0.72)) fn(idx(i, j), d);
      }
    }
  }

  function response(k, moisture = groundMoisture) {
    const m = topMaterial(k);
    const p = P[m];
    const isLoose = loose[k] > 0.002;
    const wet = Math.max(0, Math.min(1, moisture));
    const firmness = compaction[k];
    const resistance = (p.resistance ?? 30) * (isLoose ? physics.looseResistanceFactor ?? 0.28 : 1)
      * (mats[m] === 'clay' ? 1 - wet * (1 - (physics.wetClayResistanceFactor ?? 0.72)) : 1)
      * (1 + firmness * 0.45);
    return {
      material: mats[m], resistance, loose: isLoose, compaction: firmness,
      cohesion: (p.cohesion ?? 0) * (1 - wet * (physics.wetCohesionFactor ?? 0.5)),
      flow: p.flow ?? 0.6,
      // (mud is slippery; wet sand firms up)
      traction: (p.traction ?? 0.7) + ((p.wetTraction ?? (p.traction ?? 0.7) * 0.78) - (p.traction ?? 0.7)) * wet + firmness * 0.08,
      rollingResistance: (p.rollingResistance ?? 0.04) * (1 + wet * 1.5) * (1 - firmness * 0.45),
    };
  }
  const cellAt = (x, z) => idx(Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell))), Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell))));

  const toRecord = (arr) => {
    const out = {};
    arr.forEach((t, m) => { if (t > 1e-6) out[mats[m]] = t; });
    return out;
  };

  // ---------------------------------------------------------------- earthworks
  // Grading a strip (a haul road, a ramp or a level area) between two points, with a batter (a
  // sloping side) where it meets the ground. Nothing is made or lost: the strip's cut becomes
  // fill, fill that's still needed comes from loose heaps within reach, a gravel surface comes
  // from gravel in the cut or in those heaps, and any leftover cut is heaped beside the strip.
  // Fill is compacted into the natural layers under the surface, so it doesn't slump.
  // works(spec, commit) plans the job (commit false) or does it (commit true): the same
  // steps either way, so a plan is exactly what gets built.
  const BATTER = 1.4; // sides slope 1 up for 1.4 across
  const heightNat = (k) => height(k) - loose[k];
  // Tonnes per material above height y (natural layers only if `natOnly`), without changing anything.
  function measureAbove(k, y, out, dropLoose) {
    let top = height(k);
    if (loose[k] > 0) {
      const dh = dropLoose ? loose[k] : Math.min(loose[k], Math.max(0, top - y));
      for (let m = 0; m < M; m++) out[m] += dh * area * mix[k * M + m] * looseDensity[m];
    }
    top -= loose[k];
    if (fill[k] > 0 && top > y) {
      const dh = Math.min(fill[k], top - y);
      for (let m = 0; m < M; m++) out[m] += dh * area * fillMix[k * M + m] * bankDensity[m];
    }
    top -= fill[k];
    for (let l = K - 1; l >= 0 && top > y; l--) {
      const take = Math.min(nat[l][k], top - y);
      if (take > 0) out[layers[l]] += take * area * bankDensity[layers[l]];
      top -= nat[l][k];
    }
  }

  function works(spec, commit) {
    const { ax, az, bx, bz, width, mode, sourceRadius = 30, surface = null, surfaceThickness = 0.12, maxGrade = 0.1, obstacles = [] } = spec;
    // A cell is occupied even when just its corner lies under the obstacle circle.
    const occupied = (k) => obstacles.some(o => {
      const cx = x0 + (k % nx) * cell;
      const cz = z0 + Math.floor(k / nx) * cell;
      const dx = Math.max(cx - o.x, 0, o.x - cx - cell);
      const dz = Math.max(cz - o.z, 0, o.z - cz - cell);
      return dx * dx + dz * dz <= o.r * o.r;
    });
    const fail = (reason) => ({ ok: false, reason });
    const L = Math.hypot(bx - ax, bz - az);
    if (L < 0.5) return fail('Too short');
    const ux = (bx - ax) / L;
    const uz = (bz - az) / L;
    const half = width / 2;
    const sm = surface ? mi[surface] : -1;
    const s = surface ? surfaceThickness : 0;
    const reach = 6;
    const xmin = Math.min(ax, bx) - half - reach;
    const xmax = Math.max(ax, bx) + half + reach;
    const zmin = Math.min(az, bz) - half - reach;
    const zmax = Math.max(az, bz) + half + reach;
    const i0 = Math.floor((xmin - x0) / cell);
    const i1 = Math.floor((xmax - x0) / cell);
    const j0 = Math.floor((zmin - z0) / cell);
    const j1 = Math.floor((zmax - z0) / cell);
    if (i0 < 1 || j0 < 1 || i1 > nx - 2 || j1 > nz - 2) return fail('Too close to the edge of your land');

    // Pass 1: which cells are in the strip, and where along it.
    const cells = [];
    let sumH = 0;
    let core = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = x0 + (i + 0.5) * cell;
        const cz = z0 + (j + 0.5) * cell;
        const du = (cx - ax) * ux + (cz - az) * uz;
        const dv = -(cx - ax) * uz + (cz - az) * ux;
        const uc = Math.min(L, Math.max(0, du));
        const d = Math.hypot(du - uc, dv - Math.min(half, Math.max(-half, dv)));
        if (d > reach) continue;
        const k = idx(i, j);
        cells.push({ k, uc, d, isCore: d === 0 });
        if (d === 0) {
          core += 1;
          sumH += heightNat(k);
        }
      }
    }
    if (!core) return fail('Too narrow');
    const hA = api.heightAt(ax, az);
    const hB = api.heightAt(bx, bz);
    const pA = mode === 'level' ? sumH / core : hA;
    const pB = mode === 'level' ? sumH / core : hB;
    const grade = Math.abs(pB - pA) / L;
    if (grade > maxGrade + 1e-9) return { ok: false, reason: 'steep', grade, pA, pB, length: L };

    // Pass 2: targets, and the cut and fill they need.
    const pool = new Float64Array(M); // tonnes cut
    let fillBank = 0; // bank m³ of fill needed
    let cutBank = 0;
    let surfaceLoose = 0;
    const jobs = [];
    for (const c of cells) {
      const k = c.k;
      const plan = pA + (pB - pA) * (c.uc / L);
      const h = c.isCore ? heightNat(k) : height(k);
      let t;
      if (c.isCore) t = plan - s;
      else {
        const off = c.d / BATTER;
        t = plan > h ? Math.max(h, plan - off) : Math.min(h, plan + off);
      }
      if (!c.isCore && Math.abs(t - h) < 0.004) continue;
      if (fixed[k]) return fail('Too close to the edge of your land');
      if (t < bed[k] + 0.01) return fail('Solid rock in the way: it can\'t be cut here');
      const before = pool.slice();
      if (c.isCore) measureAbove(k, t, pool, true);
      else if (t < h) measureAbove(k, t, pool, false);
      const cutT = pool.reduce((a, v, m) => a + (v - before[m]) / bankDensity[m], 0);
      cutBank += cutT;
      const fillH = t > h ? t - h : 0;
      fillBank += fillH * area;
      if (c.isCore) surfaceLoose += s * area;
      jobs.push({ k, t, h, isCore: c.isCore, fill: fillH });
    }

    // Supply: the surface's gravel first from the cut, then from heaps; then the fill.
    const centre = { x: (ax + bx) / 2, z: (az + bz) / 2 };
    const radius = L / 2 + sourceRadius;
    const poolLoose = (m) => pool[m] / looseDensity[m];
    const gravelFromCut = sm >= 0 ? Math.min(surfaceLoose, poolLoose(sm)) : 0;
    const gravelFromHeaps = surfaceLoose - gravelFromCut;
    const poolAfter = pool.slice();
    if (sm >= 0) poolAfter[sm] -= gravelFromCut * looseDensity[sm];
    const poolBank = poolAfter.reduce((a, v, m) => a + v / bankDensity[m], 0);
    const fillFromHeaps = Math.max(0, fillBank - poolBank);
    // (heaps inside the works are already part of the cut, so they can't be used twice)
    const inWorks = new Set(cells.map((c) => c.k));
    const src = gatherLoose(centre, radius, { gravel: sm >= 0 ? { m: sm, vol: gravelFromHeaps } : null, bank: fillFromHeaps, exclude: inWorks, eligible(k) {
      if (occupied(k)) return false;
      const x = x0 + (k % nx + 0.5) * cell;
      const z = z0 + (Math.floor(k / nx) + 0.5) * cell;
      const along = Math.max(0, Math.min(L, (x - ax) * ux + (z - az) * uz));
      return Math.hypot(x - ax - ux * along, z - az - uz * along) <= sourceRadius;
    } }, commit);
    // What there will be to build with, and what's left over: the cut (less the surface's gravel)
    // plus the heaps' fill, of which the fill takes what it needs.
    const availPlan = pool.slice();
    if (sm >= 0) availPlan[sm] = Math.max(0, availPlan[sm] - gravelFromCut * looseDensity[sm]);
    for (let m = 0; m < M; m++) availPlan[m] += src.tonnes[m];
    const availBankPlan = availPlan.reduce((a, v, m) => a + v / bankDensity[m], 0);
    const usePlan = availBankPlan > 0 ? Math.min(1, fillBank / availBankPlan) : 0;
    const availTonnes = availPlan.reduce((a, v) => a + v, 0);
    // Exact, read-only supply breakdown. Surface volumes are loose m³; fill is bank
    // (compacted) m³. Records are tonnes by material, including mixtures retained in fill.
    // Found supply is what this plan can actually use, never all material in the search area.
    const supply = (required, fromCut, fromHeaps) => ({ required, fromCut, fromHeaps, missing: Math.max(0, required - fromCut - fromHeaps) });
    const surfaceSupply = supply(surfaceLoose, gravelFromCut, src.gravelFound);
    const heapMaterials = src.tonnes.slice();
    if (sm >= 0) heapMaterials[sm] += src.gravelTonnes;
    const materials = {
      sourceRadius,
      cut: toRecord(pool),
      heaps: toRecord(heapMaterials),
      surface: {
        material: surface,
        looseVolume: surfaceSupply,
        tonnes: Object.fromEntries(Object.entries(surfaceSupply).map(([key, value]) => [key, sm >= 0 ? value * looseDensity[sm] : 0])),
      },
      fill: {
        bankVolume: supply(fillBank, Math.min(fillBank, poolBank), src.bankFound),
        tonnes: toRecord(Array.from(availPlan, v => v * usePlan)),
      },
      spoil: toRecord(Array.from(availPlan, v => v * (1 - usePlan))),
    };
    // Query the actual grading jobs, including side batters, rather than the maximum
    // search reach. Only visit cells under the circle's bounding box on each query.
    const changedCells = new Set(jobs.map(({ k }) => k));
    const touchesChangedCell = ({ x, z, r = 0 }) => {
      const imin = Math.max(0, Math.floor((x - r - x0) / cell) - 1);
      const imax = Math.min(nx - 1, Math.floor((x + r - x0) / cell));
      const jmin = Math.max(0, Math.floor((z - r - z0) / cell) - 1);
      const jmax = Math.min(nz - 1, Math.floor((z + r - z0) / cell));
      for (let j = jmin; j <= jmax; j++) for (let i = imin; i <= imax; i++) {
        if (!changedCells.has(idx(i, j))) continue;
        const dx = Math.max(x0 + i * cell - x, 0, x - (x0 + (i + 1) * cell));
        const dz = Math.max(z0 + j * cell - z, 0, z - (z0 + (j + 1) * cell));
        if (dx * dx + dz * dz <= r * r) return true;
      }
      return false;
    };
    const plan = {
      ok: true, mode, length: L, width, grade, pA, pB, cells: jobs.length, coreArea: core * area,
      touchesChangedCell,
      cutBank, fillBank, surfaceLoose, cutTonnes: pool.reduce((a, v) => a + v, 0),
      heapGravelNeeded: gravelFromHeaps, heapFillNeeded: fillFromHeaps,
      heapGravelFound: src.gravelFound, heapFillFound: src.bankFound,
      surfaceTonnes: sm >= 0 ? surfaceLoose * looseDensity[sm] : 0,
      heapTonnes: src.gravelTonnes + src.tonnes.reduce((a, v) => a + v, 0),
      fillTonnes: availTonnes * usePlan,
      spoilTonnes: availTonnes * (1 - usePlan),
      materials,
    };
    if (src.gravelFound < gravelFromHeaps - 1e-6) return { ...plan, ok: false, reason: 'gravel' };
    if (src.bankFound < fillFromHeaps - 1e-6) return { ...plan, ok: false, reason: 'fill' };
    // Choose once during planning, before any mutation. Preview and build use the same
    // ordered candidates and the whole deposit footprint must fit on the land.
    if (plan.spoilTonnes > 1e-6) {
      plan.spoilRadius = 1.5 + 0.1 * Math.sqrt(plan.spoilTonnes);
      const off = half + reach + plan.spoilRadius;
      const spots = [
        { x: centre.x - uz * off, z: centre.z + ux * off },
        { x: centre.x + uz * off, z: centre.z - ux * off },
        { x: ax - ux * off, z: az - uz * off },
        { x: bx + ux * off, z: bz + uz * off },
      ];
      let blocker;
      plan.spoilAt = spots.find(p => {
        const r = plan.spoilRadius + cell;
        if (p.x - r <= x0 || p.x + r >= x0 + nx * cell || p.z - r <= z0 || p.z + r >= z0 + nz * cell) return false;
        const o = obstacles.find(o => Math.hypot(o.x - p.x, o.z - p.z) <= o.r + r);
        if (o) { blocker ??= o.label ?? 'the obstacle'; return false; }
        return !touchesChangedCell({ ...p, r });
      });
      if (!plan.spoilAt) return { ...plan, ok: false, reason: 'spoil', blocker };
    }
    if (!commit) return plan;

    // ---- do it
    const cutOut = new Float64Array(M);
    for (const job of jobs) {
      const k = job.k;
      if (job.isCore) {
        if (loose[k] > 0) removeTop(k, loose[k], cutOut);
        if (heightNat(k) > job.t) removeTop(k, heightNat(k) - job.t, cutOut);
      } else if (job.t < job.h) removeTop(k, job.h - job.t, cutOut);
    }
    // The materials available for fill: what was cut (less the surface's gravel) plus the heaps'.
    const avail = cutOut.slice();
    if (sm >= 0) avail[sm] = Math.max(0, avail[sm] - gravelFromCut * looseDensity[sm]);
    src.take(); // removes the heaps' share from the ground
    for (let m = 0; m < M; m++) avail[m] += src.tonnes[m];
    const availBank = avail.reduce((a, v, m) => a + v / bankDensity[m], 0);
    const use = availBank > 0 ? Math.min(1, fillBank / availBank) : 0;
    const share = Array.from(avail, (v, m) => (availBank > 0 ? v / bankDensity[m] / availBank : 0));
    for (const job of jobs) {
      const k = job.k;
      if (job.fill > 0) {
        const old = fill[k];
        const nu = old + job.fill;
        for (let m = 0; m < M; m++) {
          fillMix[k * M + m] = (fillMix[k * M + m] * old + job.fill * share[m]) / nu;
        }
        fill[k] = nu;
        compaction[k] = 1;
      }
      if (job.isCore && sm >= 0) {
        const vols = new Float64Array(M);
        vols[sm] = s * area;
        addLoose(k, vols);
      }
      disturbed[k] = job.isCore ? 3 : 1;
      changed(k);
    }
    for (const job of jobs) activateAround(job.k);
    // Anything left over is heaped beside the strip, not lost.
    const spoil = new Float64Array(M);
    let spoilTotal = 0;
    for (let m = 0; m < M; m++) {
      spoil[m] = Math.max(0, avail[m] * (1 - use));
      spoilTotal += spoil[m];
    }
    if (spoilTotal > 1e-6) {
      plan.spoilTonnes = spoilTotal;
      api.deposit({ ...plan.spoilAt, tonnes: toRecord(spoil), radius: plan.spoilRadius });
    }
    return plan;
  }

  // Loose material in heaps (not on built ground) near a point, nearest first: `bank` m³ of any
  // material (compared as bank volume) and `gravel.vol` m³ of one material. With commit false it only
  // measures; take() removes what was found.
  function gatherLoose(centre, radius, need, commit) {
    const found = { gravelFound: 0, bankFound: 0, tonnes: new Float64Array(M), gravelTonnes: 0, take() {} };
    const list = [];
    cellsInRadius(centre.x, centre.z, radius, (k, d) => {
      if (loose[k] > 1e-4 && !(disturbed[k] & 2) && !need.exclude?.has(k) && (!need.eligible || need.eligible(k))) list.push([k, d]);
    });
    list.sort((p, q) => p[1] - q[1]);
    const takes = [];
    let gravelLeft = need.gravel ? need.gravel.vol : 0;
    let bankLeft = need.bank;
    const left = new Map(); // loose thickness still available per cell
    for (const [k] of list) left.set(k, loose[k]);
    if (need.gravel && gravelLeft > 0) {
      const gm = need.gravel.m;
      for (const [k] of list) {
        if (gravelLeft <= 1e-9) break;
        const vol = left.get(k) * area * mix[k * M + gm];
        if (vol < 1e-6) continue;
        const t = Math.min(vol, gravelLeft);
        takes.push({ k, m: gm, vol: t });
        left.set(k, left.get(k) - t / area);
        gravelLeft -= t;
        found.gravelFound += t;
        found.gravelTonnes += t * looseDensity[gm];
      }
    }
    // (taking gravel changes a cell's mix; the remaining loose thickness is `left`, of the other materials)
    if (bankLeft > 1e-9) {
      for (const [k] of list) {
        if (bankLeft <= 1e-9) break;
        const thick = left.get(k);
        if (thick < 1e-6) continue;
        // the mix once any gravel has been taken from this cell
        const vols = new Float64Array(M);
        let tot = 0;
        for (let m = 0; m < M; m++) {
          vols[m] = loose[k] * area * mix[k * M + m];
        }
        for (const t of takes) if (t.k === k) vols[t.m] -= t.vol;
        for (let m = 0; m < M; m++) tot += Math.max(0, vols[m]);
        if (tot < 1e-9) continue;
        const bankPerLoose = vols.reduce((a, v, m) => a + Math.max(0, v) / swell[m], 0) / tot;
        const takeLoose = Math.min(tot, bankLeft / bankPerLoose);
        const f = takeLoose / tot;
        for (let m = 0; m < M; m++) {
          const v = Math.max(0, vols[m]) * f;
          if (v <= 0) continue;
          takes.push({ k, m, vol: v });
          found.tonnes[m] += v * looseDensity[m];
        }
        bankLeft -= takeLoose * bankPerLoose;
        found.bankFound += takeLoose * bankPerLoose;
      }
    }
    // (found.tonnes holds the fill's tonnes only; the surface's gravel is separate)
    found.take = () => {
      if (!commit) return;
      const byCell = new Map();
      for (const t of takes) byCell.set(t.k, [...(byCell.get(t.k) ?? []), t]);
      for (const [k, list2] of byCell) {
        const vols = new Float64Array(M);
        for (let m = 0; m < M; m++) vols[m] = loose[k] * area * mix[k * M + m];
        for (const t of list2) vols[t.m] = Math.max(0, vols[t.m] - t.vol);
        const total = vols.reduce((a, v) => a + v, 0);
        if (total < 1e-6) {
          loose[k] = 0;
          mix.fill(0, k * M, k * M + M);
        } else {
          loose[k] = total / area;
          for (let m = 0; m < M; m++) mix[k * M + m] = vols[m] / total;
        }
        disturbed[k] = 1;
        changed(k);
        activateAround(k);
      }
    };
    return found;
  }

  // A game blast changes finite bank rock into loose rock in the same columns.
  // Preview and commit use the identical footprint; neither excavates or deletes cover.
  function fracturePlan({ x, z, radius, depth, maxCover = 0 } = {}) {
    const fail = reason => ({ ok: false, reason, cells: [], tonnes: 0 });
    if (![x,z,radius,depth,maxCover].every(Number.isFinite) || radius < cell || depth <= 0 || maxCover < 0) return fail('Choose a valid rock cut');
    if (!api.workable(x-radius,z-radius) || !api.workable(x+radius,z+radius)) return fail('Keep the whole cut inside your field');
    const cells = [], fingerprint = [];
    let covered = 0, built = false, coverDepth = 0, tonnes = 0;
    cellsInRadius(x,z,radius,k => {
      const cover = height(k)-bed[k];
      coverDepth = Math.max(coverDepth,cover);
      if (cover > maxCover + 1e-6) covered++;
      if (disturbed[k] & 2) built = true;
      // Float32-rounded bed height is also used when measuring the released mass.
      const floor = bedBase[k]-rockDepth;
      let bottom = Math.fround(Math.max(floor,bed[k]-depth));
      // Round toward the remaining reserve, never below its finite floor.
      if (bottom < floor) bottom = Math.fround(bottom + Math.max(1,Math.abs(bottom))*2**-23);
      const take = Math.max(0,bed[k]-bottom);
      cells.push({ k, bottom, tonnes: take*area*bankDensity[bedMat] });
      tonnes += take*area*bankDensity[bedMat];
      fingerprint.push([k,bed[k],loose[k],fill[k],disturbed[k]&2,...nat.map(l=>l[k])]);
    });
    const reason = built ? 'Choose unbuilt ground, away from graded roads and ramps'
      : covered ? `Strip the cover and clear loose rubble first (${coverDepth.toFixed(2)} m remains)`
      : tonnes <= 1e-6 ? 'This cut has reached the bottom of the rock reserve' : null;
    return { ok: !reason, reason, cells, tonnes, coverDepth, coveredCells: covered,
      cellCount: cells.length, signature: JSON.stringify(fingerprint), material: mats[bedMat] };
  }

  // ---------------------------------------------------------------- API
  const api = {
    materials: mats,
    cellSize: cell,
    nx,
    nz,
    x0,
    z0,
    chunkCells: CC,
    chunksX: cnx,
    chunksZ: cnz,

    inside: (x, z) => x >= x0 && z >= z0 && x < x0 + nx * cell && z < z0 + nz * cell,
    // Inside and not on the edge ring (so digging or tipping here can change the ground).
    workable: (x, z) => x >= x0 + cell && z >= z0 + cell && x < x0 + (nx - 1) * cell && z < z0 + (nz - 1) * cell,

    // Height of the ground at a point (smooth between cell centres).
    heightAt(x, z) {
      const u = Math.min(nx - 1, Math.max(0, (x - x0) / cell - 0.5));
      const v = Math.min(nz - 1, Math.max(0, (z - z0) / cell - 0.5));
      const i = Math.min(nx - 2, Math.floor(u));
      const j = Math.min(nz - 2, Math.floor(v));
      const fu = u - i;
      const fv = v - j;
      const h00 = height(idx(i, j));
      const h10 = height(idx(i + 1, j));
      const h01 = height(idx(i, j + 1));
      const h11 = height(idx(i + 1, j + 1));
      return h00 + (h10 - h00) * fu + (h01 - h00) * fv + (h00 - h10 - h01 + h11) * fu * fv;
    },
    // Height of a cell by grid position (for building meshes).
    cellHeight: (i, j) => height(idx(Math.min(nx - 1, Math.max(0, i)), Math.min(nz - 1, Math.max(0, j)))),
    // What you'd see (and dig) at the surface: a material id.
    surfaceAt(x, z) {
      const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / cell)));
      const j = Math.min(nz - 1, Math.max(0, Math.floor((z - z0) / cell)));
      return mats[topMaterial(idx(i, j))];
    },
    // Read-only survey of the remaining column, including tipped spoil and graded fill.
    // Depths are measured from today's surface, never from the original geology.
    inspectAt(x, z) {
      if (![x,z].every(Number.isFinite) || !api.inside(x,z)) return null;
      const k=cellAt(x,z), rows=[];
      let depth=0;
      const add=(material,thickness,kind,composition=null)=>{
        if (thickness<=1e-5) return;
        rows.push({material,depth,thickness,kind,composition});depth+=thickness;
      };
      const mixture=(array)=>{
        const values=mats.map((m,i)=>[m,array[k*M+i]]).filter(([,v])=>v>1e-6);
        const total=values.reduce((sum,[,v])=>sum+v,0);
        values.sort((a,b)=>b[1]-a[1]);
        return {material:values[0]?.[0]??mats[topMaterial(k)],composition:Object.fromEntries(values.map(([m,v])=>[m,v/Math.max(total,1e-9)]))};
      };
      if (loose[k]>1e-5) { const m=mixture(mix);add(m.material,loose[k],'loose',m.composition); }
      if (fill[k]>1e-5) { const m=mixture(fillMix);add(m.material,fill[k],'compacted',m.composition); }
      for(let l=K-1;l>=0;l--) add(mats[layers[l]],nat[l][k],'natural');
      return {surface:{...response(k),coverMaterial:rows[0]?.material??mats[bedMat]},layers:rows,bedrock:mats[bedMat],bedrockDepth:depth,height:height(k)};
    },
    cellSurface: (i, j) => topMaterial(idx(i, j)),
    cellDisturbed: (i, j) => disturbed[idx(i, j)] !== 0,
    // How worn the turf is (0..1): tyre tracks first flatten the grass, then tear it to mud.
    cellWear: (i, j) => wear[idx(i, j)],
    // A cell that has been built on (a graded road, ramp or level area).
    cellBuilt: (i, j) => (disturbed[idx(i, j)] & 2) === 2,
    cellLoose: (i, j) => loose[idx(i, j)],
    setMoisture(value) { groundMoisture = Math.max(0, Math.min(1, Number(value) || 0)); },
    cellCompaction: (i, j) => compaction[idx(i, j)],
    // Undisturbed geological contacts, bottom to top, for shading exposed pit walls.
    cellGeology(i, j) {
      const k = idx(i, j);
      let y = bedBase[k];
      return { bed: y, layers: geology.map((layer, l) => ({ material: mats[layers[l]], top: y += layer[k] })) };
    },
    materialResponseAt: (x, z, opts = {}) => response(cellAt(x, z), opts.moisture),
    digResistanceAt: (x, z, opts = {}) => response(cellAt(x, z), opts.moisture).resistance,

    planFracture(spec) {
      const { cells: _cells, ...plan } = fracturePlan(spec);
      return plan;
    },
    fracture(spec, expectedSignature) {
      const plan = fracturePlan(spec);
      if (!plan.ok) { const { cells: _cells, ...result } = plan; return result; }
      if (expectedSignature !== plan.signature) return { ok:false,reason:'The surveyed ground changed; survey a fresh cut' };
      for (const c of plan.cells) {
        if (c.tonnes <= 0) continue;
        bed[c.k] = c.bottom;
        const volumes = new Float64Array(M);
        volumes[bedMat] = c.tonnes/looseDensity[bedMat];
        addLoose(c.k,volumes);
        disturbed[c.k] = 1;
        changed(c.k);
        activateAround(c.k);
      }
      return {ok:true,tonnes:plan.tonnes,material:plan.material,cells:plan.cellCount};
    },

    // A cutting edge sweeps a strip, rather than drilling a circular bowl at every sample.
    // Force is kN; scarce breakout force takes a smaller bite. Only a breaker cuts intact rock.
    cutSweep({ from, to, width = cell, maxVolume = Infinity, maxTonnes = Infinity, force = Infinity, attack = 1, moisture = groundMoisture, tool = 'bucket' }) {
      const empty = (blocked = null, resistance = 0) => ({ tonnes: {}, total: 0, volume: 0, resistance, blocked });
      if (!from || !to || ![from.x, from.y, from.z, to.x, to.y, to.z, width].every(Number.isFinite) || width <= 0) return empty('invalid');
      const dx = to.x - from.x, dz = to.z - from.z;
      const horizontal = Math.hypot(dx, dz);
      const stroke = Math.hypot(horizontal, to.y - from.y);
      if (stroke < (physics.minimumStroke ?? 0.001) || attack <= 0 || force <= 0 || maxVolume <= 0 || maxTonnes <= 0) return empty();
      if (stroke > (physics.maxSweepLength ?? 1.5) * 4) return empty('movement'); // repositioning is not a digging stroke
      const candidates = [];
      const half = width / 2;
      let peak = 0, hitRock = false;
      cellsInRadius((from.x + to.x) / 2, (from.z + to.z) / 2, horizontal / 2 + half + cell * 0.72, k => {
        if (fixed[k]) return;
        const x = x0 + (k % nx + 0.5) * cell;
        const z = z0 + (Math.floor(k / nx) + 0.5) * cell;
        const t = horizontal > 1e-6 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / (horizontal * horizontal))) : 1;
        const edgeDistance = Math.hypot(x - from.x - dx * t, z - from.z - dz * t);
        if (edgeDistance > half + cell * 0.5) return;
        const h = height(k);
        const edgeY = from.y + (to.y - from.y) * t;
        if (edgeY >= h) return;
        const r = response(k, moisture);
        let resistance = r.resistance;
        // Crossing into a tougher lower stratum must require its force, too.
        let y = h - loose[k];
        if (fill[k] > 0 && y > edgeY) for (let m = 0; m < M; m++) if (fillMix[k * M + m] > 0.01) resistance = Math.max(resistance, P[m].resistance ?? 30);
        y -= fill[k];
        for (let l = K - 1; l >= 0; l--) {
          if (nat[l][k] > 0 && y > edgeY) resistance = Math.max(resistance, P[layers[l]].resistance ?? 30);
          y -= nat[l][k];
        }
        if (edgeY < bed[k]) {
          hitRock = true;
          if (tool === 'breaker') resistance = Math.max(resistance, P[bedMat].resistance ?? 450);
        }
        peak = Math.max(peak, resistance);
        const efficiency = Math.min(1, force / Math.max(1, resistance)) * Math.min(1, attack);
        const bite = (physics.maxBiteDepth ?? 0.35) * Math.min(1, stroke / cell) * efficiency * (1 - r.cohesion * 0.3);
        const coverage = Math.max(0, Math.min(1, (half + cell * 0.5 - edgeDistance) / cell));
        const floor = tool === 'breaker' ? bedBase[k] - rockDepth : bed[k];
        const target = Math.max(floor, h - Math.min(h - edgeY, bite) * coverage);
        if (target < h - 1e-6) candidates.push({ k, h, target });
      });
      if (!candidates.length) return empty(hitRock ? 'rock' : null, peak);
      const measure = (scale, volume) => candidates.reduce((sum, c) => {
        const y = c.h - (c.h - c.target) * scale;
        const rock = Math.max(0, bed[c.k] - y) * area;
        return sum + (volume ? looseAbove(c.k, Math.max(y, bed[c.k])) + rock * swell[bedMat]
          : tonnesAbove(c.k, Math.max(y, bed[c.k])) + rock * bankDensity[bedMat]);
      }, 0);
      let scale = 1;
      if (measure(1, true) > maxVolume || measure(1, false) > maxTonnes) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 28; i++) {
          const mid = (lo + hi) / 2;
          if (measure(mid, true) > maxVolume || measure(mid, false) > maxTonnes) hi = mid; else lo = mid;
        }
        scale = lo;
      }
      const out = new Float64Array(M);
      for (const c of candidates) {
        const y = c.h - (c.h - c.target) * scale;
        removeTop(c.k, Math.max(0, c.h - Math.max(y, bed[c.k])), out);
        if (y < bed[c.k] && tool === 'breaker') {
          out[bedMat] += (bed[c.k] - y) * area * bankDensity[bedMat];
          bed[c.k] = y;
        }
        compaction[c.k] = 0;
        disturbed[c.k] = 1;
        changed(c.k);
        activateAround(c.k);
      }
      return { tonnes: toRecord(out), total: out.reduce((a, b) => a + b, 0), volume: out.reduce((a, t, m) => a + t / looseDensity[m], 0), resistance: peak, blocked: null };
    },

    // Wheel/track passes firm the surface and push shallow rut spoil into the shoulders.
    // Firmness changes handling; it never silently changes the density of carried tonnes.
    // On grass, each pass wears the turf: a light vehicle on dry ground hardly marks it, heavy
    // ones, wet ground and spinning or sliding tyres tear it, and once torn through it's bare
    // soil (and only then does it rut). Given `fromX`/`fromZ`, one tyre's path from there to
    // (x, z) is marked as one pass (`weight` then is the load on that tyre, tonnes); without,
    // a patch around (x, z) as `distance` metres of travel.
    applyTraffic({ x, z, fromX = null, fromZ = null, heading = 0, width = 1.8, weight = 5, distance = 0.5, slip = 0, moisture = groundMoisture }) {
      if (![x, z, heading, width, weight, distance].every(Number.isFinite) || distance <= 0 || width <= 0) return { moved: 0, compaction: 0 };
      const swept = Number.isFinite(fromX) && Number.isFinite(fromZ);
      const out = new Float64Array(M);
      const ux = Math.cos(heading), uz = Math.sin(heading);
      const shoulder = width / 2 + cell;
      const left = cellAt(x - uz * shoulder, z + ux * shoulder);
      const right = cellAt(x + uz * shoulder, z - ux * shoulder);
      const destinations = [...new Set([left, right])].filter(k => !fixed[k] && !(disturbed[k] & 2));
      const wet = Math.max(0, Math.min(1, moisture));
      const tear = Math.max(0, Math.min(1, slip));
      // (one pass over a cell counts as half a metre of travel)
      const travel = swept ? 0.5 : distance;
      const pressure = Math.min(2, Math.max(0, weight) / Math.max(1, width * width));
      const tyrePressure = Math.min(3, Math.max(0.3, Math.max(0, weight) / Math.max(0.2, width) / 1.4));
      const turfWear = (physics.turfWearPerPass ?? 0.035) * tyrePressure * (1 + wet * (physics.turfWetWear ?? 3))
        + tear * (physics.turfSlipWear ?? 0.6) * (0.5 + wet);
      let firm = 0;
      const pass = (k) => {
        if (fixed[k] || (disturbed[k] & 2) || destinations.includes(k)) return;
        const r = response(k, moisture);
        const was = { wear: wear[k], firm: compaction[k], disturbed: disturbed[k] };
        let cut = false;
        compaction[k] = Math.min(1, compaction[k] + travel * pressure * (physics.trafficCompactionRate ?? 0.12));
        firm = Math.max(firm, compaction[k]);
        let ruts = 1;
        if (!disturbed[k]) {
          wear[k] = Math.min(1, wear[k] + turfWear * (travel / 0.5));
          if (wear[k] >= 1) disturbed[k] = 1; // (torn through: bare soil)
          ruts = Math.max(0, (wear[k] - 0.6) / 0.4); // (turf holds the ground together until it's torn)
        }
        if (destinations.length && ruts > 0) {
          const softness = r.loose ? 1 : Math.min(0.8, moisture * 30 / Math.max(1, r.resistance));
          const depth = ruts * Math.min(physics.maximumRutDepth ?? 0.025, travel * pressure * (physics.rutDepthPerMetre ?? 0.012) * softness * (1 + tear) * (1 - compaction[k] * 0.8));
          if (depth > 1e-5) {
            removeTop(k, depth, out);
            cut = true;
          }
        }
        // (redraw only when it would look different: a wheel over grass changes it a little at
        // a time, and redrawing the ground for every pass of every tyre is a lot of work)
        const shows = cut || disturbed[k] !== was.disturbed || Math.floor(wear[k] * 12) !== Math.floor(was.wear * 12)
          || Math.floor(compaction[k] * 10) !== Math.floor(was.firm * 10);
        if (shows) changed(k);
        else touch(k);
        if (cut || disturbed[k] !== was.disturbed) activateAround(k);
      };
      if (swept) cellsAlong(fromX, fromZ, x, z, width / 2, pass);
      else cellsInRadius(x, z, width / 2, pass);
      const moved = out.reduce((a, b) => a + b, 0);
      for (const k of destinations) {
        addLoose(k, Array.from(out, (t, m) => t / looseDensity[m] / destinations.length));
        // (a skim pushed aside stays under the grass; only a real berm bares the ground)
        if (moved > 0) { if (loose[k] > 0.02) disturbed[k] = 1; changed(k); activateAround(k); }
      }
      return { moved, compaction: firm };
    },

    // Carve a bowl (radius r, lowest point `bottomY`) out of the ground. If it would take more
    // than `maxTonnes` (or more than `maxVolume` m³ once loose), the bowl is made shallower
    // until it fits. Bedrock can't be dug.
    // Returns { tonnes: { material: t }, total, volume } (volume: loose m³).
    dig({ x, z, radius, bottomY, maxTonnes = Infinity, maxVolume = Infinity }) {
      const cells = [];
      cellsInRadius(x, z, radius, (k, d) => { if (!fixed[k]) cells.push([k, d]); });
      if (!cells.length) return { tonnes: {}, total: 0, volume: 0 };
      const cutAt = (b, d) => b + (d / radius) ** 2 * radius * 0.7;
      const sumFor = (b, fn) => cells.reduce((s, [k, d]) => s + fn(k, Math.max(cutAt(b, d), bed[k])), 0);
      const tooMuch = (b) => sumFor(b, tonnesAbove) > maxTonnes || (maxVolume < Infinity && sumFor(b, looseAbove) > maxVolume);
      let b = bottomY;
      if (tooMuch(b)) {
        let lo = bottomY;
        let hi = Math.max(...cells.map(([k]) => height(k)));
        for (let it = 0; it < 22; it++) {
          const mid = (lo + hi) / 2;
          if (tooMuch(mid)) lo = mid;
          else hi = mid;
        }
        b = hi;
      }
      const out = new Float64Array(M);
      for (const [k, d] of cells) {
        const cut = Math.max(cutAt(b, d), bed[k]);
        const dh = height(k) - cut;
        if (dh > 1e-5) {
          removeTop(k, dh, out);
          compaction[k] = 0;
          disturbed[k] = 1;
          changed(k);
          activateAround(k);
        }
      }
      const tonnes = toRecord(out);
      return { tonnes, total: out.reduce((a, c) => a + c, 0), volume: out.reduce((a, t, m) => a + t / looseDensity[m], 0) };
    },

    // Earthworks: plan a graded strip (see works() above) or build it. spec: { ax, az, bx, bz,
    // width, mode: 'road' | 'ramp' | 'level', surface, surfaceThickness, maxGrade, sourceRadius }.
    planWorks: (spec) => works(spec, false),
    buildWorks: (spec) => works(spec, true),

    // Loose volume (m³) of some dug material ({ material: tonnes }).
    looseVolume(tonnes) {
      let v = 0;
      for (const [m, t] of Object.entries(tonnes)) if (m in mi && t > 0) v += t / looseDensity[mi[m]];
      return v;
    },

    // Drop loose material ({ material: tonnes }) as a mound around (x, z). Returns the tonnes
    // placed (0 if the spot is off the plot).
    deposit({ x, z, tonnes, radius = 0.6 }) {
      const vols = new Float64Array(M);
      let total = 0;
      let placed = 0;
      for (const [m, t] of Object.entries(tonnes)) {
        if (!(m in mi) || !(t > 0)) continue;
        vols[mi[m]] += t / looseDensity[mi[m]];
        total += t / looseDensity[mi[m]];
        placed += t;
      }
      if (total <= 0) return 0;
      const cells = [];
      let wsum = 0;
      cellsInRadius(x, z, radius, (k, d) => {
        if (fixed[k]) return;
        const w = Math.max(0.05, 1 - d / Math.max(radius, cell));
        cells.push([k, w]);
        wsum += w;
      });
      if (!cells.length) return 0;
      for (const [k, w] of cells) {
        const share = w / wsum;
        addLoose(k, Array.from(vols, (v) => v * share));
        disturbed[k] = 1;
        changed(k);
        activateAround(k);
      }
      return placed;
    },

    // Let loose material slump and undercut walls cave in. Does at most `budget` cells.
    settle(budget = 3000) {
      let n = 0;
      const next = [];
      while (queue.length && n < budget) {
        const k = queue.pop();
        active[k] = 0;
        n += 1;
        if (fixed[k]) continue;
        const i = k % nx;
        const j = (k - i) / nx;
        let h = height(k);
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const a = i + di;
            const b = j + dj;
            if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
            const o = idx(a, b);
            if (fixed[o]) continue; // nothing slides onto the edge ring
            const dist = di && dj ? cell * Math.SQRT2 : cell;
            const dh = h - height(o);
            if (dh <= 0) continue;
            if (loose[k] > 1e-5 && !(disturbed[k] & 2)) { // (a built surface doesn't slump)
              const r = response(k);
              const excess = dh - reposeOf(k) * dist - r.cohesion * cell * 0.08;
              if (excess > 1e-3) {
                const flow = (0.08 + r.flow * 0.28) * (1 - compaction[k] * (physics.firmSlumpReduction ?? 0.75));
                const move = Math.min(loose[k], excess * flow);
                const vols = new Float64Array(M);
                for (let m = 0; m < M; m++) vols[m] = move * area * mix[k * M + m];
                loose[k] -= move;
                if (loose[k] < 1e-6) {
                  loose[k] = 0;
                  mix.fill(0, k * M, k * M + M);
                }
                addLoose(o, vols);
                disturbed[o] = 1;
                changed(k);
                changed(o);
                next.push(k, o);
                h = height(k);
              }
            } else {
              // A natural wall steeper than the material can stand: the lip breaks away.
              const l = topNatural(k);
              if (disturbed[k] & 2) continue; // engineered compacted core stays firm
              if (l < 0 && fill[k] < 1e-5) continue;
              const mat = fill[k] > 1e-5 ? topMaterial(k) : layers[l];
              const cohesion = P[mat].cohesion ?? 0;
              const excess = dh - tanStanding[mat] * (1 - groundMoisture * cohesion * 0.12) * dist;
              if (excess > 1e-3) {
                const out = new Float64Array(M);
                const release = fill[k] > 1e-5 ? fill[k] : nat[l][k] + 1e-3;
                removeTop(k, Math.min(excess * (0.5 - cohesion * 0.25), release), out);
                const vols = Array.from(out, (t, m) => t / looseDensity[m]);
                addLoose(k, vols);
                disturbed[k] = 1;
                changed(k);
                next.push(k);
                h = height(k);
              }
            }
          }
        }
      }
      for (const k of next) activateAround(k);
      return n;
    },
    busy: () => queue.length > 0,

    // Chunks whose shape changed since last asked (for the 3D view to rebuild).
    takeDirtyChunks() {
      const list = [...dirty];
      dirty.clear();
      return list;
    },
    // Cell range [i0, i1) x [j0, j1) of a chunk.
    chunkRange(c) {
      const ci = c % cnx;
      const cj = (c - ci) / cnx;
      return { i0: ci * CC, j0: cj * CC, i1: Math.min(nx, (ci + 1) * CC), j1: Math.min(nz, (cj + 1) * CC) };
    },

    // Total tonnes of each material above bedrock (for tests and survey tools).
    totals() {
      const out = new Float64Array(M);
      for (let k = 0; k < N; k++) {
        if (rockDepth > 0) out[bedMat] += Math.max(0, bed[k] - bedBase[k] + rockDepth) * area * bankDensity[bedMat];
        for (let m = 0; m < M; m++) out[m] += loose[k] * area * mix[k * M + m] * looseDensity[m];
        for (let m = 0; m < M; m++) out[m] += fill[k] * area * fillMix[k * M + m] * bankDensity[m];
        for (let l = 0; l < K; l++) out[layers[l]] += nat[l][k] * area * bankDensity[layers[l]];
      }
      return toRecord(out);
    },

    // Format 4 XORs natural/bedrock Float32 bits against the saved seeded baseline.
    // Unchanged strata become zero runs; formats 1..3 remain readable.
    serialize() {
      const chunks = {};
      const saveChunks = new Set(touched);
      for (const k of queue) saveChunks.add(chunkOf(k % nx, Math.floor(k / nx)));
      for (const c of saveChunks) {
        const { i0, j0, i1, j1 } = this.chunkRange(c);
        const cells = [];
        let local = 0;
        for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++, local++) {
          const k = idx(i, j);
          if (disturbed[k] || wear[k] || active[k] || loose[k] || compaction[k] || fill[k] || bed[k] !== bedBase[k]
            || nat.some((layer, l) => layer[k] !== geology[l][k])) cells.push(local);
        }
        const count = cells.length;
        if (!count) continue;
        const heights = new Float32Array(count * (K + 4));
        const heightBits = new Uint32Array(heights.buffer);
        const mixes = new Float32Array(count * M * 2);
        const flags = new Uint8Array(count);
        const worn = new Uint8Array(count);
        for (let n = 0; n < count; n++) {
          const i = i0 + cells[n] % (i1 - i0), j = j0 + Math.floor(cells[n] / (i1 - i0));
          const k = idx(i, j);
          for (let l = 0; l < K; l++) heights[n * (K + 4) + l] = nat[l][k];
          heights[n * (K + 4) + K] = loose[k];
          heights[n * (K + 4) + K + 1] = bed[k];
          heights[n * (K + 4) + K + 2] = compaction[k];
          heights[n * (K + 4) + K + 3] = fill[k];
          for (let l = 0; l < K; l++) heightBits[n * (K + 4) + l] ^= geologyBits[l][k];
          heightBits[n * (K + 4) + K + 1] ^= bedBaseBits[k];
          for (let m = 0; m < M; m++) {
            mixes[n * M * 2 + m] = mix[k * M + m];
            mixes[n * M * 2 + M + m] = fillMix[k * M + m];
          }
          flags[n] = disturbed[k] | (active[k] ? 128 : 0);
          worn[n] = Math.round(wear[k] * 255);
        }
        chunks[c] = {
          count, cells: packFloats(Uint32Array.from(cells), 1),
          heights: packFloats(heights, K + 4), mix: packFloats(mixes, M * 2), flags: packBytes(flags),
          // (turf wear: added after format 4 was first written; older saves have none)
          ...(worn.some(Boolean) ? { wear: packBytes(worn) } : {}),
        };
      }
      return { format: 4, plotId, seed, x0, z0, cellSize: cell, chunkCells: CC, nx, nz, materialIds: mats, layerIds: layers.map(m => mats[m]), baseline: structuredClone(baseline), moisture: groundMoisture, chunks };
    },
    load(saved) {
      if (!saved?.chunks) return;
      const xorBaseline = saved.format === 4;
      const sparse = saved.format === 3 || xorBaseline;
      const modern = saved.format === 2 || sparse;
      if (saved.format != null && saved.format !== 1 && !modern) throw new Error('Unsupported saved terrain format');
      if (modern && (saved.cellSize !== cell || saved.chunkCells !== CC || saved.nx !== nx || saved.nz !== nz)) throw new Error('Ground grid changed; this save needs a terrain migration');
      const oldMats = modern ? saved.materialIds : ['topsoil', 'clay', 'sand', 'gravel', 'rock'];
      const oldLayers = modern ? saved.layerIds : ['gravel', 'sand', 'clay', 'topsoil'];
      const oldM = oldMats.length, oldK = oldLayers.length;
      if (oldK !== K || oldMats.some(m => !(m in mi)) || oldLayers.some(m => !layers.includes(mi[m]))) throw new Error('Ground materials changed; this save needs a terrain migration');
      const layerMap = layers.map(m => oldLayers.indexOf(mats[m]));
      if (xorBaseline) {
        const spec = saved.baseline;
        if (spec?.version !== 1 || ![spec.seed, spec.x0, spec.z0, spec.surfaceRoll].every(Number.isFinite)
          || spec.strata?.length !== K || spec.strata.some(s => !oldLayers.includes(s.material)
            || s.thickness?.length !== 2 || !s.thickness.every(Number.isFinite))) throw new Error('Invalid saved terrain baseline');
        const baseLayers = spec.strata.map(() => new Float32Array(N));
        generate(bedBase, baseLayers, spec);
        for (let l = 0; l < K; l++) {
          const source = spec.strata.findIndex(s => s.material === mats[layers[l]]);
          if (source < 0) throw new Error('Invalid saved terrain baseline');
          geology[l].set(baseLayers[source]);
        }
        baseline = structuredClone(spec);
      } else {
        generate(bedBase, geology, initialBaseline);
        baseline = initialBaseline;
      }
      groundMoisture = saved.moisture ?? 0;
      queue = [];
      active.fill(0);
      for (const c of touched) dirty.add(c);
      touched.clear();
      bed.set(bedBase);
      nat.forEach((layer, l) => layer.set(geology[l]));
      loose.fill(0); compaction.fill(0); fill.fill(0); mix.fill(0); fillMix.fill(0); disturbed.fill(0); wear.fill(0);
      for (const [cs, packed] of Object.entries(saved.chunks)) {
        const c = Number(cs);
        if (!Number.isInteger(c) || c < 0 || c >= cnx * cnz) throw new Error('Invalid saved terrain chunk');
        const { i0, j0, i1, j1 } = this.chunkRange(c);
        const fullCount = (i1 - i0) * (j1 - j0), count = sparse ? packed.count : fullCount;
        if (!Number.isInteger(count) || count < 0 || count > fullCount) throw new Error('Invalid saved terrain data');
        let heights, mixes, flags, cells;
        if (sparse) {
          cells = new Uint32Array((xorBaseline ? unpackFloats(packed.cells, count, 1) : unpackBytes(packed.cells, count * 4)).buffer);
          heights = unpackFloats(packed.heights, count, oldK + 4);
          mixes = unpackFloats(packed.mix, count, oldM * 2);
          flags = unpackBytes(packed.flags, count);
          for (let n = 0; n < count; n++) if (cells[n] >= fullCount || (n && cells[n] <= cells[n - 1])) throw new Error('Invalid saved terrain cell');
        } else if (modern) {
          heights = new Float32Array(fromBase64(packed.heights).buffer);
          mixes = new Float32Array(fromBase64(packed.mix).buffer);
          flags = fromBase64(packed.flags);
        } else {
          const [a, b] = packed.split('|');
          heights = new Uint16Array(fromBase64(a).buffer);
          mixes = fromBase64(b);
        }
        if (heights.length !== count * (oldK + (modern ? 4 : 1)) || mixes.length !== count * (modern ? oldM * 2 : oldM + 1) || (modern && flags.length !== count)) throw new Error('Invalid saved terrain data');
        const heightBits = xorBaseline ? new Uint32Array(heights.buffer) : null;
        const worn = sparse && packed.wear ? unpackBytes(packed.wear, count) : null;
        if (worn && worn.length !== count) throw new Error('Invalid saved terrain data');
        for (let n = 0; n < count; n++) {
          const local = sparse ? cells[n] : n;
          const i = i0 + local % (i1 - i0), j = j0 + Math.floor(local / (i1 - i0));
          const k = idx(i, j);
          if (xorBaseline) {
            for (let l = 0; l < K; l++) heightBits[n * (oldK + 4) + layerMap[l]] ^= geologyBits[l][k];
            heightBits[n * (oldK + 4) + oldK + 1] ^= bedBaseBits[k];
          }
          for (let l = 0; l < K; l++) if (layerMap[l] >= 0) nat[l][k] = heights[n * (oldK + (modern ? 4 : 1)) + layerMap[l]] / (modern ? 1 : 1000);
          loose[k] = heights[n * (oldK + (modern ? 4 : 1)) + oldK] / (modern ? 1 : 1000);
          if (modern) {
            bed[k] = heights[n * (oldK + 4) + oldK + 1];
            compaction[k] = heights[n * (oldK + 4) + oldK + 2];
            fill[k] = heights[n * (oldK + 4) + oldK + 3];
          }
          let sum = 0;
          mix.fill(0, k * M, k * M + M);
          for (let m = 0; m < oldM; m++) sum += (mix[k * M + mi[oldMats[m]]] = mixes[n * (modern ? oldM * 2 : oldM + 1) + m] / (modern ? 1 : 255));
          if (modern) for (let m = 0; m < oldM; m++) fillMix[k * M + mi[oldMats[m]]] = mixes[n * oldM * 2 + oldM + m];
          if (!modern && sum > 0) for (let m = 0; m < M; m++) mix[k * M + m] /= sum;
          const flag = modern ? flags[n] : mixes[n * (oldM + 1) + oldM];
          disturbed[k] = flag & 127;
          if (worn) wear[k] = worn[n] / 255;
          if (modern && (flag & 128)) activate(k);
          else if (!modern && disturbed[k]) activateAround(k);
        }
        touched.add(c);
        dirty.add(c);
      }
    },
  };
  return api;
}

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

// ---------------------------------------------------------------- the ground

export function createGround(groundData, plotId, opts = {}) {
  const plot = groundData.plots[plotId];
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
  const mix = new Float32Array(N * M); // loose material: volume share of each material
  const disturbed = new Uint8Array(N); // dug, dumped on or scraped (no more grass)
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
  function generate() {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const x = x0 + (i + 0.5) * cell;
        const z = z0 + (j + 0.5) * cell;
        const top = (fbm(x / 55, z / 55, seed) - 0.5) * 2 * plot.surfaceRoll;
        let sum = 0;
        plot.strata.forEach((s, l) => {
          const t = s.thickness[0] + (s.thickness[1] - s.thickness[0]) * fbm(x / 38 + l * 17.1, z / 38 - l * 9.3, seed + 10 + l * 3);
          nat[l][k] = t;
          sum += t;
        });
        bed[k] = top - sum;
      }
    }
  }
  generate();

  // ---- helpers
  const idx = (i, j) => j * nx + i;
  const height = (k) => {
    let h = bed[k] + loose[k];
    for (let l = 0; l < K; l++) h += nat[l][k];
    return h;
  };
  const chunkOf = (i, j) => Math.floor(j / CC) * cnx + Math.floor(i / CC);
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
    for (let l = K - 1; l >= 0 && top > y; l--) {
      const take = Math.min(nat[l][k], top - y);
      v += take * area * swell[layers[l]];
      top -= nat[l][k];
    }
    return v;
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

  const toRecord = (arr) => {
    const out = {};
    arr.forEach((t, m) => { if (t > 1e-6) out[mats[m]] = t; });
    return out;
  };

  // ---------------------------------------------------------------- API
  return {
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
    cellSurface: (i, j) => topMaterial(idx(i, j)),
    cellDisturbed: (i, j) => disturbed[idx(i, j)] === 1,
    cellLoose: (i, j) => loose[idx(i, j)],

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
          disturbed[k] = 1;
          changed(k);
          activateAround(k);
        }
      }
      const tonnes = toRecord(out);
      return { tonnes, total: out.reduce((a, c) => a + c, 0), volume: out.reduce((a, t, m) => a + t / looseDensity[m], 0) };
    },

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
            if (loose[k] > 1e-5) {
              const excess = dh - reposeOf(k) * dist;
              if (excess > 1e-3) {
                const move = Math.min(loose[k], excess * 0.3);
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
              if (l < 0) continue;
              const excess = dh - tanStanding[layers[l]] * dist;
              if (excess > 1e-3) {
                const out = new Float64Array(M);
                removeTop(k, Math.min(excess * 0.5, nat[l][k] + 1e-3), out);
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
        for (let m = 0; m < M; m++) out[m] += loose[k] * area * mix[k * M + m] * looseDensity[m];
        for (let l = 0; l < K; l++) out[layers[l]] += nat[l][k] * area * bankDensity[layers[l]];
      }
      return toRecord(out);
    },

    // ---- saves: only the chunks that changed, packed small (mm and 1/255 steps)
    serialize() {
      const chunks = {};
      for (const c of touched) {
        const { i0, j0, i1, j1 } = this.chunkRange(c);
        const cells = (i1 - i0) * (j1 - j0);
        const u16 = new Uint16Array(cells * (K + 1));
        const u8 = new Uint8Array(cells * (M + 1));
        let n = 0;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++, n++) {
            const k = idx(i, j);
            for (let l = 0; l < K; l++) u16[n * (K + 1) + l] = Math.min(65535, Math.round(nat[l][k] * 1000));
            u16[n * (K + 1) + K] = Math.min(65535, Math.round(loose[k] * 1000));
            for (let m = 0; m < M; m++) u8[n * (M + 1) + m] = Math.round(mix[k * M + m] * 255);
            u8[n * (M + 1) + M] = disturbed[k];
          }
        }
        chunks[c] = toBase64(new Uint8Array(u16.buffer)) + '|' + toBase64(u8);
      }
      return { plotId, seed, x0, z0, chunks };
    },
    load(saved) {
      if (!saved?.chunks) return;
      for (const [cs, packed] of Object.entries(saved.chunks)) {
        const c = Number(cs);
        const [a, b] = packed.split('|');
        const u16 = new Uint16Array(fromBase64(a).buffer);
        const u8 = fromBase64(b);
        const { i0, j0, i1, j1 } = this.chunkRange(c);
        let n = 0;
        for (let j = j0; j < j1; j++) {
          for (let i = i0; i < i1; i++, n++) {
            const k = idx(i, j);
            for (let l = 0; l < K; l++) nat[l][k] = u16[n * (K + 1) + l] / 1000;
            loose[k] = u16[n * (K + 1) + K] / 1000;
            let s = 0;
            for (let m = 0; m < M; m++) s += (mix[k * M + m] = u8[n * (M + 1) + m] / 255);
            if (s > 0) for (let m = 0; m < M; m++) mix[k * M + m] /= s;
            disturbed[k] = u8[n * (M + 1) + M];
          }
        }
        touched.add(c);
        dirty.add(c);
      }
    },
  };
}

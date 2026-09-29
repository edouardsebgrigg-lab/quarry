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
  const disturbed = new Uint8Array(N); // bit 1: dug, dumped on or scraped (no more grass); bit 2: built on (graded and firm)
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
    for (let l = K - 1; l >= 0 && top > y; l--) {
      const take = Math.min(nat[l][k], top - y);
      if (take > 0) out[layers[l]] += take * area * bankDensity[layers[l]];
      top -= nat[l][k];
    }
  }

  function works(spec, commit) {
    const { ax, az, bx, bz, width, mode, sourceRadius = 30, surface = null, surfaceThickness = 0.12, maxGrade = 0.1 } = spec;
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
    const src = gatherLoose(centre, radius, { gravel: sm >= 0 ? { m: sm, vol: gravelFromHeaps } : null, bank: fillFromHeaps, exclude: inWorks }, commit);
    // What there will be to build with, and what's left over: the cut (less the surface's gravel)
    // plus the heaps' fill, of which the fill takes what it needs.
    const availPlan = pool.slice();
    if (sm >= 0) availPlan[sm] = Math.max(0, availPlan[sm] - gravelFromCut * looseDensity[sm]);
    for (let m = 0; m < M; m++) availPlan[m] += src.tonnes[m];
    const availBankPlan = availPlan.reduce((a, v, m) => a + v / bankDensity[m], 0);
    const usePlan = availBankPlan > 0 ? Math.min(1, fillBank / availBankPlan) : 0;
    const availTonnes = availPlan.reduce((a, v) => a + v, 0);
    const plan = {
      ok: true, mode, length: L, width, grade, pA, pB, cells: jobs.length, coreArea: core * area,
      cutBank, fillBank, surfaceLoose, cutTonnes: pool.reduce((a, v) => a + v, 0),
      heapGravelNeeded: gravelFromHeaps, heapFillNeeded: fillFromHeaps,
      heapGravelFound: src.gravelFound, heapFillFound: src.bankFound,
      surfaceTonnes: sm >= 0 ? surfaceLoose * looseDensity[sm] : 0,
      heapTonnes: src.gravelTonnes + src.tonnes.reduce((a, v) => a + v, 0),
      fillTonnes: availTonnes * usePlan,
      spoilTonnes: availTonnes * (1 - usePlan),
    };
    if (src.gravelFound < gravelFromHeaps - 1e-6) return { ...plan, ok: false, reason: 'gravel' };
    if (src.bankFound < fillFromHeaps - 1e-6) return { ...plan, ok: false, reason: 'fill' };
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
        for (let m = 0; m < M; m++) {
          const l = layers.indexOf(m);
          if (share[m] > 0 && l >= 0) nat[l][k] += job.fill * share[m];
        }
        // (material that isn't a natural layer, like rock, can't be compacted: it goes to the top layer)
        const stray = share.reduce((a, v, m) => a + (layers.indexOf(m) < 0 ? v : 0), 0);
        if (stray > 0) nat[K - 1][k] += job.fill * stray;
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
      const sx = centre.x - uz * (half + reach * 0.6);
      const sz = centre.z + ux * (half + reach * 0.6);
      plan.spoilAt = { x: sx, z: sz };
      plan.spoilTonnes = spoilTotal;
      api.deposit({ x: sx, z: sz, tonnes: toRecord(spoil), radius: 1.6 });
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
      if (loose[k] > 1e-4 && !(disturbed[k] & 2) && !need.exclude?.has(k)) list.push([k, d]);
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
    cellSurface: (i, j) => topMaterial(idx(i, j)),
    cellDisturbed: (i, j) => disturbed[idx(i, j)] !== 0,
    // A cell that has been built on (a graded road, ramp or level area).
    cellBuilt: (i, j) => (disturbed[idx(i, j)] & 2) === 2,
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
  return api;
}

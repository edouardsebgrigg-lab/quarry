// Where rainwater would stand on a patch of ground. For every cell: the level water must rise to
// before it can run off over the edge of the patch (its spill level), the lowest point of the
// hollow it lies in (the basin floor), and how high the water in that hollow rises when the
// rain is at its heaviest. Cells that drain freely have spill = floor = their own height.
// Spill levels by a priority flood: water fills inward from the edge, always from the lowest
// cell found so far (Barnes, Lehman and Mulla 2014, with their plain queue for cells inside a
// hollow). Each hollow then fills from its lowest point with the rain its own ground keeps, so
// a pit dug in a gentle dip fills before the dip around it does.
// Pure (no graphics): heights in, levels out.

// A small binary min-heap of cell indices keyed by level.
function heap(capacity) {
  const ids = new Int32Array(capacity);
  const keys = new Float32Array(capacity);
  let n = 0;
  return {
    get size() { return n; },
    push(id, key) {
      let i = n++;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= key) break;
        ids[i] = ids[p];
        keys[i] = keys[p];
        i = p;
      }
      ids[i] = id;
      keys[i] = key;
    },
    pop() {
      const top = ids[0];
      n -= 1;
      if (n > 0) {
        const id = ids[n];
        const key = keys[n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          if (l >= n) break;
          const m = l + 1 < n && keys[l + 1] < keys[l] ? l + 1 : l;
          if (keys[m] >= key) break;
          ids[i] = ids[m];
          keys[i] = keys[m];
          i = m;
        }
        ids[i] = id;
        keys[i] = key;
      }
      return top;
    },
  };
}

// `height(i, j)` for an nx × nz grid, or the heights themselves (row-major k = j * nx + i).
// Returns { spill, floor, rise } (Float32Array per cell, same order): `rise` is how far above
// its floor the water in a cell's hollow stands when `rain` metres have fallen and `holds` of it
// stayed (per cell like the heights, 0..1: whole turf soaks most rain up, dug ground keeps it;
// default all of it), never above the spill. A cell in no hollow has floor = spill = its height
// and rise 0.
export function findBasins(height, nx, nz, options) {
  const steps = basinSteps(height, nx, nz, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

// The same, a little at a time: a generator that yields every few thousand cells and returns
// { spill, floor, hold }, so the game can spread the work over frames. It works on its own copy
// of the heights and holds.
export function* basinSteps(height, nx, nz, { holds = null, rain = 1 } = {}) {
  const N = nx * nz;
  const grid = (src, fill) => {
    const out = new Float32Array(N);
    if (src === null) out.fill(fill);
    else if (typeof src === 'function') {
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out[j * nx + i] = src(i, j);
    } else out.set(src);
    return out;
  };
  const h = grid(height, 0);
  const keeps = grid(holds, 1);
  const STEP = 4096;
  const spill = new Float32Array(N);
  const done = new Uint8Array(N);
  const q = heap(N);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (i > 0 && j > 0 && i < nx - 1 && j < nz - 1) continue;
      const k = j * nx + i;
      spill[k] = h[k];
      done[k] = 1;
      q.push(k, h[k]);
    }
  }
  // (cells at or under the level being filled join a plain queue: no need to sort them)
  const pit = new Int32Array(N);
  let pitHead = 0;
  let pitTail = 0;
  const visit = (n, level) => {
    if (done[n]) return;
    done[n] = 1;
    if (h[n] <= level) {
      spill[n] = level;
      pit[pitTail++] = n;
    } else {
      spill[n] = h[n];
      q.push(n, h[n]);
    }
  };
  for (let n = 1; pitHead < pitTail || q.size; n++) {
    if (n % STEP === 0) yield;
    const k = pitHead < pitTail ? pit[pitHead++] : q.pop();
    const i = k % nx;
    const level = spill[k];
    if (i + 1 < nx) visit(k + 1, level);
    if (i > 0) visit(k - 1, level);
    if (k + nx < N) visit(k + nx, level);
    if (k >= nx) visit(k - nx, level);
  }
  // Each hollow (cells under their spill level, joined side by side at the same spill) and its
  // lowest point.
  const floor = new Float32Array(N);
  const rise = new Float32Array(N);
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  const members = new Int32Array(N);
  const depths = new Float32Array(N);
  const wet = (n) => spill[n] > h[n] + 1e-4;
  for (let k = 0; k < N; k++) {
    if (k % (STEP * 4) === 0) yield;
    floor[k] = h[k];
    if (seen[k] || !wet(k)) continue;
    let count = 0;
    let top = 0;
    let low = Infinity;
    stack[top++] = k;
    seen[k] = 1;
    const join = (n, c) => {
      if (seen[n] || !wet(n) || Math.abs(spill[n] - spill[c]) > 1e-4) return;
      seen[n] = 1;
      stack[top++] = n;
    };
    while (top) {
      const c = stack[--top];
      members[count++] = c;
      if (h[c] < low) low = h[c];
      const ci = c % nx;
      if (ci + 1 < nx) join(c + 1, c);
      if (ci > 0) join(c - 1, c);
      if (c + nx < N) join(c + nx, c);
      if (c >= nx) join(c - nx, c);
    }
    // (the water it keeps, in metres over one cell, poured in from the lowest cell up: with
    // the cells sorted, fill k of them to level L when k L - (their heights) = the water)
    let water = 0;
    for (let m = 0; m < count; m++) {
      const c = members[m];
      floor[c] = low;
      water += rain * keeps[c];
      depths[m] = h[c];
    }
    const sorted = depths.subarray(0, count).sort();
    let level = low;
    let sum = 0;
    for (let m = 0; m < count; m++) {
      sum += sorted[m];
      level = (water + sum) / (m + 1);
      if (m + 1 === count || level <= sorted[m + 1]) break;
    }
    const full = Math.min(spill[k], level) - low;
    for (let m = 0; m < count; m++) rise[members[m]] = full;
    yield;
  }
  return { spill, floor, rise };
}

// The water level over a cell, `share` (0..1) of the way to its heaviest-rain level, or null if
// it stands dry.
export function waterLevel(floor, rise, share) {
  const s = Math.max(0, Math.min(1, share));
  if (!(rise * s > 1e-4)) return null;
  return floor + rise * s;
}

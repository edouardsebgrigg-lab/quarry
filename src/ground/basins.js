// Where rainwater would stand on a patch of ground. For every cell: the level water must rise to
// before it can run off over the edge of the patch (its spill level), and the lowest point of
// the hollow it lies in (the basin floor). Cells that drain freely have spill = their own height.
// A priority flood: water fills inward from the edge, always from the lowest cell found so far.
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
      ids[i] = id;
      keys[i] = key;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[p] <= keys[i]) break;
        [ids[p], ids[i]] = [ids[i], ids[p]];
        [keys[p], keys[i]] = [keys[i], keys[p]];
        i = p;
      }
    },
    pop() {
      const top = ids[0];
      n -= 1;
      if (n > 0) {
        ids[0] = ids[n];
        keys[0] = keys[n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < n && keys[l] < keys[m]) m = l;
          if (r < n && keys[r] < keys[m]) m = r;
          if (m === i) break;
          [ids[m], ids[i]] = [ids[i], ids[m]];
          [keys[m], keys[i]] = [keys[i], keys[m]];
          i = m;
        }
      }
      return top;
    },
  };
}

// `height(i, j)` for an nx × nz grid. Returns { spill, floor } (Float32Array per cell, row-major
// k = j * nx + i); a cell in no hollow has floor = spill = its height.
export function findBasins(height, nx, nz) {
  const N = nx * nz;
  const h = new Float32Array(N);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = height(i, j);
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
  while (q.size) {
    const k = q.pop();
    const i = k % nx;
    const j = (k - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const n = b * nx + a;
      if (done[n]) continue;
      done[n] = 1;
      spill[n] = Math.max(h[n], spill[k]);
      q.push(n, spill[n]);
    }
  }
  // Each hollow (cells under their spill level, joined side by side at the same spill) and its
  // lowest point.
  const floor = new Float32Array(N);
  const seen = new Uint8Array(N);
  const stack = [];
  for (let k = 0; k < N; k++) {
    floor[k] = h[k];
    if (seen[k] || spill[k] <= h[k] + 1e-4) continue;
    const members = [];
    let low = Infinity;
    stack.push(k);
    seen[k] = 1;
    while (stack.length) {
      const c = stack.pop();
      members.push(c);
      low = Math.min(low, h[c]);
      const ci = c % nx, cj = (c - ci) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = ci + di, b = cj + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const n = b * nx + a;
        if (seen[n] || spill[n] <= h[n] + 1e-4 || Math.abs(spill[n] - spill[c]) > 1e-4) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    for (const c of members) floor[c] = low;
  }
  return { spill, floor };
}

// The water level over a cell when the hollows hold `depth` metres (at most up to the spill), or
// null if it stands dry.
export function waterLevel(spill, floor, depth) {
  if (!(spill > floor + 1e-4) || !(depth > 0)) return null;
  return Math.min(spill, floor + depth);
}

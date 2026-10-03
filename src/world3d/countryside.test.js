import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { terrainTiles } from './countryside.js';

// A small terrain grid built the way the countryside is: N × N vertices, two triangles per cell
// starting at its top-left vertex, with a hole cut out (the field).
function grid(N, step, hole) {
  const pos = new Float32Array(N * N * 3);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) pos.set([c * step, Math.sin(c + r), r * step], (r * N + c) * 3);
  const index = [];
  for (let r = 0; r < N - 1; r++) {
    for (let c = 0; c < N - 1; c++) {
      if (hole(c, r)) continue;
      const a = r * N + c;
      index.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(index);
  return g;
}

describe('the countryside drawn in tiles', () => {
  it('keeps every triangle once, in tiles that share the vertices and know their own bounds', () => {
    const N = 41;
    const g = grid(N, 4, (c, r) => c >= 10 && c < 20 && r >= 10 && r < 20);
    const tiles = terrainTiles(g, N, 8);
    expect(tiles.length).toBe(25); // (40 cells a side in 8s)
    const all = [];
    for (const t of tiles) {
      expect(t.attributes.position).toBe(g.attributes.position);
      const ix = Array.from(t.index.array);
      all.push(...ix);
      const p = new THREE.Vector3();
      for (const i of ix) {
        p.fromBufferAttribute(g.attributes.position, i);
        expect(t.boundingBox.containsPoint(p)).toBe(true);
        expect(t.boundingSphere.containsPoint(p)).toBe(true);
      }
      // (a tile spans its own 8 × 8 cells: 32 m, not the whole map)
      expect(t.boundingBox.max.x - t.boundingBox.min.x).toBeLessThanOrEqual(32);
    }
    const tri = (arr) => {
      const out = [];
      for (let k = 0; k < arr.length; k += 3) out.push(arr.slice(k, k + 3).join(','));
      return out.sort();
    };
    expect(tri(all)).toEqual(tri(Array.from(g.index.array)));
  });
});

import { describe, it, expect } from 'vitest';
import { gardenWall } from './places.js';
import { planWorld } from './countryside.js';

const SIZE = { cottage: [8.4, 6.0], semi: [9.6, 7.2], bungalow: [12.0, 7.6] };

describe('front-garden walls in Ashby', () => {
  it('runs along the front just back from the verge, with a gap for the path and returns to the house', () => {
    // A cottage facing +z (towards a road 15 m away, 3.2 m half width).
    const runs = gardenWall({ x: 0, z: 0, yaw: 0 }, [8.4, 6], 15, 3.2);
    expect(runs).toHaveLength(4);
    const [left, right, retL, retR] = runs;
    for (const r of [left, right]) {
      expect(r.z0).toBeCloseTo(15 - 3.2 - 1.6);
      expect(r.z1).toBeCloseTo(15 - 3.2 - 1.6);
    }
    expect(left.x1).toBeCloseTo(-0.6); // (the path)
    expect(right.x0).toBeCloseTo(0.6);
    expect(left.x0).toBeCloseTo(-(4.2 + 1.5));
    expect(retL.z0).toBeCloseTo(3.1); // (from the house front to the wall)
    expect(retR.x0).toBeCloseTo(4.2 + 1.5);
  });

  it('none where the garden would be too shallow', () => {
    expect(gardenWall({ x: 0, z: 0, yaw: 0 }, [8.4, 6], 8, 3.2)).toEqual([]);
  });

  it('every wall in the village stays off the roads and out of the houses', () => {
    const plan = planWorld();
    let runs = 0;
    for (const h of plan.houses) {
      const road = plan.byId[h.road ?? 'millLane'];
      const near = plan.nearestOnRoad(road, h.x, h.z);
      for (const w of gardenWall(h, SIZE[h.style], near.dist, road.hw)) {
        runs++;
        for (let t = 0; t <= 1; t += 0.25) {
          const x = w.x0 + (w.x1 - w.x0) * t;
          const z = w.z0 + (w.z1 - w.z0) * t;
          // (behind its own road's verge; off any other road, e.g. across from a junction)
          for (const r of plan.roads) expect(plan.nearestOnRoad(r, x, z).dist).toBeGreaterThan(r.hw + (r === road ? 1.5 : 0.5));
          for (const o of plan.houses) {
            // (in each house's own space, outside its footprint)
            const dx = x - o.x;
            const dz = z - o.z;
            const u = Math.cos(o.yaw) * dx - Math.sin(o.yaw) * dz;
            const v = Math.sin(o.yaw) * dx + Math.cos(o.yaw) * dz;
            const [L, W] = SIZE[o.style];
            expect(Math.abs(u) < L / 2 && Math.abs(v) < W / 2).toBe(false);
          }
        }
      }
    }
    expect(runs).toBeGreaterThan(30);
  });
});

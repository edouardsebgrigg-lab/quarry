import { describe, it, expect } from 'vitest';
import { MAP, inRect } from './map.js';
import { planWorld } from './countryside.js';
import { farmRect } from './farms.js';

describe('farmsteads', () => {
  it('stand clear of the roads, your land, the village, the depot and the dealer, inside the map', () => {
    const plan = planWorld(MAP);
    expect(plan.farms.length).toBeGreaterThan(0);
    const others = [
      MAP.home.boundary, MAP.depot.yard, MAP.dealer.yard,
      ...[...plan.houses, plan.pub].map((h) => ({ x0: h.x - 8, x1: h.x + 8, z0: h.z - 8, z1: h.z + 8 })),
    ];
    for (const f of plan.farms) {
      const r = farmRect(f);
      expect(r.x0, f.name).toBeGreaterThan(-MAP.half + 60);
      expect(r.x1, f.name).toBeLessThan(MAP.half - 60);
      expect(r.z0, f.name).toBeGreaterThan(-MAP.half + 60);
      expect(r.z1, f.name).toBeLessThan(MAP.half - 60);
      for (const road of plan.roads) {
        const near = plan.nearestOnRoad(road, f.x, f.z);
        expect(near.dist, `${f.name} to ${road.name}`).toBeGreaterThan((r.x1 - r.x0) / 2 + road.hw + 15);
      }
      for (const o of others) {
        const overlap = r.x0 < o.x1 + 40 && r.x1 > o.x0 - 40 && r.z0 < o.z1 + 40 && r.z1 > o.z0 - 40;
        expect(overlap, `${f.name} too close to something`).toBe(false);
      }
      for (const g of plan.farms) if (g !== f) expect(inRect(farmRect(g, 60), f.x, f.z), `${f.name} next to ${g.name}`).toBe(false);
    }
  });
});

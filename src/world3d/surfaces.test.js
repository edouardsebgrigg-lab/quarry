import { describe, it, expect } from 'vitest';
import { surfaceGrip, blendedGrip } from './surfaces.js';

describe('grip under a tyre', () => {
  it('ranks the surfaces the way tyres feel them: tarmac, rock, dirt and gravel, then grass', () => {
    const g = (k) => surfaceGrip(k).grip;
    expect(g('asphalt')).toBeGreaterThan(g('rock'));
    expect(g('rock')).toBeGreaterThan(g('dirt'));
    expect(g('gravel')).toBeGreaterThan(g('grass'));
  });

  it('rain hurts grass and dirt far more than gravel, and soft ground drags', () => {
    const drop = (k) => surfaceGrip(k, 1).grip / surfaceGrip(k).grip;
    expect(drop('grass')).toBeLessThan(0.7);
    expect(drop('dirt')).toBeLessThan(0.7);
    expect(drop('gravel')).toBeGreaterThan(0.85);
    expect(surfaceGrip('asphalt', 1).grip).toBeLessThan(surfaceGrip('asphalt').grip);
    expect(surfaceGrip('dirt', 1).roll).toBeGreaterThan(surfaceGrip('dirt').roll * 1.5);
    // (half wet is half way)
    expect(surfaceGrip('grass', 0.5).grip).toBeCloseTo((surfaceGrip('grass').grip + surfaceGrip('grass', 1).grip) / 2);
  });

  it('blends a mixed patch by share and names it after the biggest', () => {
    const b = blendedGrip({ grass: 0.25, gravel: 0.75 });
    expect(b.name).toBe('gravel');
    expect(b.grip).toBeCloseTo(0.25 * surfaceGrip('grass').grip + 0.75 * surfaceGrip('gravel').grip);
    expect(blendedGrip({}).name).toBe('dirt');
  });
});

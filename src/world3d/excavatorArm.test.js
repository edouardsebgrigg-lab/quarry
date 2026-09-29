import { describe, it, expect } from 'vitest';
import { ARM, armPoints, solveArm, createJoints } from './excavatorArm.js';

describe('excavator arm', () => {
  it('puts the bucket teeth on reachable targets', () => {
    for (const [x, y, phi] of [[5.5, -1.05, -1.2], [4.5, -0.6, -2.0], [5.8, 1.5, -0.2], [3.5, 0.5, -2.4]]) {
      const angles = solveArm(x, y, phi);
      const { teeth } = armPoints(angles);
      expect(teeth.x).toBeCloseTo(x, 2);
      expect(teeth.y).toBeCloseTo(y, 2);
    }
  });

  it('keeps joints inside their limits and stretches toward far targets', () => {
    const angles = solveArm(40, -20, -1);
    angles.forEach((a, i) => {
      expect(a).toBeGreaterThanOrEqual(ARM.limits[i][0] - 1e-9);
      expect(a).toBeLessThanOrEqual(ARM.limits[i][1] + 1e-9);
    });
    const { bucketPin } = armPoints(angles);
    expect(Math.hypot(bucketPin.x - ARM.pivot.x, bucketPin.y - ARM.pivot.y)).toBeGreaterThan((ARM.boom + ARM.stick) * 0.95);
  });

  it('moves joints smoothly and settles on the target', () => {
    const j = createJoints([0, -1, 0]);
    const target = [0.6, -1.8, -1.5];
    let maxJump = 0;
    let prev = [...j.angle];
    for (let i = 0; i < 300; i++) {
      j.step(target, 1 / 60);
      maxJump = Math.max(maxJump, ...j.angle.map((a, k) => Math.abs(a - prev[k])));
      prev = [...j.angle];
    }
    j.angle.forEach((a, i) => expect(a).toBeCloseTo(target[i], 2));
    expect(maxJump).toBeLessThan(0.03); // never more than ~1.7 degrees per frame
  });
});

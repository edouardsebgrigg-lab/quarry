import { describe, it, expect } from 'vitest';
import { trailerYawStep } from './trailer.js';

const L = 3.3;
// Drive a hitch along a path in small steps; returns the trailer's final yaw and axle position.
function drive(path, yaw0) {
  let yaw = yaw0;
  let prev = path[0];
  for (const p of path.slice(1)) {
    yaw = trailerYawStep(yaw, p.x - prev.x, p.z - prev.z, L);
    prev = p;
  }
  return { yaw, axle: { x: prev.x - Math.cos(yaw) * L, z: prev.z + Math.sin(yaw) * L } };
}
const line = (n, step, heading) => Array.from({ length: n }, (_, i) => ({ x: i * step * Math.cos(heading), z: -i * step * Math.sin(heading) }));

describe('trailer pursuit', () => {
  it('follows straight behind when driven in a straight line', () => {
    const { yaw } = drive(line(400, 0.05, 0), 0);
    expect(yaw).toBeCloseTo(0, 6);
  });

  it('straightens up behind the tractor going forward, from any small angle', () => {
    const { yaw } = drive(line(2000, 0.05, 0), 0.6);
    expect(Math.abs(yaw)).toBeLessThan(0.01);
  });

  it('cuts the corner: the axle runs on a smaller circle than the hitch', () => {
    const R = 10;
    const path = Array.from({ length: 4000 }, (_, i) => {
      const a = (i * 0.05) / R; // arc length 0.05 per step
      return { x: R * Math.sin(a), z: R * (1 - Math.cos(a)) };
    });
    const { axle } = drive(path, 0);
    // the circle's centre is (0, R)
    expect(Math.hypot(axle.x, axle.z - R)).toBeCloseTo(Math.sqrt(R * R - L * L), 1);
  });

  it('jackknifes when reversed at an angle, and holds a straight reverse when perfectly lined up', () => {
    expect(Math.abs(drive(line(400, -0.05, 0), 0).yaw)).toBeLessThan(1e-9);
    expect(Math.abs(drive(line(400, -0.05, 0), 0.05).yaw)).toBeGreaterThan(0.2); // a small error grows
  });
});

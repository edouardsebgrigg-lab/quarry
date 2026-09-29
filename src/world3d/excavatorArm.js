// Excavator arm geometry (no graphics): where the boom, stick and bucket must point so the
// bucket teeth land on a given spot, and hydraulic-style joint motion toward those angles.
// All in the house's local 2D plane: x forward, y up, origin at the swing centre on the
// house floor. Angles are the pivot rotations the model uses (radians, counter-clockwise).

export const ARM = {
  pivot: { x: 0.9, y: 1.1 }, // boom foot pin
  boom: 3.6,
  stick: 2.6,
  teeth: { x: 0.92, y: 0.22 }, // bucket teeth, in the bucket's own frame
  limits: [[-0.8, 1.0], [-2.55, -0.3], [-3.0, 1.3]], // boom, stick (relative), bucket (relative)
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rot = (x, y, a) => ({ x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) });

// Forward kinematics: pins and teeth for joint angles [boom, stick, bucket].
export function armPoints([a1, a2, a3]) {
  const b = rot(ARM.boom, 0, a1);
  const stickPin = { x: ARM.pivot.x + b.x, y: ARM.pivot.y + b.y };
  const s = rot(ARM.stick, 0, a1 + a2);
  const bucketPin = { x: stickPin.x + s.x, y: stickPin.y + s.y };
  const t = rot(ARM.teeth.x, ARM.teeth.y, a1 + a2 + a3);
  return { stickPin, bucketPin, teeth: { x: bucketPin.x + t.x, y: bucketPin.y + t.y } };
}

// Inverse kinematics: angles that put the bucket teeth at (tx, ty) with the bucket at an
// absolute angle `bucketAngle` (how curled it is). Out-of-reach targets are pulled in.
export function solveArm(tx, ty, bucketAngle) {
  const t = rot(ARM.teeth.x, ARM.teeth.y, bucketAngle);
  let px = tx - t.x - ARM.pivot.x;
  let py = ty - t.y - ARM.pivot.y;
  const L1 = ARM.boom;
  const L2 = ARM.stick;
  const maxD = (L1 + L2) * 0.985;
  const minD = Math.abs(L1 - L2) + 0.4;
  let d = Math.hypot(px, py);
  if (d > maxD || d < minD) {
    const k = clamp(d, minD, maxD) / Math.max(d, 1e-6);
    px *= k;
    py *= k;
    d = Math.hypot(px, py);
  }
  const c2 = clamp((d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const q2 = -Math.acos(c2); // elbow up: the stick hangs down from the boom tip
  const q1 = Math.atan2(py, px) - Math.atan2(L2 * Math.sin(q2), L1 + L2 * Math.cos(q2));
  const a1 = clamp(q1, ...ARM.limits[0]);
  const a2 = clamp(q2, ...ARM.limits[1]);
  const a3 = clamp(bucketAngle - a1 - a2, ...ARM.limits[2]);
  return [a1, a2, a3];
}

// Hydraulic joints: each moves toward its target with a top speed and limited
// acceleration, easing in at the end (valves closing), like the real thing.
export function createJoints(start, { speed = [0.75, 0.95, 1.5], accel = [2.2, 2.6, 4] } = {}) {
  const angle = [...start];
  const vel = [0, 0, 0];
  return {
    angle,
    vel,
    step(target, dt, speedScale = 1) {
      let work = 0;
      for (let i = 0; i < 3; i++) {
        const diff = target[i] - angle[i];
        const vmax = speed[i] * speedScale;
        // Fastest speed that can still stop in time.
        const want = Math.sign(diff) * Math.min(vmax, Math.sqrt(2 * accel[i] * Math.abs(diff)) * 0.9, Math.abs(diff) / dt);
        const dv = want - vel[i];
        vel[i] += Math.sign(dv) * Math.min(Math.abs(dv), accel[i] * dt);
        angle[i] += vel[i] * dt;
        work += Math.abs(vel[i]) / speed[i];
      }
      return work / 3; // 0..1: how hard the hydraulics are working (for engine load and sound)
    },
  };
}

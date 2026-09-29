// A tracked undercarriage, shared by the excavator, the mini digger and the site dumper:
//  - each track speeds up and slows down on its own, and turning is one side running slower
//    (or the two sides counter-rotating, to pivot on the spot);
//  - the track shoes (or rubber lugs) are copied round the track path and roll with it, and the
//    sprockets and idlers turn;
//  - the machine sits on the ground at the angle of the ground, and won't drive off the edge of
//    a hole, up a wall, or (for site machines) off your land.
// No physics body here: the caller owns the kinematic body and reads the state `s`.
import * as THREE from 'three';

// Per-machine track layout (metres): gauge = distance between track centres, half = sprocket
// to idler axle distance from the centre, radius = sprocket radius, y = track centre line.
export const TRACKS = {
  excavator: {
    gauge: 2.4, half: 1.75, radius: 0.42, y: 1.2, shoes: 52, speed: 1.6, accel: 0.9,
    corners: [[1.9, 1.2], [1.9, -1.2], [-1.9, 1.2], [-1.9, -1.2]], step: 0.75, spread: 0.9, length: 3.8, width: 2.4,
  },
  miniDigger: {
    gauge: 0.86, half: 0.58, radius: 0.2, y: 0.43, shoes: 44, speed: 1.1, accel: 1.4,
    corners: [[0.75, 0.55], [0.75, -0.55], [-0.75, 0.55], [-0.75, -0.55]], step: 0.4, spread: 0.5, length: 1.5, width: 1.1,
  },
  dumper: {
    gauge: 0.72, half: 0.62, radius: 0.18, y: 0.36, shoes: 44, speed: 2.2, accel: 1.8, speedFromStat: true,
    corners: [[0.85, 0.5], [0.85, -0.5], [-0.85, 0.5], [-0.85, -0.5]], step: 0.45, spread: 0.6, length: 1.7, width: 1.0,
  },
};

const lerp = (a, b, t) => a + (b - a) * t;

export function createTrackDrive({ model, terrain, spec, s, engine, stats, allowedAt = null, onBlocked = null }) {
  const loop = 4 * spec.half + 2 * Math.PI * spec.radius;

  // Point on the track loop at distance d (x along the machine, y up), plus the angle that
  // turns a shoe so its outer face points outward (rotation about the machine's side axis).
  // The loop runs along the bottom rear-to-front, round the idler, back along the top.
  function stadium(d) {
    const straight = 2 * spec.half;
    const arc = Math.PI * spec.radius;
    const total = 2 * straight + 2 * arc;
    d = ((d % total) + total) % total;
    if (d < straight) return [-spec.half + d, 0, Math.PI];
    d -= straight;
    if (d < arc) {
      const a = -Math.PI / 2 + d / spec.radius;
      return [spec.half + Math.cos(a) * spec.radius, spec.radius + Math.sin(a) * spec.radius, a - Math.PI / 2];
    }
    d -= arc;
    if (d < straight) return [spec.half - d, 2 * spec.radius, 0];
    d -= straight;
    const a = Math.PI / 2 + d / spec.radius;
    return [-spec.half + Math.cos(a) * spec.radius, spec.radius + Math.sin(a) * spec.radius, a - Math.PI / 2];
  }

  let shoes = null;
  if (model.trackShoe) {
    shoes = new THREE.InstancedMesh(model.trackShoe.geometry, model.trackShoe.material, spec.shoes * 2);
    shoes.castShadow = true;
    shoes.receiveShadow = true;
    shoes.frustumCulled = false;
    model.root.add(shoes);
    model.trackShoe.visible = false;
    if (model.trackChain) model.trackChain.visible = false;
  }
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  function placeShoes() {
    if (!shoes) return;
    let k = 0;
    for (const [side, dist] of [[1, s.sL], [-1, s.sR]]) {
      for (let i = 0; i < spec.shoes; i++) {
        const [px, py, a] = stadium((i * loop) / spec.shoes - dist);
        pos.set(px, py, -side * spec.y);
        q.setFromAxisAngle(zAxis, a);
        mtx.compose(pos, q, one);
        shoes.setMatrixAt(k++, mtx);
      }
    }
    shoes.instanceMatrix.needsUpdate = true;
  }
  placeShoes();

  const forward = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  function cornerHeights(x, z, yaw) {
    const f = forward(yaw);
    const side = new THREE.Vector3(f.z, 0, -f.x);
    return spec.corners.map(([a, b]) => terrain.heightAt(x + f.x * a + side.x * b, z + f.z * a + side.z * b));
  }

  // All four track corners on fairly level ground, and no big step up or down from where it
  // is now (so it won't drive off the edge of a hole or up a wall).
  function canStandAt(x, z, yaw) {
    const h = cornerHeights(x, z, yaw);
    return h.every((v) => Math.abs(v - s.y) < spec.step) && Math.max(...h) - Math.min(...h) < spec.spread;
  }

  const input = { move: 0, turn: 0 };

  // Advance the tracks. Returns the acceleration (for rocking the machine).
  function step(dt) {
    const running = engine.running();
    const mv = running ? input.move : 0;
    const tn = running ? input.turn : 0;
    const vmax = spec.speedFromStat ? stats().speed * 1.4 : spec.speed * (stats().travelSpeed ?? 1);
    const tL = (mv - tn * 0.7) * vmax;
    const tR = (mv + tn * 0.7) * vmax;
    const before = s.vL;
    s.vL += Math.sign(tL - s.vL) * Math.min(Math.abs(tL - s.vL), spec.accel * dt);
    s.vR += Math.sign(tR - s.vR) * Math.min(Math.abs(tR - s.vR), spec.accel * dt);
    const v = (s.vL + s.vR) / 2;
    const w = (s.vR - s.vL) / spec.gauge;
    const nyaw = s.yaw + w * dt;
    const f = forward(nyaw);
    const nx = s.x + f.x * v * dt;
    const nz = s.z + f.z * v * dt;
    const allowed = !allowedAt || allowedAt(nx, nz);
    if (allowed && canStandAt(nx, nz, nyaw)) {
      s.x = nx;
      s.z = nz;
      s.yaw = nyaw;
      s.sL += s.vL * dt;
      s.sR += s.vR * dt;
    } else {
      if (!allowed && Math.abs(v) > 0.05) onBlocked?.();
      s.vL = 0;
      s.vR = 0;
    }
    if (Math.abs(s.vL) + Math.abs(s.vR) > 0.01) placeShoes();
    if (model.trackWheels) {
      for (const [side, dist] of [['L', s.sL], ['R', s.sR]]) {
        for (const wheel of model.trackWheels[side]) if (wheel) wheel.rotation.z = -dist / spec.radius;
      }
    }
    return (s.vL - before) / Math.max(dt, 1e-4);
  }

  // Sit on the ground, at its angle (eased, so the machine doesn't snap).
  function settle(dt) {
    const h = cornerHeights(s.x, s.z, s.yaw);
    const front = (h[0] + h[1]) / 2;
    const back = (h[2] + h[3]) / 2;
    const left = (h[0] + h[2]) / 2;
    const right = (h[1] + h[3]) / 2;
    const k = Math.min(1, dt * 6);
    s.y = lerp(s.y, Math.max(...h) - 0.05, k);
    s.pitch = lerp(s.pitch, Math.atan2(front - back, spec.length), k);
    s.roll = lerp(s.roll, Math.atan2(right - left, spec.width), k);
  }

  return {
    drive(move, turn) {
      input.move = move;
      input.turn = turn;
    },
    moving: () => Math.abs(s.vL) + Math.abs(s.vR) > 0.05,
    input,
    step,
    settle,
    canStandAt,
    forward,
  };
}

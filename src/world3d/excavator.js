// An excavator in the world. It behaves like the real machine:
//  - the arm is solved so the bucket teeth really reach the ground (or the truck bed), and
//    each joint moves like a hydraulic ram: speeding up, easing off, never snapping;
//  - the house swings with inertia (it winds up and slows down);
//  - the tracks speed up and slow down, turn by running one track faster (or pivot on the
//    spot), and visibly roll round their sprockets;
//  - the machine sits on the ground at the angle of the ground, and rocks as the bucket bites
//    and the house swings.
import * as THREE from 'three';
import { solveArm, armPoints, createJoints } from './excavatorArm.js';
import { buildExcavatorModel } from './models.js';
import { createEngineLife } from './engineLife.js';

const DRIVE_SPEED = 1.6; // m/s on tracks (about 6 km/h)
const TRACK_ACCEL = 0.9; // m/s²
const TRACK_GAUGE = 2.4; // distance between track centres
const TRACK_HALF = 1.75; // sprocket to idler, from the centre
const TRACK_R = 0.42;
const TRACK_Y = 1.2; // track centre line sideways (Blender Y; game Z is the negative)
const SHOES = 52;
const HOUSE_Y = 1.05; // house floor above the ground
const DUMP_TIME = 1.7;
const LINK_RATIO = 0.55; // bucket link turns at this share of the bucket angle
const LINK_OFFSET = 1.9;

const CARRY = [0.55, -1.6, -1.3];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Point on the track loop at distance s (x along the machine, y up), plus the angle that
// turns a shoe so its grouser faces outward (rotation about the machine's side axis).
// The loop runs along the bottom rear-to-front, round the idler, back along the top.
function stadium(s) {
  const straight = 2 * TRACK_HALF;
  const arc = Math.PI * TRACK_R;
  const total = 2 * straight + 2 * arc;
  s = ((s % total) + total) % total;
  if (s < straight) return [-TRACK_HALF + s, 0, Math.PI]; // bottom: grousers down
  s -= straight;
  if (s < arc) {
    const a = -Math.PI / 2 + s / TRACK_R;
    return [TRACK_HALF + Math.cos(a) * TRACK_R, TRACK_R + Math.sin(a) * TRACK_R, a - Math.PI / 2];
  }
  s -= arc;
  if (s < straight) return [TRACK_HALF - s, 2 * TRACK_R, 0]; // top: grousers up
  s -= straight;
  const a = Math.PI / 2 + s / TRACK_R;
  return [-TRACK_HALF + Math.cos(a) * TRACK_R, TRACK_R + Math.sin(a) * TRACK_R, a - Math.PI / 2];
}
const LOOP = 4 * TRACK_HALF + 2 * Math.PI * TRACK_R;

export function createExcavator({ physics, scene, terrain, machine, spawn, stats, live }) {
  const { RAPIER, world } = physics;
  const model = buildExcavatorModel(machine.tier);
  scene.add(model.root);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.1, 1.4, 1.6).setTranslation(0, 1.4, 0), body);

  const s = {
    x: spawn.x,
    z: spawn.z,
    y: terrain.heightAt(spawn.x, spawn.z),
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    roll: 0,
    vL: 0, // track speeds
    vR: 0,
    sL: 0, // track distance travelled (for the shoes)
    sR: 0,
    houseYaw: 0, // relative to the tracks
    houseVel: 0,
    targetHouseYaw: 0,
    dumpT: 0,
    dumpY: 0, // height to dump at (bed or ground)
    rock: { p: 0, pv: 0, r: 0, rv: 0 }, // body rocking (pitch, roll) on the suspension of the tracks
    work: 0, // hydraulic effort 0..1
    digging: false, // teeth in the ground
    pour: 0, // material leaving the bucket 0..1
    lastPhase: '',
    idleT: 0,
    lastColor: null,
  };
  const joints = createJoints(CARRY);
  const engine = createEngineLife();
  const moveInput = { move: 0, turn: 0 };

  // ---- animated track shoes (if the model has them)
  let shoes = null;
  if (model.trackShoe) {
    shoes = new THREE.InstancedMesh(model.trackShoe.geometry, model.trackShoe.material, SHOES * 2);
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
      for (let i = 0; i < SHOES; i++) {
        const [px, py, a] = stadium((i * LOOP) / SHOES - dist);
        pos.set(px, py, -side * TRACK_Y);
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
    return [[1.9, 1.2], [1.9, -1.2], [-1.9, 1.2], [-1.9, -1.2]].map(([a, b]) => terrain.heightAt(
      x + f.x * a + side.x * b, z + f.z * a + side.z * b));
  }

  function canStandAt(x, z, yaw) {
    // All four track corners must be on solid, fairly level ground (not over a pit edge).
    const h = cornerHeights(x, z, yaw);
    return h.every((v) => v > -0.35 && v < 0.8) && Math.max(...h) - Math.min(...h) < 0.6;
  }

  // Tracks: each side accelerates toward its own target speed; turning = one side slower.
  function drive(dt, move, turn) {
    moveInput.move = move;
    moveInput.turn = turn;
  }

  function stepTracks(dt) {
    const running = engine.running();
    const mv = running ? moveInput.move : 0;
    const tn = running ? moveInput.turn : 0;
    const vmax = DRIVE_SPEED * (stats().travelSpeed ?? 1);
    const tL = (mv - tn * 0.7) * vmax;
    const tR = (mv + tn * 0.7) * vmax;
    const aL = s.vL;
    s.vL += Math.sign(tL - s.vL) * Math.min(Math.abs(tL - s.vL), TRACK_ACCEL * dt);
    s.vR += Math.sign(tR - s.vR) * Math.min(Math.abs(tR - s.vR), TRACK_ACCEL * dt);
    const v = (s.vL + s.vR) / 2;
    const w = (s.vR - s.vL) / TRACK_GAUGE;
    const accel = (s.vL - aL) / Math.max(dt, 1e-4);
    const nyaw = s.yaw + w * dt;
    const f = forward(nyaw);
    const nx = s.x + f.x * v * dt;
    const nz = s.z + f.z * v * dt;
    if (canStandAt(nx, nz, nyaw)) {
      s.x = nx;
      s.z = nz;
      s.yaw = nyaw;
      s.sL += s.vL * dt;
      s.sR += s.vR * dt;
    } else {
      s.vL = 0;
      s.vR = 0;
    }
    // Starting and stopping rocks the machine back and forth on its tracks.
    s.rock.pv -= accel * 0.35 * dt;
    if (Math.abs(s.vL) + Math.abs(s.vR) > 0.01) placeShoes();
    if (model.trackWheels) {
      for (const [side, dist] of [['L', s.sL], ['R', s.sR]]) {
        for (const wheel of model.trackWheels[side]) if (wheel) wheel.rotation.z = -dist / TRACK_R;
      }
    }
  }

  function houseWorldYaw() {
    return s.yaw + s.houseYaw;
  }

  function reach() {
    return stats().reach;
  }

  // Where the bucket digs or dumps, on the ground in front of the house.
  function bucketTarget() {
    const f = forward(houseWorldYaw());
    return new THREE.Vector3(s.x + f.x * reach(), 0, s.z + f.z * reach());
  }

  // Height (in house coordinates) of the ground at the bucket target.
  function groundBelowTarget() {
    const t = bucketTarget();
    return terrain.heightAt(t.x, t.z) - (s.y + HOUSE_Y);
  }

  // The arm's goal for this moment: [boom, stick, bucket] angles and the phase name.
  function armGoal(job) {
    const R = reach();
    const gy = groundBelowTarget();
    if (job?.type === 'dig') {
      const p = clamp01(job.elapsed / job.duration);
      // Teeth path: reach out, bite in, drag back along the ground, curl and lift, tuck in.
      const path = [
        { t: 0.0, x: R - 1.8, y: gy + 2.2, phi: -1.6 },
        { t: 0.28, x: R + 0.1, y: gy + 0.7, phi: -0.75, phase: 'reach' },
        { t: 0.42, x: R - 0.1, y: gy - 0.32, phi: -1.2, phase: 'bite' },
        { t: 0.66, x: R - 1.5, y: gy - 0.28, phi: -2.05, phase: 'drag' },
        { t: 0.82, x: R - 1.7, y: gy + 1.5, phi: -2.65, phase: 'curl' },
      ];
      if (p >= 0.82) {
        const k = ease((p - 0.82) / 0.18);
        const lift = solveArm(R - 1.7, gy + 1.5, -2.65);
        return { angles: lift.map((a, i) => lerp(a, CARRY[i], k)), phase: 'tuck' };
      }
      let i = 0;
      while (i < path.length - 2 && p > path[i + 1].t) i += 1;
      const a = path[i];
      const b = path[i + 1];
      const k = ease(clamp01((p - a.t) / (b.t - a.t)));
      return { angles: solveArm(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.phi, b.phi, k)), phase: b.phase };
    }
    if (s.dumpT > 0) {
      const p = 1 - s.dumpT / DUMP_TIME;
      const y = s.dumpY - (s.y + HOUSE_Y) + 1.4;
      const over = solveArm(R - 0.3, y, -2.5);
      const open = solveArm(R + 0.1, y + 0.2, 0.55);
      if (p < 0.35) return { angles: over.map((a, i) => lerp(CARRY[i], a, ease(p / 0.35))), phase: 'raise' };
      if (p < 0.7) return { angles: over.map((a, i) => lerp(a, open[i], ease((p - 0.35) / 0.35))), phase: 'dump' };
      return { angles: open.map((a, i) => lerp(a, CARRY[i], ease((p - 0.7) / 0.3))), phase: 'return' };
    }
    return { angles: CARRY, phase: 'carry' };
  }

  function aimRams() {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const { barrel, rod } of model.rams) {
      for (const [obj, other] of [[barrel, rod], [rod, barrel]]) {
        other.getWorldPosition(a);
        obj.parent.worldToLocal(b.copy(a));
        obj.rotation.z = Math.atan2(b.y - obj.position.y, b.x - obj.position.x);
      }
    }
  }

  function update(dt, { job, bucketFull, bucketColor, occupied }) {
    const m = live?.();
    engine.update(dt, { occupied, broken: !!m?.broken });
    const running = engine.running();
    const speedScale = (stats().swingSpeed ?? 1) / 1.25 * (running ? 1 : 0);

    // ---- swing: winds up, then eases to a stop on the target
    const diff = s.targetHouseYaw - s.houseYaw;
    const vmax = (stats().swingSpeed ?? 1) * (running ? 1 : 0);
    const acc = (bucketFull ? 1.0 : 1.5) * (running ? 1 : 0);
    const want = Math.sign(diff) * Math.min(vmax, Math.sqrt(2 * acc * Math.abs(diff)) * 0.95, Math.abs(diff) / Math.max(dt, 1e-4));
    const dv = want - s.houseVel;
    const prevVel = s.houseVel;
    s.houseVel += Math.sign(dv) * Math.min(Math.abs(dv), (acc + 0.4) * dt);
    s.houseYaw += s.houseVel * dt;
    s.rock.rv += ((s.houseVel - prevVel) / Math.max(dt, 1e-4)) * 0.0035 * (bucketFull ? 1.6 : 1); // swing jolts

    stepTracks(dt);

    // ---- arm
    const goal = armGoal(job);
    const armWork = joints.step(goal.angles, dt, Math.max(0.05, speedScale) * 1.6);
    if (goal.phase !== s.lastPhase) {
      if (goal.phase === 'bite') s.rock.pv -= 0.05; // bucket bites: the nose dips
      if (goal.phase === 'curl') s.rock.pv += 0.03 * (bucketFull ? 1.5 : 1); // breaking out lifts it
      s.lastPhase = goal.phase;
    }
    s.digging = goal.phase === 'bite' || goal.phase === 'drag';
    s.pour = goal.phase === 'dump' ? 1 : 0;
    if (s.dumpT > 0) s.dumpT = Math.max(0, s.dumpT - dt);
    const moving = Math.abs(s.vL) + Math.abs(s.vR) > 0.05;
    s.work = Math.min(1, armWork * 1.4 + Math.abs(s.houseVel) * 0.5 + (moving ? 0.6 : 0) + (s.digging ? 0.4 : 0));
    s.idleT = s.work > 0.05 || moveInput.move || moveInput.turn ? 0 : s.idleT + dt;

    // ---- body on the ground, with a little rocking
    const h = cornerHeights(s.x, s.z, s.yaw);
    const front = (h[0] + h[1]) / 2;
    const back = (h[2] + h[3]) / 2;
    const left = (h[0] + h[2]) / 2;
    const right = (h[1] + h[3]) / 2;
    const k = Math.min(1, dt * 6);
    s.y = lerp(s.y, Math.max(...h) - 0.05, k);
    s.pitch = lerp(s.pitch, Math.atan2(front - back, 3.8), k);
    s.roll = lerp(s.roll, Math.atan2(right - left, 2.4), k);
    const r = s.rock;
    const stiff = 70;
    const damp = 2 * Math.sqrt(stiff) * 0.3;
    const load = bucketFull && goal.phase !== 'dump' ? -0.006 : 0; // heavy bucket out front: slight nose-down
    r.pv += (-stiff * (r.p - load) - damp * r.pv) * dt;
    r.rv += (-stiff * r.r - damp * r.rv) * dt;
    r.p += r.pv * dt;
    r.r += r.rv * dt;
    if (s.digging) r.pv += (Math.random() - 0.5) * 0.05; // judder while the teeth drag

    body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    model.root.position.set(s.x, s.y, s.z);
    model.root.rotation.set(s.roll + r.r, s.yaw, s.pitch + r.p, 'YZX');
    model.house.rotation.y = s.houseYaw;
    const [b1, b2, b3] = joints.angle;
    model.boomPivot.rotation.z = b1;
    model.stickPivot.rotation.z = b2;
    model.bucketPivot.rotation.z = b3;
    if (model.bucketLink) model.bucketLink.rotation.z = LINK_RATIO * b3 + LINK_OFFSET;
    if (model.rams.length) {
      model.root.updateMatrixWorld(true);
      aimRams();
    }
    // The game empties the bucket the moment you click; the model keeps the load until it tips.
    if (bucketColor) s.lastColor = bucketColor;
    const showLoad = (bucketFull && s.dumpT === 0) || goal.phase === 'raise' || (goal.phase === 'dump' && s.dumpT > DUMP_TIME * 0.45);
    model.setBucketLoad(showLoad, bucketColor ?? s.lastColor);
  }

  // Bucket teeth in world space (for dust where they dig).
  function teethWorld() {
    const { teeth } = armPoints(joints.angle);
    model.root.updateMatrixWorld(true);
    return model.house.localToWorld(new THREE.Vector3(teeth.x, teeth.y, 0.35));
  }

  return {
    type: 'excavator',
    machineId: machine.id,
    model,
    state: s,
    drive,
    update,
    bucketTarget,
    houseWorldYaw,
    teethWorld,
    swingBy(delta) {
      s.targetHouseYaw += delta;
    },
    // Dump the bucket over a spot at world height y (a truck bed, or the ground).
    startDump(y = null) {
      s.dumpT = DUMP_TIME;
      s.dumpY = y ?? terrain.heightAt(bucketTarget().x, bucketTarget().z);
    },
    busy: () => s.dumpT > 0,
    feel() {
      return {
        engine: engine.state,
        running: engine.running(),
        work: s.work,
        autoIdle: s.idleT > 4,
        travel: (Math.abs(s.vL) + Math.abs(s.vR)) / 2,
        swing: Math.abs(s.houseVel),
        digging: s.digging,
        pour: s.pour,
        phase: s.lastPhase,
        size: Math.min(1, (stats().mass ?? 8000) / 10000),
      };
    },
    engineOn: () => engine.running(),
    // Engine starts and stops since last asked (for the sound).
    takeEngineEvents: () => engine.takeEvents(),
    position: () => new THREE.Vector3(s.x, s.y, s.z),
    yaw: () => s.yaw,
    speed: () => (s.vL + s.vR) / 2,
    // Camera seat in world space.
    seatWorld() {
      model.root.updateMatrixWorld(true);
      return model.house.localToWorld(model.cabSeat.clone());
    },
    exhaustWorld() {
      model.root.updateMatrixWorld(true);
      return model.house.localToWorld(new THREE.Vector3(-0.6, 1.6, 0.9));
    },
    placement: () => ({ x: s.x, z: s.z, yaw: s.yaw }),
    radius: 2.6,
    destroy() {
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

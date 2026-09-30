// A digger in the world: the 8 t excavator or the mini digger. It behaves like the real machine:
//  - the arm is solved so the bucket teeth really reach the ground (or the truck bed), and
//    each joint moves like a hydraulic ram: speeding up, easing off, never snapping;
//  - the house swings with inertia (it winds up and slows down);
//  - the tracks speed up and slow down, turn by running one track faster (or pivot on the
//    spot), and visibly roll round their sprockets (see trackDrive.js);
//  - the machine sits on the ground at the angle of the ground, and rocks as the bucket bites
//    and the house swings.
// Two ways to work it: Assisted (aim and click: the arm plans the whole dig cycle) and Direct
// (boom, stick, bucket and swing each on their own controls: the bucket teeth cut the ground
// where they really are, and tip out where the bucket really is).
import * as THREE from 'three';
import { makeArm, ARM, MINI_ARM, createJoints } from './excavatorArm.js';
import { buildExcavatorModel, buildMiniDiggerModel } from './models.js';
import { createEngineLife } from './engineLife.js';
import { createTrackDrive, TRACKS } from './trackDrive.js';

const DUMP_TIME = 1.7;
const LINK_RATIO = 0.55; // bucket link turns at this share of the bucket angle
const LINK_OFFSET = 1.9;
const CARRY = [0.55, -1.6, -1.3];
const LEAD = 0.35; // how far ahead of a joint its Direct target may run (rad)
export const POUR_ANGLE = -0.45; // absolute bucket angle beyond which the load runs out

// What differs between the diggers. `scale` shrinks the Assisted dig path to the arm's size.
export const DIGGERS = {
  excavator: {
    arm: makeArm(ARM), tracks: TRACKS.excavator, houseY: 1.05, scale: 1, model: buildExcavatorModel,
    collider: { hx: 2.1, hy: 1.4, hz: 1.6, cy: 1.4 }, radius: 2.6, exhaust: [-0.6, 1.6, 0.9],
  },
  miniDigger: {
    arm: makeArm(MINI_ARM), tracks: TRACKS.miniDigger, houseY: 0.42, scale: 0.45, model: buildMiniDiggerModel,
    collider: { hx: 0.95, hy: 0.85, hz: 0.6, cy: 0.85 }, radius: 1.7, exhaust: [-0.45, 0.85, 0.25],
  },
};

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = (t) => clamp(t, 0, 1);

// `allowedAt(x, z)` (optional): false where the machine may not go (site machines aren't
// road-legal, so they stay on your land); `onBlocked()` is called when it tries.
// `canDigAt(x, z)` says whether the ground there can be dug (Direct control stops the teeth
// going into ground that can't be).
export function createExcavator({ physics, scene, terrain, machine, spawn, stats, live, allowedAt = null, onBlocked = null, canDigAt = null }) {
  const { RAPIER, world } = physics;
  const spec = DIGGERS[machine.type];
  const { armPoints, solveArm } = spec.arm;
  const limits = spec.arm.spec.limits;
  const model = spec.model(machine.tier);
  scene.add(model.root);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z));
  const c = spec.collider;
  world.createCollider(RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(0, c.cy, 0), body);

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
  const tracks = createTrackDrive({ model, terrain, spec: spec.tracks, s, engine, stats, allowedAt, onBlocked });

  // ---- Direct control: target angles the joints follow, fed by the player's controls
  const direct = { on: false, target: [...CARRY], axis: [0, 0, 0], delta: [0, 0, 0], stuck: false, cutting: false, pouring: 0 };

  const forward = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const houseWorldYaw = () => s.yaw + s.houseYaw;
  const reach = () => stats().reach;

  // Bucket teeth in world space for joint angles (ignoring the machine's tilt).
  function teethAtAngles(angles) {
    const t = armPoints(angles).teeth;
    const f = forward(houseWorldYaw());
    return { x: s.x + f.x * t.x, y: s.y + spec.houseY + t.y, z: s.z + f.z * t.x };
  }

  // Where the bucket digs or dumps in Assisted mode: on the ground in front of the house.
  function bucketTarget() {
    const f = forward(houseWorldYaw());
    return new THREE.Vector3(s.x + f.x * reach(), 0, s.z + f.z * reach());
  }

  // Height (in house coordinates) of the ground at the bucket target.
  function groundBelowTarget() {
    const t = bucketTarget();
    return terrain.heightAt(t.x, t.z) - (s.y + spec.houseY);
  }

  // The arm's goal for this moment: [boom, stick, bucket] angles and the phase name.
  function armGoal(job) {
    const R = reach();
    const gy = groundBelowTarget();
    const sc = spec.scale;
    if (job?.type === 'dig') {
      const p = clamp01(job.elapsed / job.duration);
      // Teeth path: reach out, bite in, drag back along the ground, curl and lift, tuck in.
      const path = [
        { t: 0.0, x: R - 1.8 * sc, y: gy + 2.2 * sc, phi: -1.6 },
        { t: 0.28, x: R + 0.1 * sc, y: gy + 0.7 * sc, phi: -0.75, phase: 'reach' },
        { t: 0.42, x: R - 0.1 * sc, y: gy - 0.32 * sc, phi: -1.2, phase: 'bite' },
        { t: 0.66, x: R - 1.5 * sc, y: gy - 0.28 * sc, phi: -2.05, phase: 'drag' },
        { t: 0.82, x: R - 1.7 * sc, y: gy + 1.5 * sc, phi: -2.65, phase: 'curl' },
      ];
      if (p >= 0.82) {
        const k = ease((p - 0.82) / 0.18);
        const lift = solveArm(R - 1.7 * sc, gy + 1.5 * sc, -2.65);
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
      const y = s.dumpY - (s.y + spec.houseY) + 1.4 * sc;
      const over = solveArm(R - 0.3 * sc, y, -2.5);
      const open = solveArm(R + 0.1 * sc, y + 0.2 * sc, 0.55);
      if (p < 0.35) return { angles: over.map((a, i) => lerp(CARRY[i], a, ease(p / 0.35))), phase: 'raise' };
      if (p < 0.7) return { angles: over.map((a, i) => lerp(a, open[i], ease((p - 0.35) / 0.35))), phase: 'dump' };
      return { angles: open.map((a, i) => lerp(a, CARRY[i], ease((p - 0.7) / 0.3))), phase: 'return' };
    }
    if (direct.on) return { angles: direct.target, phase: direct.cutting ? 'drag' : direct.pouring > 0.05 ? 'dump' : 'carry' };
    return { angles: CARRY, phase: 'carry' };
  }

  // Direct control: turn this frame's control inputs into target angles for the joints. The
  // targets never run far ahead of the joints (so the arm answers at once when you let go),
  // and the teeth can't be pushed deeper into ground they can't dig (a full bucket, rock).
  function directTargets(bucketFull) {
    for (let i = 0; i < 3; i++) {
      const now = joints.angle[i];
      let t = now + direct.axis[i] * LEAD + direct.delta[i];
      t = clamp(t, now - LEAD, now + LEAD);
      direct.target[i] = clamp(t, limits[i][0], limits[i][1]);
      direct.delta[i] = 0;
    }
    const cand = teethAtAngles(direct.target);
    const under = cand.y < terrain.heightAt(cand.x, cand.z) - 0.02;
    if (under) {
      const deeper = cand.y < teethAtAngles(joints.angle).y - 1e-4;
      const undiggable = bucketFull || direct.stuck || (canDigAt ? !canDigAt(cand.x, cand.z) : false);
      if (deeper && undiggable) for (let i = 0; i < 3; i++) direct.target[i] = joints.angle[i];
    }
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

    const accel = tracks.step(dt);
    s.rock.pv -= accel * 0.35 * dt; // starting and stopping rocks the machine back and forth

    // ---- arm
    if (direct.on && !job && s.dumpT === 0) directTargets(bucketFull);
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
    s.work = Math.min(1, armWork * 1.4 + Math.abs(s.houseVel) * 0.5 + (tracks.moving() ? 0.6 : 0) + (s.digging ? 0.4 : 0));
    s.idleT = s.work > 0.05 || tracks.input.move || tracks.input.turn ? 0 : s.idleT + dt;

    // ---- body on the ground, with a little rocking
    tracks.settle(dt);
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
    const showLoad = (bucketFull && (s.dumpT === 0 || direct.on)) || goal.phase === 'raise' || (goal.phase === 'dump' && s.dumpT > DUMP_TIME * 0.45);
    model.setBucketLoad(showLoad, bucketColor ?? s.lastColor);
  }

  // Bucket teeth in world space (for dust where they dig).
  function teethWorld() {
    const { teeth } = armPoints(joints.angle);
    model.root.updateMatrixWorld(true);
    return model.house.localToWorld(new THREE.Vector3(teeth.x, teeth.y, 0.35 * spec.scale ** 0.5));
  }

  return {
    type: machine.type,
    digger: true,
    tracked: true,
    machineId: machine.id,
    model,
    state: s,
    drive: (dt, move, turn) => tracks.drive(move, turn),
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

    // ---- Direct control
    setDirect(on) {
      if (on && !direct.on) {
        direct.target = [...joints.angle];
        direct.stuck = false;
      }
      direct.on = on;
      if (!on) {
        direct.axis = [0, 0, 0];
        direct.cutting = false;
        direct.pouring = 0;
      }
    },
    isDirect: () => direct.on,
    // Controls for this frame: axes -1..1 for boom (up +), stick (out +) and bucket (open +),
    // plus stick and boom movement in radians from the mouse and its wheel.
    directInput({ boom = 0, stick = 0, bucket = 0, stickDelta = 0, boomDelta = 0 }) {
      direct.axis = [boom, stick, bucket];
      direct.delta[0] += boomDelta;
      direct.delta[1] += stickDelta;
    },
    // What the teeth are doing, for the game to act on: where they are, how the bucket is
    // tilted, and whether they're below the ground.
    directState() {
      const teeth = teethAtAngles(joints.angle);
      const phi = joints.angle[0] + joints.angle[1] + joints.angle[2];
      const gh = terrain.heightAt(teeth.x, teeth.z);
      return { teeth, phi, ground: gh, under: teeth.y < gh - 0.02, moving: Math.abs(joints.vel[0]) + Math.abs(joints.vel[1]) + Math.abs(joints.vel[2]) > 0.02 };
    },
    // The game reports what happened: teeth cutting, the load running out (0..1), or the
    // ground refusing to be cut (rock).
    directReport({ cutting = false, pouring = 0, stuck = false }) {
      direct.cutting = cutting;
      direct.pouring = pouring;
      direct.stuck = stuck;
    },

    feel() {
      return {
        engine: engine.state,
        running: engine.running(),
        work: s.work,
        autoIdle: s.idleT > 4,
        travel: (Math.abs(s.vL) + Math.abs(s.vR)) / 2,
        reversing: (s.vL + s.vR) / 2 < -0.05,
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
      return model.house.localToWorld(new THREE.Vector3(...spec.exhaust));
    },
    placement: () => ({ x: s.x, z: s.z, yaw: s.yaw }),
    radius: spec.radius,
    destroy() {
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

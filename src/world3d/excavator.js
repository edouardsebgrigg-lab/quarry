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
import { aimRams, LINK_RATIO, LINK_OFFSET } from './glbModels.js';
import { createTrackDrive, TRACKS } from './trackDrive.js';

const DUMP_TIME = 1.7;
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
  const base = DIGGERS[machine.type];
  const size = stats().modelScale ?? 1;
  const a = base.arm.spec;
  const spec = { ...base, arm: makeArm({ ...a, pivot: { x: a.pivot.x * size, y: a.pivot.y * size }, boom: a.boom * size, stick: a.stick * size, teeth: { x: a.teeth.x * size, y: a.teeth.y * size } }),
    houseY: base.houseY * size, scale: base.scale * size, radius: base.radius * size,
    collider: Object.fromEntries(Object.entries(base.collider).map(([k, v]) => [k, v * size])),
    tracks: { ...base.tracks, gauge: base.tracks.gauge * size, corners: base.tracks.corners.map(p => p.map(v => v * size)), step: base.tracks.step * size, spread: base.tracks.spread * size } };
  const { armPoints, solveArm } = spec.arm;
  const limits = spec.arm.spec.limits;
  const model = spec.model(machine.tier, stats());
  scene.add(model.root);
  const bucketMeshes = [];
  model.bucketPivot.traverse(o => { if (o.isMesh) bucketMeshes.push(o); });
  const attachment = new THREE.Group();
  model.bucketPivot.add(attachment);
  const steel = new THREE.MeshStandardMaterial({color:0x626c73,metalness:.7,roughness:.45});
  const hammerPaint = new THREE.MeshStandardMaterial({color:0xd1a12f,metalness:.3,roughness:.7});
  const hammer = new THREE.Group(); attachment.add(hammer);
  const baseTeeth = base.arm.spec.teeth;
  const direction = new THREE.Vector3(baseTeeth.x,baseTeeth.y,0).normalize();
  const hammerLength = Math.hypot(baseTeeth.x,baseTeeth.y);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(hammerLength*.62,.27,.3),hammerPaint);
  housing.position.copy(direction).multiplyScalar(hammerLength*.32);
  housing.rotation.z = Math.atan2(direction.y,direction.x);
  const chisel = new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,hammerLength*.48,6),steel);
  chisel.rotation.z = Math.atan2(direction.y,direction.x)-Math.PI/2;
  chisel.position.copy(direction).multiplyScalar(hammerLength*.76);
  hammer.add(housing,chisel);
  const gradingLip = new THREE.Mesh(new THREE.BoxGeometry(.24,.055,1.1),steel);
  gradingLip.position.set(baseTeeth.x-.08,baseTeeth.y,0);
  gradingLip.scale.z = (machine.type === 'miniDigger' ? .46 : 1.1) / 1.1;
  attachment.add(gradingLip);
  let lastAttachment = null;

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
    houseYaw: spawn.houseYaw ?? 0, // relative to the tracks
    houseVel: 0,
    targetHouseYaw: spawn.houseYaw ?? 0,
    dumpT: 0,
    dumpY: 0, // height to dump at (bed or ground)
    rock: { p: 0, pv: 0, r: 0, rv: 0 }, // body rocking (pitch, roll) on the suspension of the tracks
    work: 0, // hydraulic effort 0..1
    digging: false, // teeth in the ground
    pour: 0, // material leaving the bucket 0..1
    lastPhase: '',
    idleT: 0,
    lastColor: null,
    aimReach: clamp(spawn.aimReach ?? stats().reach, stats().reach*.4, stats().reach),
    cutDepth: clamp(spawn.cutDepth ?? 0.35, .05, stats().digDepth ?? .8),
    resistance: 0,
    dumpTarget: null,
    dumpReady: false,
    lastDump: spawn.lastDump ?? null,
    repeatDump: null,
  };
  const savedArm = Array.isArray(spawn.arm) && spawn.arm.length === 3 && spawn.arm.every(Number.isFinite) ? spawn.arm.map((a,i)=>clamp(a,...limits[i])) : CARRY;
  const joints = createJoints(savedArm);
  const engine = createEngineLife();
  const tracks = createTrackDrive({ model, terrain, spec: spec.tracks, s, engine, stats, allowedAt, onBlocked });

  // ---- Direct control: target angles the joints follow, fed by the player's controls
  const direct = { on: false, target: [...CARRY], axis: [0, 0, 0], delta: [0, 0, 0], stuck: false, cutting: false, pouring: 0 };

  const forward = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const houseWorldYaw = () => s.yaw + s.houseYaw;
  const reach = () => live?.()?.operator && s.operatorReach != null ? s.operatorReach : s.aimReach;

  // Bucket teeth in world space for joint angles (ignoring the machine's tilt).
  function teethAtAngles(angles) {
    const t = armPoints(angles).teeth;
    model.root.updateMatrixWorld(true);
    const p = model.house.localToWorld(new THREE.Vector3(t.x / size, t.y / size, 0));
    return { x: p.x, y: p.y, z: p.z };
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
    const gy = job?.params.physical && job.params.groundY != null ? job.params.groundY - (s.y + spec.houseY) : groundBelowTarget();
    const sc = spec.scale;
    if (job?.type === 'dig') {
      const p = clamp01(job.elapsed / job.duration);
      // Teeth path: reach out, bite in, drag back along the ground, curl and lift, tuck in.
      const path = [
        { t: 0.0, x: R - 1.8 * sc, y: gy + 2.2 * sc, phi: -1.6 },
        { t: 0.28, x: R + 0.1 * sc, y: gy + 0.7 * sc, phi: -0.75, phase: 'reach' },
        { t: 0.42, x: R - 0.1 * sc, y: gy - (job.params.depth ?? 0.32 * sc), phi: -1.2, phase: 'bite' },
        { t: 0.66, x: R - 1.5 * sc, y: gy - (job.params.depth ?? 0.28 * sc), phi: -2.05, phase: 'drag' },
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
  // Holding a lever against a ram at the end of its stroke, or the teeth against ground they
  // can't dig, blows the relief valve (s.relief: the squeal and the engine bogging).
  function directTargets(bucketFull) {
    let relief = false;
    for (let i = 0; i < 3; i++) {
      const now = joints.angle[i];
      let t = now + direct.axis[i] * LEAD + direct.delta[i];
      t = clamp(t, now - LEAD, now + LEAD);
      direct.target[i] = clamp(t, limits[i][0], limits[i][1]);
      direct.delta[i] = 0;
      if ((direct.axis[i] > 0 && now >= limits[i][1] - 0.01) || (direct.axis[i] < 0 && now <= limits[i][0] + 0.01)) relief = true;
    }
    const cand = teethAtAngles(direct.target);
    const under = cand.y < terrain.heightAt(cand.x, cand.z) - 0.02;
    if (under) {
      const deeper = cand.y < teethAtAngles(joints.angle).y - 1e-4;
      const undiggable = bucketFull || direct.stuck || (canDigAt ? !canDigAt(cand.x, cand.z) : false);
      if (deeper && undiggable) {
        for (let i = 0; i < 3; i++) direct.target[i] = joints.angle[i];
        if (direct.axis.some((a) => a !== 0)) relief = true;
      }
    }
    s.relief = relief;
  }

  function update(dt, { job, bucketFull, bucketLoaded = bucketFull, bucketFraction = 1, bucketColor, occupied }) {
    const m = live?.();
    engine.update(dt, { occupied, broken: !!m?.broken });
    const running = engine.running();
    const force = stats().breakoutForce ?? 60;
    const resistanceScale = Math.max(0.2, force / Math.max(force, s.resistance));
    const speedScale = (stats().hydraulicSpeed ?? (stats().swingSpeed ?? 1) / 1.25) * resistanceScale * (running ? 1 : 0);

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
    else s.relief = false;
    const goal = armGoal(job);
    const armWork = dt > 0 ? joints.step(goal.angles, dt, speedScale * 1.6) : 0;
    if (goal.phase !== s.lastPhase) {
      if (goal.phase === 'bite') s.rock.pv -= 0.05; // bucket bites: the nose dips
      if (goal.phase === 'curl') s.rock.pv += 0.03 * (bucketFull ? 1.5 : 1); // breaking out lifts it
      s.lastPhase = goal.phase;
    }
    s.digging = goal.phase === 'bite' || goal.phase === 'drag';
    s.pour = goal.phase === 'dump' ? 1 : 0;
    if (s.dumpTarget && goal.phase === 'dump' && joints.angle.reduce((sum,a)=>sum+a,0) > POUR_ANGLE) s.dumpReady = true;
    if (s.dumpT > 0) {
      s.dumpT = Math.max(0, s.dumpT - dt);
      // Hydraulics may lag a planned path under load. Hold the open target until the
      // real bucket reaches a pouring angle, rather than transferring cargo early.
      if (s.dumpTarget && !s.dumpReady) s.dumpT = Math.max(s.dumpT, DUMP_TIME * .32);
    }
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
    if (s.digging && dt > 0) r.pv += (Math.random() - 0.5) * 0.05; // judder while the teeth drag

    body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    model.root.position.set(s.x, s.y, s.z);
    model.root.rotation.set(s.roll + r.r, s.yaw, s.pitch + r.p, 'YZX');
    model.house.rotation.y = s.houseYaw;
    const [b1, b2, b3] = joints.angle;
    model.boomPivot.rotation.z = b1;
    model.stickPivot.rotation.z = b2;
    model.bucketPivot.rotation.z = b3;
    model.bucketPivot.scale.z = (stats().bucketWidth ?? (machine.type === 'miniDigger' ? 0.46 : 1.1) * size) / ((machine.type === 'miniDigger' ? 0.46 : 1.1) * size);
    const tool = m?.attachment ?? 'standard';
    if (lastAttachment !== tool) {
      for (const mesh of bucketMeshes) mesh.visible = tool !== 'breaker';
      hammer.visible = tool === 'breaker';
      gradingLip.visible = tool === 'grading';
      lastAttachment = tool;
    }
    hammer.scale.z = 1 / Math.max(.01,model.bucketPivot.scale.z);
    if (model.bucketLink) model.bucketLink.rotation.z = LINK_RATIO * b3 + LINK_OFFSET;
    if (model.rams.length) {
      model.root.updateMatrixWorld(true);
      aimRams(model.rams);
    }
    // The game empties the bucket the moment you click; the model keeps the load until it tips.
    if (bucketColor) s.lastColor = bucketColor;
    const showLoad = bucketLoaded || (!s.dumpTarget && (goal.phase === 'raise' || (goal.phase === 'dump' && s.dumpT > DUMP_TIME * 0.45)));
    model.setBucketLoad(showLoad && tool !== 'breaker', bucketColor ?? s.lastColor, bucketLoaded ? bucketFraction : 1);
  }

  // Bucket teeth in world space (for dust where they dig).
  function teethWorld() {
    const t = teethAtAngles(joints.angle);
    return new THREE.Vector3(t.x, t.y, t.z);
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
    startDump(y = null, target = null) {
      s.dumpT = DUMP_TIME;
      s.dumpY = y ?? terrain.heightAt(bucketTarget().x, bucketTarget().z);
      s.dumpTarget = target;
      s.dumpReady = false;
      if (target) s.lastDump = { ...target };
    },
    aimDump(x,z) {
      const distance = Math.hypot(x-s.x,z-s.z);
      if (distance > stats().reach+.3 || distance < stats().reach*.35) return false;
      const angle = Math.atan2(-(z-s.z),x-s.x)-s.yaw;
      s.targetHouseYaw = s.houseYaw + Math.atan2(Math.sin(angle-s.houseYaw),Math.cos(angle-s.houseYaw));
      s.aimReach = clamp(distance,stats().reach*.4,stats().reach);
      return true;
    },
    takeDumpTarget() {
      if (!s.dumpReady) return null;
      const target = s.dumpTarget;
      s.dumpTarget = null;
      s.dumpReady = false;
      return target;
    },
    adjustAim(delta, depth = false) {
      if (depth) s.cutDepth = clamp(s.cutDepth + delta, 0.05, stats().digDepth ?? 0.8);
      else s.aimReach = clamp(s.aimReach + delta, stats().reach * 0.4, stats().reach);
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
    directReport({ cutting = false, pouring = 0, stuck = false, resistance = 0 }) {
      direct.cutting = cutting;
      direct.pouring = pouring;
      direct.stuck = stuck;
      s.resistance = resistance;
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
        relief: !!s.relief && engine.running(),
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
    placement: () => ({ x: s.x, z: s.z, yaw: s.yaw, houseYaw:s.houseYaw, arm:[...joints.angle], aimReach:s.aimReach, cutDepth:s.cutDepth, lastDump:s.lastDump }),
    radius: spec.radius,
    destroy() {
      attachment.traverse(o => o.geometry?.dispose());
      steel.dispose();hammerPaint.dispose();
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

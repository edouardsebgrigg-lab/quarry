// An excavator in the world: drives slowly on tracks, swings its house with the mouse,
// and animates the arm while the game's dig job runs.
import * as THREE from 'three';
import { buildExcavatorModel } from './models.js';

const DRIVE_SPEED = 2.2; // m/s on tracks
const TURN_SPEED = 0.7; // rad/s
const DUMP_TIME = 0.7;

// Arm poses: [boom, stick, bucket] angles in radians.
const POSE = {
  carry: [0.55, -1.6, -1.3],
  reach: [-0.35, -0.75, 0.25],
  curl: [-0.15, -1.1, -1.6],
  dump: [0.45, -0.85, 1.0],
};

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPose = (p, q, t) => p.map((v, i) => lerp(v, q[i], t));
const ease = (t) => t * t * (3 - 2 * t);

export function createExcavator({ physics, scene, terrain, machine, spawn, stats }) {
  const { RAPIER, world } = physics;
  const model = buildExcavatorModel(machine.tier);
  scene.add(model.root);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.1, 1.4, 1.6).setTranslation(0, 1.4, 0), body);

  const s = {
    x: spawn.x,
    z: spawn.z,
    yaw: spawn.yaw ?? 0,
    houseYaw: 0, // relative to the tracks
    targetHouseYaw: 0,
    dumpT: 0, // counts down after a dump
    pose: [...POSE.carry],
  };

  const forward = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  function canStandAt(x, z) {
    // All four track corners must be on solid, roughly level ground (not in a pit).
    const f = forward(s.yaw);
    const side = new THREE.Vector3(f.z, 0, -f.x);
    for (const [a, b] of [[2, 1.5], [2, -1.5], [-2, 1.5], [-2, -1.5]]) {
      const h = terrain.heightAt(x + f.x * a + side.x * b, z + f.z * a + side.z * b);
      if (h < -0.25 || h > 0.6) return false;
    }
    return true;
  }

  function drive(dt, move, turn) {
    if (turn) s.yaw += turn * TURN_SPEED * dt;
    if (move) {
      const f = forward(s.yaw);
      const nx = s.x + f.x * move * DRIVE_SPEED * dt;
      const nz = s.z + f.z * move * DRIVE_SPEED * dt;
      if (canStandAt(nx, nz)) {
        s.x = nx;
        s.z = nz;
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

  function update(dt, { job, bucketFull, bucketColor }) {
    // Swing the house toward where the player is looking, at the machine's swing speed.
    const diff = s.targetHouseYaw - s.houseYaw;
    const maxStep = stats().swingSpeed * dt;
    s.houseYaw += Math.max(-maxStep, Math.min(maxStep, diff));

    // Arm pose from the dig job's progress, or the dump animation.
    let target = POSE.carry;
    if (job?.type === 'dig') {
      const p = job.elapsed / job.duration;
      if (p < 0.4) target = lerpPose(POSE.carry, POSE.reach, ease(p / 0.4));
      else if (p < 0.65) target = lerpPose(POSE.reach, POSE.curl, ease((p - 0.4) / 0.25));
      else target = lerpPose(POSE.curl, POSE.carry, ease((p - 0.65) / 0.35));
      s.pose = target;
    } else if (s.dumpT > 0) {
      s.dumpT = Math.max(0, s.dumpT - dt);
      const p = 1 - s.dumpT / DUMP_TIME;
      s.pose = p < 0.5 ? lerpPose(POSE.carry, POSE.dump, ease(p * 2)) : lerpPose(POSE.dump, POSE.carry, ease((p - 0.5) * 2));
    } else {
      s.pose = lerpPose(s.pose, target, Math.min(1, dt * 4));
    }
    model.setBucketLoad(bucketFull, bucketColor);

    const y = terrain.heightAt(s.x, s.z);
    body.setNextKinematicTranslation({ x: s.x, y, z: s.z });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    model.root.position.set(s.x, y, s.z);
    model.root.rotation.y = s.yaw;
    model.house.rotation.y = s.houseYaw;
    model.boomPivot.rotation.z = s.pose[0];
    model.stickPivot.rotation.z = s.pose[1];
    model.bucketPivot.rotation.z = s.pose[2];
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
    swingBy(delta) {
      s.targetHouseYaw += delta;
    },
    startDump() {
      s.dumpT = DUMP_TIME;
    },
    position: () => new THREE.Vector3(s.x, terrain.heightAt(s.x, s.z), s.z),
    yaw: () => s.yaw,
    speed: () => 0,
    // Camera seat in world space.
    seatWorld() {
      model.root.updateMatrixWorld(true);
      return model.house.localToWorld(model.cabSeat.clone());
    },
    placement: () => ({ x: s.x, z: s.z, yaw: s.yaw }),
    radius: 2.6,
    destroy() {
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

// The tractor's tipping trailer. It hangs off the tractor's hitch and follows it the way a
// one-axle trailer really does: it cuts corners inside the tractor's path going forward, and
// it jackknifes if you reverse carelessly (the back goes the opposite way to the wheel).
// The pursuit maths (trailerYawStep) is plain and tested; the rest places the model on the
// ground and keeps a kinematic collider on it so you can't walk through it.
import * as THREE from 'three';
import { buildTrailerModel } from './models.js';

const TIP_ANGLE = 0.78; // radians the bed lifts when tipping
const MAX_HITCH_ANGLE = 1.25; // the trailer can't fold further than this against the tractor

// New heading of a one-axle trailer whose hitch moved by (dx, dz). The axle sits `length`
// behind the hitch along the heading (cos yaw, 0, -sin yaw) and can only roll along it, so
// the heading turns by -(hitch movement across it) / length. Done in small steps.
export function trailerYawStep(yaw, dx, dz, length) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.05));
  let psi = yaw;
  for (let i = 0; i < steps; i++) psi -= ((dx / steps) * Math.sin(psi) + (dz / steps) * Math.cos(psi)) / length;
  return psi;
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createTrailer({ physics, scene, terrain, tier, yaw = 0 }) {
  const { RAPIER, world } = physics;
  const model = buildTrailerModel(tier);
  scene.add(model.root);
  const L = model.axleLength;

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  world.createCollider(RAPIER.ColliderDesc.cuboid(2.0, 0.42, 0.98).setTranslation(0.2, 1.25, 0)
    .setCollisionGroups(0x0002fffb), body);

  const s = { yaw, x: 0, z: 0, y: null, pitch: 0, roll: 0, prev: null, bed: 0, bedSpeed: 0, gate: 0, spin: 0, axle: null };
  const f = new THREE.Vector3();
  const q = new THREE.Quaternion();

  // Put the trailer straight behind a hitch at (x, z) heading `heading`.
  function reset(hx, hz, heading) {
    s.yaw = heading;
    s.prev = { x: hx, z: hz };
    s.axle = null;
    s.y = null;
  }

  function update(dt, { hitch, tractorYaw, unloading, job, fill, color }) {
    if (!s.prev || Math.hypot(hitch.x - s.prev.x, hitch.z - s.prev.z) > 6) reset(hitch.x, hitch.z, s.yaw); // a jump (recovered, placed): don't swing round
    s.yaw = trailerYawStep(s.yaw, hitch.x - s.prev.x, hitch.z - s.prev.z, L);
    s.prev.x = hitch.x;
    s.prev.z = hitch.z;
    // Folded too far: the tractor shoves the trailer round.
    const rel = wrap(tractorYaw - s.yaw);
    if (Math.abs(rel) > MAX_HITCH_ANGLE) s.yaw = tractorYaw - Math.sign(rel) * MAX_HITCH_ANGLE;

    // Axle on the ground, straight behind the hitch along the trailer's heading.
    f.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    s.x = hitch.x - f.x * L;
    s.z = hitch.z - f.z * L;
    const side = { x: f.z, z: -f.x };
    const left = terrain.heightAt(s.x + side.x * 0.8, s.z + side.z * 0.8);
    const right = terrain.heightAt(s.x - side.x * 0.8, s.z - side.z * 0.8);
    const ground = (left + right) / 2;
    const k = Math.min(1, dt * 10);
    s.y = s.y === null ? ground : s.y + (ground - s.y) * k;
    s.roll += (Math.atan2(right - left, 1.6) - s.roll) * k;
    // The drawbar eye is at the hitch's height: the trailer tilts about its axle to reach it.
    const pitch = THREE.MathUtils.clamp((hitch.y - ground - model.eyeLocal.y) / L, -0.5, 0.5);
    s.pitch += (pitch - s.pitch) * k;

    model.root.position.set(s.x, s.y, s.z);
    model.root.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
    model.root.updateMatrixWorld(true);
    q.copy(model.root.quaternion);
    body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });

    // Wheels roll with the distance the axle has moved along the trailer; the bed tips at a
    // steady rate and drops back.
    if (s.axle && Math.hypot(s.x - s.axle.x, s.z - s.axle.z) < 6) {
      s.spin += ((s.x - s.axle.x) * f.x + (s.z - s.axle.z) * f.z) / 0.45;
      for (const w of model.wheels) w.rotation.z = -s.spin;
    }
    s.axle = { x: s.x, z: s.z };
    const target = unloading ? TIP_ANGLE * Math.min(1, (job.elapsed / job.duration) * 1.6) : 0;
    const prev = s.bed;
    if (target > s.bed) s.bed = Math.min(target, s.bed + dt * 0.4);
    else s.bed = Math.max(target, s.bed - dt * 0.25);
    s.bedSpeed = (s.bed - prev) / Math.max(dt, 1e-4);
    model.bedPivot.rotation.z = s.bed; // the front of the bed lifts
    const open = unloading && job.elapsed < job.duration - 0.6 ? 0.5 : 0;
    s.gate += (open - s.gate) * Math.min(1, dt * 4);
    model.tailgatePivot.rotation.z = -s.bed - s.gate; // hangs, and swings open as the load runs out
    model.setLoad(unloading ? fill * (1 - job.elapsed / job.duration) : fill, color);
  }

  return {
    model,
    state: s,
    update,
    reset,
    axleLength: L,
    isOverBed(point, margin = 0.6) {
      const local = model.root.worldToLocal(point.clone());
      return Math.abs(local.x - model.bedCenter.x) <= model.bedHalf.x + margin
        && Math.abs(local.z - model.bedCenter.z) <= model.bedHalf.z + margin;
    },
    bedWorld: () => model.root.localToWorld(model.bedCenter.clone()),
    bedFloorWorldY: () => model.root.localToWorld(new THREE.Vector3(0, model.bedFloorY, 0)).y,
    tailgateWorld: () => model.root.localToWorld(model.tailgateLocal.clone()),
    position: () => new THREE.Vector3(s.x, s.y, s.z),
    destroy() {
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

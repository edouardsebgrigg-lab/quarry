// The site dumper: a small tracked carrier with a skip that tips forward. It's a site machine
// (not road-legal): it can't leave your land. Like the digger it has no physics vehicle, just a
// kinematic body that follows the ground (see trackDrive.js). Sit in it, drive it round your
// field and tip the skip (T) to make a heap, or park it under the digger's bucket.
import * as THREE from 'three';
import { buildDumperModel } from './models.js';
import { createEngineLife } from './engineLife.js';
import { createTrackDrive, TRACKS } from './trackDrive.js';

const TIP_ANGLE = 0.95; // radians the skip tips forward

export function createDumper({ physics, scene, terrain, machine, spawn, stats, live, allowedAt = null, onBlocked = null }) {
  const { RAPIER, world } = physics;
  const model = buildDumperModel(machine.tier);
  scene.add(model.root);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(spawn.x, terrain.heightAt(spawn.x, spawn.z), spawn.z));
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.6, 0.6).setTranslation(0.05, 0.7, 0), body);

  const s = {
    x: spawn.x, z: spawn.z, y: terrain.heightAt(spawn.x, spawn.z), yaw: spawn.yaw ?? 0, pitch: 0, roll: 0,
    vL: 0, vR: 0, sL: 0, sR: 0, tip: 0, tipSpeed: 0, work: 0, idleT: 0,
  };
  const engine = createEngineLife();
  const tracks = createTrackDrive({ model, terrain, spec: TRACKS.dumper, s, engine, stats, allowedAt, onBlocked });
  const quat = new THREE.Quaternion();

  function update(dt, { job, fill, color, occupied }) {
    const m = live?.();
    engine.update(dt, { occupied, broken: !!m?.broken });
    tracks.step(dt);
    tracks.settle(dt);

    // The skip tips at a steady rate, then drops back.
    const unloading = job?.type === 'tip';
    const target = unloading ? TIP_ANGLE * Math.min(1, (job.elapsed / job.duration) * 1.5) : 0;
    const prev = s.tip;
    if (target > s.tip) s.tip = Math.min(target, s.tip + dt * 0.55);
    else s.tip = Math.max(target, s.tip - dt * 0.4);
    s.tipSpeed = (s.tip - prev) / Math.max(dt, 1e-4);
    model.skipPivot.rotation.z = -s.tip; // the back of the skip rises, the front pours
    model.setLoad(unloading ? fill * (1 - Math.min(1, job.elapsed / job.duration * 1.3)) : fill, color);

    s.work = Math.min(1, (tracks.moving() ? 0.7 : 0) + Math.abs(s.tipSpeed) * 0.6);
    s.idleT = s.work > 0.05 || tracks.input.move || tracks.input.turn ? 0 : s.idleT + dt;

    body.setNextKinematicTranslation({ x: s.x, y: s.y, z: s.z });
    body.setNextKinematicRotation({ x: 0, y: Math.sin(s.yaw / 2), z: 0, w: Math.cos(s.yaw / 2) });
    model.root.position.set(s.x, s.y, s.z);
    model.root.rotation.set(s.roll, s.yaw, s.pitch, 'YZX');
  }

  return {
    type: 'dumper',
    carrier: true,
    tracked: true,
    machineId: machine.id,
    model,
    state: s,
    drive: (dt, move, turn) => tracks.drive(move, turn),
    update,
    setCargo() {},
    feel() {
      return {
        engine: engine.state,
        running: engine.running(),
        work: s.work,
        autoIdle: s.idleT > 4,
        travel: (Math.abs(s.vL) + Math.abs(s.vR)) / 2,
        swing: 0,
        digging: false,
        pour: 0,
        phase: '',
        bedAngle: s.tip,
        bedSpeed: s.tipSpeed,
        size: Math.min(1, (stats().mass ?? 1500) / 10000) + 0.2,
      };
    },
    engineOn: () => engine.running(),
    takeEngineEvents: () => engine.takeEvents(),
    position: () => new THREE.Vector3(s.x, s.y, s.z),
    yaw: () => s.yaw,
    quaternion: () => quat.copy(model.root.quaternion).clone(),
    speed: () => (s.vL + s.vR) / 2,
    isOverBed(point, margin = 0.5) {
      const local = model.root.worldToLocal(point.clone());
      return Math.abs(local.x - model.bedCenter.x) <= model.bedHalf.x + margin
        && Math.abs(local.z - model.bedCenter.z) <= model.bedHalf.z + margin;
    },
    bedWorld: () => model.root.localToWorld(model.bedCenter.clone()),
    // A load leaves over the skip's front lip and falls ahead of the machine.
    unload() {
      return { point: model.root.localToWorld(model.lipLocal.clone()), out: { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) } };
    },
    seatWorld() {
      model.root.updateMatrixWorld(true);
      return model.root.localToWorld(model.cabSeat.clone());
    },
    exhaustWorld() {
      model.root.updateMatrixWorld(true);
      return model.root.localToWorld(model.exhaustLocal.clone());
    },
    placement: () => ({ x: s.x, z: s.z, yaw: s.yaw }),
    reset(x, z, yaw) {
      Object.assign(s, { x, z, yaw, y: terrain.heightAt(x, z) });
    },
    radius: 1.9,
    destroy() {
      scene.remove(model.root);
      world.removeRigidBody(body);
    },
  };
}

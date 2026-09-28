// A drivable haul truck: Rapier vehicle physics + model, tipping bed animation.
import * as THREE from 'three';
import { buildTruckModel } from './models.js';
import { createTruckPhysics } from './truckPhysics.js';

const TIP_ANGLE = 0.85; // radians the bed lifts when tipping

export function createTruck({ physics, scene, terrain, machine, spawn, stats }) {
  const model = buildTruckModel(machine.tier);
  scene.add(model.root);
  const y = terrain.heightAt(spawn.x, spawn.z);
  const phys = createTruckPhysics(physics, { x: spawn.x, y, z: spawn.z, yaw: spawn.yaw ?? 0, speedStat: stats().speed });
  const offStep = physics.onBeforeStep((dt) => phys.update(dt));
  let bedAngle = 0;

  const quat = new THREE.Quaternion();
  const tmp = new THREE.Vector3();

  function update(dt, { job, fill, color }) {
    phys.setSpeedStat(stats().speed);
    const p = phys.body.translation();
    const r = phys.body.rotation();
    model.root.position.set(p.x, p.y, p.z);
    model.root.quaternion.set(r.x, r.y, r.z, r.w);

    for (let i = 0; i < 4; i++) {
      const w = model.wheels[i];
      const susp = phys.vehicle.wheelSuspensionLength(i) ?? 0.45;
      w.steerGroup.position.y = -0.3 - susp;
      w.steerGroup.rotation.y = phys.vehicle.wheelSteering(i) ?? 0;
      w.spin.rotation.z = -(phys.vehicle.wheelRotation(i) ?? 0);
    }

    // Bed rises while tipping, then settles back down.
    const target = job?.type === 'tip' ? TIP_ANGLE * Math.min(1, (job.elapsed / job.duration) * 1.6) : 0;
    bedAngle += (target - bedAngle) * Math.min(1, dt * (target > bedAngle ? 6 : 2.5));
    model.bedPivot.rotation.z = bedAngle; // hinge at the back: the front of the bed lifts
    model.setLoad(job?.type === 'tip' ? fill * (1 - job.elapsed / job.duration) : fill, color);
  }

  return {
    type: 'truck',
    machineId: machine.id,
    model,
    phys,
    control: phys.control,
    update,
    setCargo: (t) => phys.setCargo(t),
    position: () => {
      const p = phys.body.translation();
      return new THREE.Vector3(p.x, p.y, p.z);
    },
    yaw() {
      const r = phys.body.rotation();
      quat.set(r.x, r.y, r.z, r.w);
      tmp.set(1, 0, 0).applyQuaternion(quat);
      return Math.atan2(-tmp.z, tmp.x);
    },
    quaternion() {
      const r = phys.body.rotation();
      return quat.set(r.x, r.y, r.z, r.w).clone();
    },
    speed: () => phys.speed(),
    // Is a world point over this truck's bed?
    isOverBed(point, margin = 0.6) {
      const local = model.root.worldToLocal(point.clone());
      return Math.abs(local.x - model.bedCenter.x) <= model.bedHalf.x + margin
        && Math.abs(local.z - model.bedCenter.z) <= model.bedHalf.z + margin;
    },
    bedWorld() {
      return model.root.localToWorld(model.bedCenter.clone());
    },
    seatWorld() {
      return model.root.localToWorld(model.cabSeat.clone());
    },
    placement() {
      const p = phys.body.translation();
      return { x: p.x, z: p.z, yaw: this.yaw() };
    },
    recover() {
      const p = phys.body.translation();
      phys.reset(p.x, Math.max(0, terrain.heightAt(p.x, p.z)), p.z, this.yaw());
    },
    radius: 3.4,
    destroy() {
      offStep();
      phys.destroy();
      scene.remove(model.root);
    },
  };
}

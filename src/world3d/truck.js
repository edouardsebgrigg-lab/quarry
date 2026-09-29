// A drivable road vehicle: the tipper truck or your pickup. Rapier vehicle physics + model,
// engine start/stop, brake lights, and unloading: the truck's bed tips; the pickup's tailgate
// drops while its load is shovelled off. `feel()` reports what the sound and camera need.
import * as THREE from 'three';
import { buildTruckModel, buildPickupModel } from './models.js';
import { createTruckPhysics, PICKUP, TRUCK_SHAPE } from './truckPhysics.js';
import { createEngineLife } from './engineLife.js';

const TIP_ANGLE = 0.85; // radians the bed lifts when tipping
const TAILGATE_OPEN = 1.5; // radians the pickup's tailgate drops

// Brake-light meshes: turned up when braking. Returns a setter.
function brakeLights(root) {
  const mats = [];
  root.traverse((o) => {
    if (o.isMesh && /taillight/i.test(o.name)) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      o.material = list.map((m) => m.clone());
      if (!Array.isArray(o.material) || o.material.length === 1) o.material = o.material[0];
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m.emissive) {
          m.emissive.set(0xff1a0a);
          mats.push(m);
        }
      }
    }
  });
  return (on) => {
    for (const m of mats) m.emissiveIntensity = on ? 3.2 : 0.25;
  };
}

export function createTruck({ physics, scene, terrain, machine, spawn, stats, live, surfaceAt }) {
  const kind = machine.type; // 'truck' or 'pickup'
  const profile = kind === 'pickup' ? PICKUP : null;
  const shape = profile?.shape ?? TRUCK_SHAPE;
  const model = kind === 'pickup' ? buildPickupModel(PICKUP.tuning.rideHeight) : buildTruckModel(machine.tier);
  scene.add(model.root);
  const y = terrain.heightAt(spawn.x, spawn.z);
  const st = stats();
  const phys = createTruckPhysics(physics, {
    x: spawn.x, y, z: spawn.z, yaw: spawn.yaw ?? 0, speedStat: st.speed,
    mass: st.mass ?? 5000, power: st.enginePower ?? 90, surfaceAt, profile,
  });
  phys.setEngineRunning(false);
  const offStep = physics.onBeforeStep((dt) => phys.update(dt));
  const setBrakeLights = brakeLights(model.root);
  let bedAngle = 0;
  let bedSpeed = 0;
  let gate = 0; // tailgate angle
  let lightsOn = null;

  const engine = createEngineLife();

  const quat = new THREE.Quaternion();
  const tmp = new THREE.Vector3();

  function update(dt, { job, fill, color, occupied }) {
    const m = live();
    phys.setSpeedStat(stats().speed);
    phys.setCondition(m?.condition ?? 100);

    engine.update(dt, { occupied, broken: !!m?.broken });
    phys.setEngineRunning(engine.running());

    // ---- body and wheels
    const p = phys.body.translation();
    const r = phys.body.rotation();
    model.root.position.set(p.x, p.y, p.z);
    model.root.quaternion.set(r.x, r.y, r.z, r.w);
    for (let i = 0; i < 4; i++) {
      const w = model.wheels[i];
      const susp = phys.vehicle.wheelSuspensionLength(i) ?? shape.suspensionRest;
      w.steerGroup.position.y = shape.wheelY - susp + (model.wheelOffsetY ?? 0);
      w.steerGroup.rotation.y = phys.vehicle.wheelSteering(i) ?? 0;
      w.spin.rotation.z = -(phys.vehicle.wheelRotation(i) ?? 0);
    }

    const tel = phys.telemetry();
    if (tel.braking !== lightsOn) {
      lightsOn = tel.braking;
      setBrakeLights(lightsOn && engine.state !== 'off');
    }

    const unloading = job?.type === 'tip';
    if (model.bedPivot) {
      // Bed: the ram pushes it up at a steady rate, then it drops back down.
      const target = unloading ? TIP_ANGLE * Math.min(1, (job.elapsed / job.duration) * 1.6) : 0;
      const prev = bedAngle;
      if (target > bedAngle) bedAngle = Math.min(target, bedAngle + dt * 0.45);
      else bedAngle = Math.max(target, bedAngle - dt * 0.28);
      bedSpeed = (bedAngle - prev) / Math.max(dt, 1e-4);
      model.bedPivot.rotation.z = bedAngle; // hinge at the back: the front of the bed lifts
    }
    if (model.tailgate) {
      // Tailgate: dropped while the load is shovelled off the back.
      const target = unloading && job.elapsed < job.duration - 0.6 ? TAILGATE_OPEN : 0;
      gate += Math.sign(target - gate) * Math.min(Math.abs(target - gate), dt * 3.5);
      model.tailgate.rotation.z = gate;
    }
    model.setLoad(unloading ? fill * (1 - job.elapsed / job.duration) : fill, color);
  }

  return {
    type: kind,
    road: true, // a road vehicle (driven with the truck controls)
    machineId: machine.id,
    model,
    phys,
    control: phys.control,
    update,
    setCargo: (t) => phys.setCargo(t),
    // Everything the sound and camera react to.
    feel() {
      const tel = phys.telemetry();
      return {
        ...tel,
        engine: engine.state,
        speed: phys.speed(),
        bedSpeed,
        bedAngle,
        tailgate: gate,
        size: Math.min(1, (stats().mass ?? 5000) / 8000),
      };
    },
    engineOn: () => engine.running(),
    // Engine starts and stops since last asked (for the sound).
    takeEngineEvents: () => engine.takeEvents(),
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
    exhaustWorld() {
      // Truck: the stack behind the cab, right side. Pickup: the tailpipe under the back.
      return model.root.localToWorld((model.exhaustLocal ?? tmp.set(1.45, 1.55, 1.0)).clone());
    },
    // Where you'd tip a barrow in or shovel off: the middle of the tailgate (pickup), or the
    // back of the bed (truck).
    tailgateWorld() {
      return model.root.localToWorld((model.tailgateLocal ?? new THREE.Vector3(-3.2, 0.3, 0)).clone());
    },
    bedFloorWorldY() {
      return model.root.localToWorld(new THREE.Vector3(model.bedCenter.x, model.bedFloorY ?? 0.2, 0)).y;
    },
    placement() {
      const p = phys.body.translation();
      return { x: p.x, z: p.z, yaw: this.yaw() };
    },
    recover() {
      const p = phys.body.translation();
      phys.reset(p.x, terrain.heightAt(p.x, p.z), p.z, this.yaw());
    },
    radius: kind === 'pickup' ? 2.8 : 3.4,
    destroy() {
      offStep();
      phys.destroy();
      scene.remove(model.root);
    },
  };
}

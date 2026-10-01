// A drivable road vehicle: the tipper truck, your pickup, or the tractor with its trailer.
// Rapier vehicle physics + model, engine start/stop, brake lights, and unloading: the truck's
// bed tips; the pickup's tailgate drops while its load is shovelled off; the tractor's trailer
// (trailer.js) tips. `feel()` reports what the sound and camera need.
import * as THREE from 'three';
import { buildTruckModel, buildPickupModel, buildTractorModel } from './models.js';
import { createTruckPhysics, TRUCK_SHAPE } from './truckPhysics.js';
import { createEngineLife } from './engineLife.js';
import { createTrailer } from './trailer.js';
import { fleetProfile } from './fleetProfiles.js';
import { buildMobilityModel, upgradePickupModel } from './fleetVariants.js';

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

export function createTruck({ physics, scene, terrain, machine, spawn, stats, live, liveTrailer = null, surfaceAt }) {
  const kind = machine.type; // 'truck', 'pickup' or 'tractor'
  const initial = stats();
  const profile = fleetProfile(kind, initial);
  const shape = profile?.shape ?? TRUCK_SHAPE;
  const rideHeight = profile?.tuning?.rideHeight;
  const model = kind === 'pickup' ? buildPickupModel(rideHeight)
    : kind === 'fourByFour' ? upgradePickupModel(buildPickupModel(rideHeight))
    : kind === 'tractor' ? buildTractorModel(machine.tier, rideHeight, initial)
      : ['quad','buggy','fourByFour','serviceVan'].includes(kind) ? buildMobilityModel(kind, rideHeight, shape) : buildTruckModel(machine.tier);
  scene.add(model.root);
  const y = terrain.heightAt(spawn.x, spawn.z);
  const st = stats();
  const phys = createTruckPhysics(physics, {
    x: spawn.x, y, z: spawn.z, yaw: spawn.yaw ?? 0, speedStat: st.speed,
    mass: st.mass ?? 5000, power: st.enginePower ?? 90, surfaceAt, profile,
  });
  phys.setEngineRunning(false);
  const trailerEntity = liveTrailer?.();
  const trailer = kind === 'tractor' && trailerEntity
    ? createTrailer({ physics, scene, terrain, tier: trailerEntity.tier, stats: initial.trailerStats ?? {}, yaw: spawn.trailerYaw ?? spawn.yaw ?? 0 })
    : null;
  const offStep = physics.onBeforeStep((dt) => phys.update(dt));
  const setBrakeLights = brakeLights(model.root);
  let bedAngle = 0;
  let bedSpeed = 0;
  let gate = 0; // tailgate angle
  let lightsOn = null;

  const engine = createEngineLife();

  const quat = new THREE.Quaternion();
  const tmp = new THREE.Vector3();

  function yawNow() {
    const r = phys.body.rotation();
    quat.set(r.x, r.y, r.z, r.w);
    tmp.set(1, 0, 0).applyQuaternion(quat);
    return Math.atan2(-tmp.z, tmp.x);
  }

  function update(dt, { job, fill, color, occupied }) {
    const m = live();
    const currentStats = stats();
    phys.setSpeedStat(currentStats.overloaded ? 0.25 : Math.min(currentStats.speed, (currentStats.trailerStats?.roadSpeed ?? Infinity) / 5.04));
    phys.setCondition(m?.condition ?? 100);
    phys.setTowBraking?.(trailer ? stats().trailerBraked : false);

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
      const wy = Array.isArray(shape.wheelY) ? shape.wheelY[i] : shape.wheelY;
      w.steerGroup.position.y = (wy - susp) / (model.wheelScale ?? 1) + (model.wheelOffsetY ?? 0);
      w.steerGroup.rotation.y = phys.vehicle.wheelSteering(i) ?? 0;
      w.spin.rotation.z = -(phys.vehicle.wheelRotation(i) ?? 0);
    }

    const tel = phys.telemetry();
    if (tel.braking !== lightsOn) {
      lightsOn = tel.braking;
      setBrakeLights(lightsOn && engine.state !== 'off');
    }

    const unloading = job?.type === 'tip';
    if (trailer) {
      model.root.updateMatrixWorld(true);
      const hitch = model.root.localToWorld(model.hitchLocal.clone());
      trailer.update(dt, { hitch, tractorYaw: yawNow(), unloading, job, fill, color });
      if (trailerEntity) trailerEntity.parkedPose = { x: trailer.state.x, z: trailer.state.z, yaw: trailer.state.yaw };
      bedAngle = trailer.state.bed;
      bedSpeed = trailer.state.bedSpeed;
      gate = trailer.state.gate;
    }
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
    if (model.setLoad) model.setLoad(unloading ? fill * (1 - job.elapsed / job.duration) : fill, color);
  }

  // The bed the load sits in: the truck's own, or the tractor's trailer.
  const bed = trailer ?? {
    isOverBed(point, margin = 0.6) {
      if (!model.bedCenter || (kind === 'tractor' && !trailer)) return false;
      const local = model.root.worldToLocal(point.clone());
      return Math.abs(local.x - model.bedCenter.x) <= model.bedHalf.x + margin
        && Math.abs(local.z - model.bedCenter.z) <= model.bedHalf.z + margin;
    },
    bedWorld: () => model.root.localToWorld((model.bedCenter ?? new THREE.Vector3()).clone()),
    // Where you'd tip a barrow in or shovel off: the middle of the tailgate (pickup), or the
    // back of the bed (truck).
    tailgateWorld: () => model.root.localToWorld((model.tailgateLocal ?? new THREE.Vector3(-3.2, 0.3, 0)).clone()),
    bedFloorWorldY: () => model.root.localToWorld(new THREE.Vector3(model.bedCenter?.x ?? 0, model.bedFloorY ?? 0.2, 0)).y,
  };

  return {
    type: kind,
    road: true, // a road vehicle (driven with the truck controls)
    carrier: kind === 'tractor' ? !!trailer : (st.capacity ?? 0) > 0, // carries a load in a bed
    machineId: machine.id,
    model,
    phys,
    trailer,
    control: phys.control,
    update,
    setCargo: (t) => phys.setCargo(t + (trailer ? (stats().trailerMass ?? 0) / 1000 : 0)),
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
    yaw: yawNow,
    quaternion() {
      const r = phys.body.rotation();
      return quat.set(r.x, r.y, r.z, r.w).clone();
    },
    speed: () => phys.speed(),
    // Is a world point over this vehicle's bed?
    isOverBed: (point, margin) => bed.isOverBed(point, margin),
    bedWorld: () => bed.bedWorld(),
    seatWorld() {
      return model.root.localToWorld(model.cabSeat.clone());
    },
    exhaustWorld() {
      // Truck: the stack behind the cab, right side. Pickup: the tailpipe under the back.
      return model.root.localToWorld((model.exhaustLocal ?? tmp.set(1.45, 1.55, 1.0)).clone());
    },
    tailgateWorld: () => bed.tailgateWorld(),
    bedFloorWorldY: () => bed.bedFloorWorldY(),
    // Where a load leaves the vehicle and which way it falls (out of the back).
    unload() {
      const heading = trailer ? trailer.state.yaw : yawNow();
      return { point: bed.tailgateWorld(), out: { x: -Math.cos(heading), z: Math.sin(heading) } };
    },
    placement() {
      const p = phys.body.translation();
      return { x: p.x, z: p.z, yaw: yawNow(), trailerYaw: trailer?.state.yaw };
    },
    trailerPlacement() {
      return trailer ? { x: trailer.state.x, z: trailer.state.z, yaw: trailer.state.yaw } : null;
    },
    // Put it (and its trailer) upright and straight at a spot.
    reset(x, z, yaw) {
      phys.reset(x, terrain.heightAt(x, z), z, yaw);
      trailer?.reset(x + Math.cos(yaw) * model.hitchLocal.x, z - Math.sin(yaw) * model.hitchLocal.x, yaw);
    },
    recover() {
      const p = phys.body.translation();
      this.reset(p.x, p.z, yawNow());
    },
    radius: kind === 'pickup' ? 2.8 : kind === 'tractor' ? 2.4 : 3.4,
    destroy() {
      offStep();
      phys.destroy();
      trailer?.destroy();
      scene.remove(model.root);
    },
  };
}

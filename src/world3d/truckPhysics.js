// Haul truck driving physics (Rapier ray-cast vehicle). No graphics here, so it can be
// tested headless. The chassis faces +X in its local space.

export const TRUCK_SHAPE = {
  halfLength: 3.2,
  halfHeight: 0.55,
  halfWidth: 1.2,
  wheelRadius: 0.55,
  wheelX: [2.1, 2.1, -2.0, -2.0],
  wheelZ: [-1.05, 1.05, -1.05, 1.05],
  wheelY: -0.3,
  suspensionRest: 0.45,
};

const TUNING = {
  baseMass: 1000,
  massPerTonne: 260, // loaded trucks are heavier: slower to speed up and to stop
  topSpeedPerStat: 1.4, // top speed (m/s) = truck "speed" stat x this
  accel: 3.2, // engine force per unit of empty mass
  brake: 7, // braking deceleration, m/s² (less when loaded)
  coast: 0.5, // slowing down with no pedal pressed, m/s²
  maxSteer: 0.55,
  stiffness: 28,
  compression: 2.8,
  relaxation: 3.5,
  frictionSlip: 2.2,
};

function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

export function createTruckPhysics({ RAPIER, world }, { x, y, z, yaw = 0, speedStat = 8 }) {
  const S = TRUCK_SHAPE;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 1.3, z)
      .setRotation(yawQuat(yaw))
      .setAngularDamping(0.8)
      .setLinearDamping(0.02)
      .setCanSleep(false),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(S.halfLength, S.halfHeight, S.halfWidth)
      .setTranslation(0, 0.25, 0)
      .setMass(TUNING.baseMass)
      .setFriction(0.6),
    body,
  );
  const vehicle = world.createVehicleController(body);
  for (let i = 0; i < 4; i++) {
    vehicle.addWheel({ x: S.wheelX[i], y: S.wheelY, z: S.wheelZ[i] }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, S.suspensionRest, S.wheelRadius);
    vehicle.setWheelSuspensionStiffness(i, TUNING.stiffness);
    vehicle.setWheelSuspensionCompression(i, TUNING.compression);
    vehicle.setWheelSuspensionRelaxation(i, TUNING.relaxation);
    vehicle.setWheelFrictionSlip(i, TUNING.frictionSlip);
    vehicle.setWheelMaxSuspensionForce(i, 1e6);
    vehicle.setWheelMaxSuspensionTravel(i, 0.4);
  }

  let cargoTonnes = 0;
  let steer = 0;
  let topSpeed = speedStat * TUNING.topSpeedPerStat;
  const control = { throttle: 0, steer: 0, handbrake: false };

  function mass() {
    return TUNING.baseMass + cargoTonnes * TUNING.massPerTonne;
  }

  function update(dt) {
    const v = vehicle.currentVehicleSpeed();
    const force = TUNING.accel * TUNING.baseMass;
    let engine = 0;
    let brake = 0;
    const t = control.throttle;
    if (t > 0) {
      if (v < -0.5) brake = TUNING.brake * TUNING.baseMass * t;
      else if (v < topSpeed) engine = force * t;
    } else if (t < 0) {
      if (v > 0.5) brake = TUNING.brake * TUNING.baseMass * -t;
      else if (v > -topSpeed * 0.4) engine = force * 0.6 * t;
    } else {
      brake = TUNING.coast * mass(); // engine braking / rolling resistance
    }
    if (control.handbrake) brake = TUNING.brake * TUNING.baseMass * 1.3;

    // Steering gets gentler at speed so trucks don't flip.
    const maxSteer = TUNING.maxSteer / (1 + Math.abs(v) * 0.06);
    const target = control.steer * maxSteer;
    steer += Math.sign(target - steer) * Math.min(Math.abs(target - steer), dt * 1.6);

    for (let i = 0; i < 4; i++) {
      vehicle.setWheelSteering(i, i < 2 ? steer : 0);
      vehicle.setWheelEngineForce(i, i >= 2 ? engine / 2 : 0);
      // Rapier brakes are an impulse limit per step: force x dt.
      vehicle.setWheelBrake(i, (brake / 4) * dt);
    }
    vehicle.updateVehicle(dt);
  }

  return {
    body,
    collider,
    vehicle,
    control,
    update,
    speed: () => vehicle.currentVehicleSpeed(),
    setCargo(tonnes) {
      if (Math.abs(tonnes - cargoTonnes) < 0.01) return;
      cargoTonnes = tonnes;
      collider.setMass(mass());
    },
    setSpeedStat(s) {
      topSpeed = s * TUNING.topSpeedPerStat;
    },
    steering: () => steer,
    // Put the truck back on its wheels at a spot (for "recover stuck vehicle").
    reset(px, py, pz, yaw) {
      body.setTranslation({ x: px, y: py + 1.4, z: pz }, true);
      body.setRotation(yawQuat(yaw), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    destroy() {
      world.removeVehicleController(vehicle);
      world.removeRigidBody(body);
    },
  };
}

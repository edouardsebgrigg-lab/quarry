// Haul truck driving physics (Rapier ray-cast vehicle) with a simulated drivetrain:
// a diesel engine with a torque curve, an automatic gearbox that pauses to shift, engine
// braking, air brakes, rolling resistance that depends on the ground, and cargo that sits
// in the bed (so a loaded truck is heavier at the back and higher up).
// No graphics here, so it can be tested headless. The chassis faces +X in its local space.
// Units are real: kilograms, newtons, metres, seconds.

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

export const ENGINE = {
  idleRpm: 700,
  maxRpm: 2500, // governed
  // Torque as a share of peak, by rpm: old diesels pull hard low down.
  curve: [[500, 0.55], [800, 0.78], [1200, 0.96], [1500, 1.0], [1900, 0.95], [2300, 0.82], [2500, 0.7], [2700, 0]],
  gears: [3.4, 2.15, 1.45, 1.0],
  reverse: 3.6,
  efficiency: 0.85,
  shiftTime: 0.55, // no drive while the clutch is out
  upshiftAt: 0.9, // share of max rpm
  downshiftAt: 1100,
  engineBrake: 0.22, // share of peak torque, dragging when off the throttle
  revRate: 1, // how quickly revs rise and fall (a heavy flywheel is slower)
};

const TUNING = {
  topSpeedPerStat: 1.4, // top speed (m/s) = truck "speed" stat x this
  brakeDecel: 6.5, // full brake on an empty truck, m/s²; a loaded one stops slower
  frontBrakeShare: 0.6,
  maxSteer: 0.6,
  steerRate: 0.9, // rad/s at the wheels
  returnRate: 1.6, // self-centring
  wheelbase: 4.1,
  track: 2.1,
  stiffness: 30, // per wheel, x chassis mass: ~1.7 Hz body bounce
  compression: 3.2,
  relaxation: 4.2,
  dragArea: 5.5, // Cd x frontal area, m²
};

// Default ground: dry tarmac.
const DEFAULT_SURFACE = { grip: 1.0, roll: 0.012, name: 'asphalt' };

function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function torqueShare(rpm) {
  const c = ENGINE.curve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const [r0, t0] = c[i - 1];
      const [r1, t1] = c[i];
      return t0 + ((t1 - t0) * (rpm - r0)) / (r1 - r0);
    }
  }
  return 0;
}

// Peak torque (N·m) for an engine of `powerKw`, making its power at about 1900 rpm.
export function peakTorque(powerKw) {
  return (powerKw * 1000) / ((1900 * 2 * Math.PI) / 60 * torqueShare(1900));
}

export function createTruckPhysics({ RAPIER, world }, {
  x, y, z, yaw = 0, speedStat = 8, mass = 5000, power = 90, surfaceAt = null,
}) {
  const S = TRUCK_SHAPE;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + 1.3, z)
      .setRotation(yawQuat(yaw))
      .setAngularDamping(0.15)
      .setLinearDamping(0)
      .setCanSleep(false),
  );
  // Mass sits low and forward (engine, axles); the box is just the collision shape.
  const box = (m) => ({
    x: (m / 12) * ((2 * S.halfHeight) ** 2 + (2 * S.halfWidth) ** 2),
    y: (m / 12) * ((2 * S.halfLength) ** 2 + (2 * S.halfWidth) ** 2),
    z: (m / 12) * ((2 * S.halfLength) ** 2 + (2 * S.halfHeight) ** 2),
  });
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(S.halfLength, S.halfHeight, S.halfWidth)
      .setTranslation(0, 0.25, 0)
      .setMassProperties(mass, { x: 0.45, y: -0.35, z: 0 }, box(mass), { x: 0, y: 0, z: 0, w: 1 })
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
    vehicle.setWheelFrictionSlip(i, 1);
    vehicle.setWheelSideFrictionStiffness(i, 1);
    vehicle.setWheelMaxSuspensionForce(i, 1e7);
    vehicle.setWheelMaxSuspensionTravel(i, 0.35);
  }

  let cargoTonnes = 0;
  let steer = 0;
  let topSpeed = speedStat * TUNING.topSpeedPerStat;
  let maxTorque = peakTorque(power);
  let finalDrive = 1;
  let condition = 100;
  const control = { throttle: 0, steer: 0, handbrake: false };
  const eng = {
    running: true,
    rpm: ENGINE.idleRpm,
    gear: 1, // 1..n forward, -1 reverse
    shiftT: 0, // counts down while changing gear
    load: 0, // 0..1 how hard the engine is working
    misfire: 0,
  };
  const out = {
    braking: false, reversing: false, shifted: 0, surface: DEFAULT_SURFACE.name,
    slip: 0, bump: 0, airborne: false,
  };
  const lastSusp = [0, 0, 0, 0];

  function updateFinalDrive() {
    // Top gear at max rpm = top speed.
    const wheelRadS = topSpeed / S.wheelRadius;
    finalDrive = ((ENGINE.maxRpm * 2 * Math.PI) / 60) / (wheelRadS * ENGINE.gears[ENGINE.gears.length - 1]);
  }
  updateFinalDrive();

  function totalMass() {
    return mass + cargoTonnes * 1000;
  }

  const gearRatio = (g) => (g < 0 ? ENGINE.reverse : ENGINE.gears[g - 1]) * finalDrive;
  const wheelRpmAt = (v, g) => (Math.abs(v) / S.wheelRadius) * gearRatio(g) * (60 / (2 * Math.PI));

  function surfaceUnder(i) {
    if (!surfaceAt || !vehicle.wheelIsInContact(i)) return DEFAULT_SURFACE;
    const p = vehicle.wheelContactPoint(i);
    return p ? surfaceAt(p.x, p.z) : DEFAULT_SURFACE;
  }

  function update(dt) {
    const v = vehicle.currentVehicleSpeed();
    const g = 9.81;
    const m = totalMass();
    const throttleIn = eng.running ? control.throttle : 0;

    // ---- pedals: forward/back pick a direction, the other pedal brakes
    let throttle = 0;
    let brake = 0;
    if (throttleIn > 0) {
      if (eng.gear < 0 && v < -0.4) brake = throttleIn;
      else {
        if (eng.gear < 0 && Math.abs(v) <= 0.4) eng.gear = 1;
        throttle = throttleIn;
      }
    } else if (throttleIn < 0) {
      if (eng.gear > 0 && v > 0.4) brake = -throttleIn;
      else {
        if (eng.gear > 0 && Math.abs(v) <= 0.4) eng.gear = -1;
        throttle = -throttleIn;
      }
    }
    if (!eng.running && Math.abs(v) < 0.3) brake = 1; // parked in gear
    // No pedal at walking pace: the driver rests on the brake, so it doesn't roll away on slopes.
    if (throttle === 0 && brake === 0 && Math.abs(v) < 2.5) brake = 0.15 + 0.35 * (1 - Math.abs(v) / 2.5);

    // ---- automatic gearbox
    eng.shiftT = Math.max(0, eng.shiftT - dt);
    if (eng.gear > 0 && eng.shiftT === 0) {
      const rpm = wheelRpmAt(v, eng.gear);
      if (rpm > ENGINE.maxRpm * ENGINE.upshiftAt && eng.gear < ENGINE.gears.length && throttle > 0.1) {
        eng.gear += 1;
        eng.shiftT = ENGINE.shiftTime;
        out.shifted += 1;
      } else if (eng.gear > 1 && rpm < ENGINE.downshiftAt) {
        eng.gear -= 1;
        eng.shiftT = ENGINE.shiftTime * 0.7;
        out.shifted += 1;
      }
    }

    // ---- engine speed: locked to the wheels in gear, slipping the clutch when pulling away
    const coupled = eng.shiftT === 0;
    const wheelRpm = wheelRpmAt(v, eng.gear);
    let target;
    if (!eng.running) target = 0;
    else if (!coupled) target = Math.max(ENGINE.idleRpm, wheelRpmAt(v, eng.gear) * 0.9);
    else target = Math.max(wheelRpm, ENGINE.idleRpm + throttle * 650 * (wheelRpm < 1300 ? 1 : 0));
    target = Math.min(target, ENGINE.maxRpm + 120);
    const rate = (target > eng.rpm ? 900 + throttle * 2600 : 1400) * ENGINE.revRate;
    eng.rpm += Math.sign(target - eng.rpm) * Math.min(Math.abs(target - eng.rpm), rate * dt);

    // ---- torque at the wheels
    const power = (0.72 + 0.28 * (condition / 100)) * (eng.misfire > 0 ? 0.55 : 1);
    if (condition < 55 && Math.random() < dt * (55 - condition) * 0.02 * (0.3 + throttle)) eng.misfire = 0.12;
    eng.misfire = Math.max(0, eng.misfire - dt);
    let engineTorque = 0;
    if (eng.running && coupled) {
      if (throttle > 0) {
        const governor = eng.rpm > ENGINE.maxRpm ? Math.max(0, 1 - (eng.rpm - ENGINE.maxRpm) / 120) : 1;
        engineTorque = throttle * torqueShare(eng.rpm) * maxTorque * power * governor;
      }
    }
    const dir = eng.gear < 0 ? -1 : 1;
    const driveForce = (engineTorque * gearRatio(eng.gear) * ENGINE.efficiency) / S.wheelRadius * dir;
    eng.load = eng.running ? throttle * (coupled ? 1 : 0.3) : 0;

    // Engine braking when off the throttle in gear (a drag through the driven wheels).
    const engineDrag = eng.running && coupled && throttle === 0 && Math.abs(v) > 0.5
      ? (ENGINE.engineBrake * maxTorque * gearRatio(eng.gear) * (eng.rpm / ENGINE.maxRpm)) / S.wheelRadius
      : 0;

    // ---- per-wheel forces
    const brakeForce = brake * TUNING.brakeDecel * mass; // fixed brake power: loaded trucks stop slower
    let grip = 0;
    for (let i = 0; i < 4; i++) {
      const surf = surfaceUnder(i);
      grip += surf.grip / 4;
      if (i === 0) out.surface = surf.name;
      vehicle.setWheelFrictionSlip(i, surf.grip);
      vehicle.setWheelSideFrictionStiffness(i, 0.6 + 0.4 * surf.grip);
      const front = i < 2;
      const load = (m * g) / 4;
      const rolling = surf.roll * load;
      let brakeHere = rolling + (front ? TUNING.frontBrakeShare : 1 - TUNING.frontBrakeShare) * brakeForce / 2;
      if (!front && control.handbrake) brakeHere += TUNING.brakeDecel * mass * 0.35;
      if (!front && throttle === 0) brakeHere += engineDrag / 2;
      let engineHere = 0;
      if (!front && driveForce !== 0 && !control.handbrake) {
        // Driven wheels: net of rolling resistance (Rapier ignores the brake while driving).
        engineHere = driveForce / 2 - Math.sign(v || dir) * rolling;
        brakeHere = 0;
      }
      vehicle.setWheelEngineForce(i, engineHere);
      // Rapier brakes are an impulse limit per step: force x dt.
      vehicle.setWheelBrake(i, brakeHere * dt);
    }

    // ---- steering: speed-sensitive, with Ackermann (the inside wheel turns more)
    const maxSteer = TUNING.maxSteer / (1 + Math.abs(v) * 0.07);
    const targetSteer = control.steer * maxSteer;
    const rateNow = Math.abs(targetSteer) < Math.abs(steer) ? TUNING.returnRate : TUNING.steerRate;
    steer += Math.sign(targetSteer - steer) * Math.min(Math.abs(targetSteer - steer), dt * rateNow);
    let left = steer;
    let right = steer;
    if (Math.abs(steer) > 1e-3) {
      const R = TUNING.wheelbase / Math.tan(Math.abs(steer));
      const inner = Math.atan(TUNING.wheelbase / (R - TUNING.track / 2));
      const outer = Math.atan(TUNING.wheelbase / (R + TUNING.track / 2));
      // Wheel 0 is front-left (-Z); turning left (steer > 0) makes it the inside wheel.
      left = Math.sign(steer) * (steer > 0 ? inner : outer);
      right = Math.sign(steer) * (steer > 0 ? outer : inner);
    }
    vehicle.setWheelSteering(0, left);
    vehicle.setWheelSteering(1, right);
    vehicle.setWheelSteering(2, 0);
    vehicle.setWheelSteering(3, 0);

    // ---- air resistance
    const lv = body.linvel();
    const sp = Math.hypot(lv.x, lv.y, lv.z);
    if (sp > 0.1) {
      const f = 0.5 * 1.2 * TUNING.dragArea * sp * sp * dt;
      body.applyImpulse({ x: (-lv.x / sp) * f, y: (-lv.y / sp) * f, z: (-lv.z / sp) * f }, true);
    }

    vehicle.updateVehicle(dt);

    // ---- what the sound and camera need
    let contact = 0;
    let bump = 0;
    let side = 0;
    for (let i = 0; i < 4; i++) {
      if (vehicle.wheelIsInContact(i)) contact += 1;
      const l = vehicle.wheelSuspensionLength(i) ?? 0;
      bump = Math.max(bump, Math.abs(l - lastSusp[i]) / dt);
      lastSusp[i] = l;
      side += Math.abs(vehicle.wheelSideImpulse(i) ?? 0);
    }
    out.airborne = contact === 0;
    out.bump = bump;
    out.slip = Math.min(1, side / (m * g * grip * dt + 1e-6) * 0.8);
    out.braking = (brake > 0.05 && Math.abs(v) > 0.3) || control.handbrake;
    out.reversing = eng.gear < 0 && throttle > 0;
  }

  return {
    body,
    collider,
    vehicle,
    control,
    update,
    speed: () => vehicle.currentVehicleSpeed(),
    // Engine and chassis state, for sound, gauges and camera shake.
    telemetry: () => ({
      rpm: eng.rpm, gear: eng.gear, shifting: eng.shiftT > 0, load: eng.load, running: eng.running,
      misfire: eng.misfire > 0, ...out,
    }),
    setCargo(tonnes) {
      if (Math.abs(tonnes - cargoTonnes) < 0.01) return;
      cargoTonnes = tonnes;
      // The load sits in the bed: behind and above the chassis centre.
      const cm = tonnes * 1000;
      body.setAdditionalMassProperties(cm, { x: -1.0, y: 0.45, z: 0 },
        { x: cm * 0.35, y: cm * 0.9, z: cm * 0.8 }, { x: 0, y: 0, z: 0, w: 1 }, true);
    },
    setSpeedStat(s) {
      const t = s * TUNING.topSpeedPerStat;
      if (t !== topSpeed) {
        topSpeed = t;
        updateFinalDrive();
      }
    },
    setPower(kw) {
      maxTorque = peakTorque(kw);
    },
    setCondition(c) {
      condition = c;
    },
    setEngineRunning(on) {
      // A cold diesel catches with a flare of revs, then settles to idle.
      if (on && !eng.running) eng.rpm = 1250;
      eng.running = on;
    },
    steering: () => steer,
    // Put the truck back on its wheels at a spot (for "recover stuck vehicle").
    reset(px, py, pz, yawAngle) {
      body.setTranslation({ x: px, y: py + 1.4, z: pz }, true);
      body.setRotation(yawQuat(yawAngle), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    },
    destroy() {
      world.removeVehicleController(vehicle);
      world.removeRigidBody(body);
    },
  };
}

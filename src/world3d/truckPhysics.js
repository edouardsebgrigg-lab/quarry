// Road vehicle driving physics (Rapier ray-cast vehicle) with a simulated drivetrain:
// a diesel engine with a torque curve, an automatic gearbox that pauses to shift, engine
// braking, air brakes, rolling resistance that depends on the ground, and cargo that sits
// in the bed (so a loaded truck is heavier at the back and higher up).
// No graphics here, so it can be tested headless. The chassis faces +X in its local space.
// Units are real: kilograms, newtons, metres, seconds. The tipper truck is the default; the
// pickup and the tractor pass their own shape, tuning and engine (see PICKUP and TRACTOR below).
import handling from '../../data/handling.json';
import { createCruiseControl } from './cruiseControl.js';

// Cancel opposite lock at the centering rate, then build the newly requested steering angle.
export function steeringStep(current,target,dt,steerRate,returnRate) {
  const approach=(a,b,amount)=>a+Math.sign(b-a)*Math.min(Math.abs(b-a),amount);
  if(!(dt>0))return current;
  if(current*target<0){
    const centreTime=Math.abs(current)/returnRate;
    if(dt<=centreTime)return approach(current,0,dt*returnRate);
    return approach(0,target,(dt-centreTime)*steerRate);
  }
  return approach(current,target,dt*(Math.abs(target)<Math.abs(current)?returnRate:steerRate));
}

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

export const TUNING = {
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
  rideHeight: 1.3, // body centre above the ground when parked
  colliderY: 0.25, // collision box centre, above the body centre
  massCentre: { x: 0.45, y: -0.35 }, // engine and axles: low and forward
  cargoCentre: { x: -1.0, y: 0.45 }, // where a load sits in the bed
  powerRpm: 1900, // where the engine makes its rated power
  // The ray-cast vehicle applies a tyre's sideways force near the centre of mass, not at the
  // ground, so a body hardly leans in a turn (and the inside wheels hardly unload). This much of
  // the missing roll moment is put back.
  rollTransfer: 0.55,
  slidingGrip: 0.8, // a locked or spinning tyre's grip, as a share of its peak
};

// Your old pickup: small, light and quick, with a petrol straight-six that revs.
export const PICKUP = {
  shape: {
    halfLength: 2.7,
    halfHeight: 0.35,
    halfWidth: 0.9,
    wheelRadius: 0.36,
    wheelX: [1.55, 1.55, -1.55, -1.55],
    wheelZ: [-0.76, 0.76, -0.76, 0.76],
    wheelY: -0.1,
    suspensionRest: 0.32,
  },
  tuning: {
    brakeDecel: 7.5,
    maxSteer: 0.62,
    steerRate: 1.3,
    returnRate: 2.2,
    wheelbase: 3.1,
    track: 1.52,
    stiffness: 34,
    dragArea: 2.4,
    rideHeight: 0.75,
    colliderY: 0.12,
    massCentre: { x: 0.35, y: -0.2 },
    cargoCentre: { x: -1.5, y: 0.15 },
    powerRpm: 3200,
    rollTransfer: 0.75, // (soft leaf springs: an old pickup leans into every bend)
  },
  engine: {
    idleRpm: 750,
    maxRpm: 4200,
    curve: [[500, 0.55], [1000, 0.78], [1800, 0.95], [2600, 1.0], [3400, 0.94], [4000, 0.8], [4200, 0.72], [4500, 0]],
    gears: [3.3, 2.05, 1.4, 1.0],
    reverse: 3.6,
    efficiency: 0.88,
    shiftTime: 0.35,
    upshiftAt: 0.86,
    downshiftAt: 1500,
    engineBrake: 0.16,
    revRate: 1.7,
  },
};

// The old tractor: slow, heavy and stubborn. Small steering wheels in front, big driven wheels
// behind, a low-revving diesel with lots of pull. The trailer is separate (trailer.js); its
// weight and load are added to the tractor as cargo over the rear axle.
export const TRACTOR = {
  shape: {
    halfLength: 1.6,
    halfHeight: 0.42,
    halfWidth: 0.7,
    wheelRadius: 0.65,
    driveRadius: 0.65,
    wheelRadii: [0.36, 0.36, 0.65, 0.65],
    wheelX: [0.93, 0.93, -0.9, -0.9],
    wheelZ: [-0.63, 0.63, -0.68, 0.68],
    wheelY: [-0.27, -0.27, 0.03, 0.03],
    suspensionRest: 0.3,
  },
  tuning: {
    brakeDecel: 6,
    maxSteer: 0.6,
    steerRate: 1.0,
    returnRate: 1.8,
    wheelbase: 1.83,
    track: 1.26,
    stiffness: 34,
    dragArea: 2.2,
    rideHeight: 0.95,
    colliderY: 0.25,
    massCentre: { x: 0.35, y: -0.3 },
    cargoCentre: { x: -0.9, y: 0.0 },
    powerRpm: 1800,
  },
  engine: {
    idleRpm: 800,
    maxRpm: 2300,
    curve: [[500, 0.6], [800, 0.85], [1200, 1.0], [1800, 1.0], [2100, 0.9], [2300, 0.75], [2500, 0]],
    gears: [4.0, 2.4, 1.5, 1.0],
    reverse: 4.0,
    efficiency: 0.85,
    shiftTime: 0.5,
    upshiftAt: 0.9,
    downshiftAt: 1000,
    engineBrake: 0.25,
    revRate: 1.0,
  },
  // The tractor and its trailer never collide with each other (the trailer is kinematic and
  // hangs off the hitch): membership 0x4 here, and the trailer's filter leaves 0x4 out.
  collisionGroups: 0x0004ffff,
};

// Default ground: dry tarmac.
const DEFAULT_SURFACE = { grip: 1.0, roll: 0.012, name: 'asphalt' };

// How far past its grip a wheel is being asked to go, 0..1: a tyre just over its peak still
// grips nearly as well; asked for three and a half times what it can give, it's sliding. (A held
// key is always a full pedal, so this decides how a slippery field feels.)
export function overGrip(demand, available) {
  if (!(demand > available)) return 0;
  return Math.min(1, (demand / Math.max(available, 1e-6) - 1) / 2.5);
}

function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

function torqueShare(rpm, engine = ENGINE) {
  const c = engine.curve;
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

// Peak torque (N·m) for an engine of `powerKw`, making its power at `rpm`.
export function peakTorque(powerKw, rpm = 1900, engine = ENGINE) {
  return (powerKw * 1000) / ((rpm * 2 * Math.PI) / 60 * torqueShare(rpm, engine));
}

export function createTruckPhysics({ RAPIER, world }, {
  x, y, z, yaw = 0, speedStat = 8, mass = 5000, power = 90, surfaceAt = null, profile = null,
}) {
  const S = profile?.shape ?? TRUCK_SHAPE;
  const T = { ...TUNING, ...(profile?.tuning ?? {}) };
  const E = profile?.engine ?? ENGINE;
  const RD = S.driveRadius ?? S.wheelRadius; // the driven wheels' radius
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y + T.rideHeight, z)
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
      .setTranslation(0, T.colliderY, 0)
      .setMassProperties(mass, { x: T.massCentre.x, y: T.massCentre.y, z: 0 }, box(mass), { x: 0, y: 0, z: 0, w: 1 })
      .setFriction(0.6)
      .setCollisionGroups(profile?.collisionGroups ?? 0xffffffff),
    body,
  );
  const vehicle = world.createVehicleController(body);
  for (let i = 0; i < 4; i++) {
    vehicle.addWheel({ x: S.wheelX[i], y: Array.isArray(S.wheelY) ? S.wheelY[i] : S.wheelY, z: S.wheelZ[i] }, { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 }, S.suspensionRest, S.wheelRadii ? S.wheelRadii[i] : S.wheelRadius);
    vehicle.setWheelSuspensionStiffness(i, T.stiffness);
    vehicle.setWheelSuspensionCompression(i, T.compression);
    vehicle.setWheelSuspensionRelaxation(i, T.relaxation);
    vehicle.setWheelFrictionSlip(i, 1);
    vehicle.setWheelSideFrictionStiffness(i, 1);
    vehicle.setWheelMaxSuspensionForce(i, 1e7);
    vehicle.setWheelMaxSuspensionTravel(i, 0.35);
  }

  let cargoTonnes = 0;
  let towBraked = false;
  let steer = 0;
  let topSpeed = speedStat * T.topSpeedPerStat;
  let maxTorque = peakTorque(power, T.powerRpm, E);
  let finalDrive = 1;
  let condition = 100;
  const control = { throttle: 0, steer: 0, handbrake: false, brakePressed: false };
  const eng = {
    running: true,
    rpm: E.idleRpm,
    gear: 1, // 1..n forward, -1 reverse
    shiftT: 0, // counts down while changing gear
    load: 0, // 0..1 how hard the engine is working
    misfire: 0,
    directionT: 0,
    directionRequest: 0,
  };
  const out = {
    braking: false, reversing: false, shifted: 0, surface: DEFAULT_SURFACE.name,
    slip: 0, bump: 0, airborne: false,
    wheelspin: 0, // 0..1: driven wheels asked for more than the ground can take
    locked: false, // braking harder than the ground allows: the wheels slide
    wading: 0, // metres of standing water round the deepest wheel
  };
  // Each wheel's sideways force last step (N), to share its grip between cornering and braking
  // or driving (a tyre has one budget of grip: the friction circle).
  const sideForce = [0, 0, 0, 0];
  const lastSusp = [0, 0, 0, 0];
  let suspensionPrimed = false;
  const cruise = createCruiseControl(handling.vehicle.cruise);

  function updateFinalDrive() {
    // Top gear at max rpm = top speed.
    const wheelRadS = topSpeed / RD;
    finalDrive = ((E.maxRpm * 2 * Math.PI) / 60) / (wheelRadS * E.gears[E.gears.length - 1]);
  }
  updateFinalDrive();

  function totalMass() {
    return mass + cargoTonnes * 1000;
  }

  const gearRatio = (g) => (g < 0 ? E.reverse : E.gears[g - 1]) * finalDrive;
  const wheelRpmAt = (v, g) => (Math.abs(v) / RD) * gearRatio(g) * (60 / (2 * Math.PI));

  function surfaceUnder(i) {
    if (!surfaceAt || !vehicle.wheelIsInContact(i)) return DEFAULT_SURFACE;
    const p = vehicle.wheelContactPoint(i);
    return p ? surfaceAt(p.x, p.z) : DEFAULT_SURFACE;
  }

  function update(dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,handling.vehicle.maxStepSeconds);
    const v = vehicle.currentVehicleSpeed();
    const g = 9.81;
    const m = totalMass();
    let contacts = 0, roadGrip = 0;
    for (let i = 0; i < 4; i++) {
      if (vehicle.wheelIsInContact(i)) { contacts += 1; roadGrip += surfaceUnder(i).grip; }
    }
    const assistance = cruise.step(dt, {
      speed: v, speedLimit: topSpeed, running: eng.running, forward: eng.gear > 0,
      manualThrottle: control.throttle, handbrake: control.handbrake, shifting: eng.shiftT > 0,
      brakePressed: control.brakePressed, grounded: contacts >= 2, grip: contacts ? roadGrip / contacts : 0, slip: out.slip,
    });
    const throttleIn = eng.running ? (assistance.engaged ? assistance.throttle : control.throttle) : 0;

    // ---- pedals: forward/back pick a direction, the other pedal brakes
    let throttle = 0;
    let brake = assistance.brake;
    const direction=Math.sign(throttleIn),currentDirection=Math.sign(eng.gear);
    if(direction!==eng.directionRequest){eng.directionRequest=direction;eng.directionT=0;}
    if(direction&&v*direction<-handling.vehicle.directionBrakeSpeed){brake=Math.abs(throttleIn);eng.directionT=0;}
    else if(direction&&direction!==currentDirection){
      eng.directionT+=dt; brake=Math.max(Math.abs(throttleIn),handling.vehicle.directionHoldBrake);
      if(eng.directionT>=handling.vehicle.directionChangeSeconds){
        eng.gear=direction;eng.shiftT=E.shiftTime*.7;eng.directionT=0;
      }
    } else if(direction){throttle=Math.abs(throttleIn);eng.directionT=0;}
    if (!eng.running && Math.abs(v) < 0.3) brake = 1; // parked in gear
    // No pedal at walking pace: the driver rests on the brake, so it doesn't roll away on slopes.
    if (throttle === 0 && brake === 0 && Math.abs(v) < 2.5) brake = 0.15 + 0.35 * (1 - Math.abs(v) / 2.5);

    // ---- automatic gearbox
    eng.shiftT = Math.max(0, eng.shiftT - dt);
    eng.spinHold = Math.max(0, (eng.spinHold ?? 0) - dt);
    if (eng.gear > 0 && eng.shiftT === 0) {
      const rpm = wheelRpmAt(v, eng.gear);
      // (an automatic reads its output shaft, so wheels spinning hard make it change up, and
      // the taller gear calms them; it then holds that gear a while rather than hunting)
      const shaft = rpm * (1 + out.wheelspin * 1.1);
      if ((rpm > E.maxRpm * E.upshiftAt || (out.wheelspin > 0.6 && shaft > E.maxRpm * E.upshiftAt)) && eng.gear < E.gears.length && throttle > 0.1) {
        if (rpm <= E.maxRpm * E.upshiftAt) eng.spinHold = 2;
        eng.gear += 1;
        eng.shiftT = E.shiftTime;
        out.shifted += 1;
      } else if (eng.gear > 1 && rpm < E.downshiftAt && eng.spinHold === 0) {
        eng.gear -= 1;
        eng.shiftT = E.shiftTime * 0.7;
        out.shifted += 1;
      }
    }

    // ---- engine speed: locked to the wheels in gear, slipping the clutch when pulling away
    const coupled = eng.shiftT === 0;
    const wheelRpm = wheelRpmAt(v, eng.gear);
    let target;
    if (!eng.running) target = 0;
    else if (!coupled) target = Math.max(E.idleRpm, wheelRpmAt(v, eng.gear) * 0.9);
    else target = Math.max(wheelRpm, E.idleRpm + throttle * 650 * (wheelRpm < 1300 ? 1 : 0));
    target = Math.min(target, E.maxRpm + 120);
    const rate = (target > eng.rpm ? 900 + throttle * 2600 : 1400) * E.revRate;
    eng.rpm += Math.sign(target - eng.rpm) * Math.min(Math.abs(target - eng.rpm), rate * dt);
    // What you hear: spinning wheels turn faster than the ground goes by, so the revs flare
    // (the engine's pull is worked out from the ground speed: a tyre that's already sliding
    // gives the same push however hard the engine spins it).
    const flare = coupled && eng.running ? Math.min(E.maxRpm + 80, eng.rpm * (1 + out.wheelspin * 1.1) + out.wheelspin * 800) : eng.rpm;
    eng.heardRpm = (eng.heardRpm ?? eng.rpm) + (flare - (eng.heardRpm ?? eng.rpm)) * Math.min(1, dt * 6);

    // ---- torque at the wheels
    const power = (0.72 + 0.28 * (condition / 100)) * (eng.misfire > 0 ? 0.55 : 1);
    if (condition < 55 && Math.random() < dt * (55 - condition) * 0.02 * (0.3 + throttle)) eng.misfire = 0.12;
    eng.misfire = Math.max(0, eng.misfire - dt);
    let engineTorque = 0;
    if (eng.running && coupled) {
      if (throttle > 0) {
        const governor = eng.rpm > E.maxRpm ? Math.max(0, 1 - (eng.rpm - E.maxRpm) / 120) : 1;
        engineTorque = throttle * torqueShare(eng.rpm, E) * maxTorque * power * governor;
      }
    }
    const dir = eng.gear < 0 ? -1 : 1;
    const driveForce = (engineTorque * gearRatio(eng.gear) * E.efficiency) / RD * dir;
    eng.load = eng.running ? throttle * (coupled ? 1 : 0.3) : 0;

    // Engine braking when off the throttle in gear (a drag through the driven wheels).
    const engineDrag = eng.running && coupled && throttle === 0 && Math.abs(v) > 0.5
      ? (E.engineBrake * maxTorque * gearRatio(eng.gear) * (eng.rpm / E.maxRpm)) / RD
      : 0;

    // ---- per-wheel forces
    // Every wheel's braking or driving force is limited by its grip: the surface's friction
    // times the weight on that wheel, less what it's already using to corner. (Rapier only
    // checks forward force against half its friction circle, so on its own a pickup brakes as
    // hard on wet grass as on tarmac and never spins a wheel.) A wheel asked for more locks or
    // spins: it slides at a little less than its peak grip and loses most of its sideways hold,
    // so a locked front won't steer and a spinning rear steps out.
    const brakeForce = brake * T.brakeDecel * (mass + (towBraked ? cargoTonnes * 1000 * .85 : 0)); // fixed brake power: loaded trucks stop slower
    let grip = 0;
    let spinDemand = 0, spinGrip = 0, lockedWheels = 0;
    out.wading = 0;
    for (let i = 0; i < 4; i++) {
      const surf = surfaceUnder(i);
      grip += surf.grip / 4;
      if (i === 0) out.surface = surf.name;
      out.wading = Math.max(out.wading, surf.depth ?? 0); // (how deep the deepest wheel is in water)
      const front = i < 2;
      const load = (m * g) / 4;
      const rolling = surf.roll * load;
      const contact = vehicle.wheelIsInContact(i);
      const normal = contact ? Math.max(0, vehicle.wheelSuspensionForce(i) ?? load) : 0;
      const budget = surf.grip * normal;
      const forwardGrip = Math.sqrt(Math.max(0, budget * budget - sideForce[i] * sideForce[i]));
      let brakeHere = (front ? T.frontBrakeShare : 1 - T.frontBrakeShare) * brakeForce / 2;
      if (!front && control.handbrake) brakeHere += T.brakeDecel * mass * 0.35;
      const driven = !front || profile?.driveWheels === 4;
      const drivenCount = profile?.driveWheels === 4 ? 4 : 2;
      if (driven && throttle === 0) brakeHere += engineDrag / drivenCount;
      let sideHold = 0.6 + 0.4 * surf.grip;
      // (only a wheel that's rolling can lock: parked, the brake just holds)
      if (contact && Math.abs(v) > 1 && brakeHere > forwardGrip) {
        const severity = overGrip(brakeHere, forwardGrip);
        brakeHere = forwardGrip * (1 - (1 - T.slidingGrip) * severity);
        sideHold *= 1 - 0.7 * severity;
        lockedWheels += severity;
      }
      brakeHere += rolling;
      let engineHere = 0;
      if (driven && driveForce !== 0 && !control.handbrake) {
        // Driven wheels: net of rolling resistance (Rapier ignores the brake while driving).
        let push = driveForce / drivenCount;
        if (contact) {
          spinDemand += Math.abs(push);
          spinGrip += forwardGrip;
          if (Math.abs(push) > forwardGrip) {
            const severity = overGrip(Math.abs(push), forwardGrip);
            push = Math.sign(push) * forwardGrip * (1 - (1 - T.slidingGrip) * severity);
            sideHold *= 1 - 0.55 * severity;
          }
        }
        engineHere = push - Math.sign(v || dir) * rolling;
        brakeHere = 0;
      }
      vehicle.setWheelFrictionSlip(i, surf.grip);
      vehicle.setWheelSideFrictionStiffness(i, sideHold);
      vehicle.setWheelEngineForce(i, engineHere);
      // Rapier brakes are an impulse limit per step: force x dt.
      vehicle.setWheelBrake(i, brakeHere * dt);
    }
    out.wheelspin = spinDemand > 0 ? Math.max(0, Math.min(1, (spinDemand - spinGrip) / (spinGrip + 1))) : 0;
    out.locked = lockedWheels > 0.5;

    // ---- steering: speed-sensitive, with Ackermann (the inside wheel turns more)
    const maxSteer = T.maxSteer / (1 + Math.abs(v) * handling.vehicle.steeringSpeedSensitivity);
    const targetSteer = control.steer * maxSteer;
    steer=steeringStep(steer,targetSteer,dt,T.steerRate,T.returnRate);
    let left = steer;
    let right = steer;
    if (Math.abs(steer) > 1e-3) {
      const R = T.wheelbase / Math.tan(Math.abs(steer));
      const inner = Math.atan(T.wheelbase / (R - T.track / 2));
      const outer = Math.atan(T.wheelbase / (R + T.track / 2));
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
      const f = 0.5 * 1.2 * T.dragArea * sp * sp * dt;
      body.applyImpulse({ x: (-lv.x / sp) * f, y: (-lv.y / sp) * f, z: (-lv.z / sp) * f }, true);
    }

    vehicle.updateVehicle(dt);

    // ---- the roll moment the ray-cast vehicle leaves out: each tyre's sideways push acts at
    // the ground, below the centre of mass, so the body leans away from the turn.
    if (T.rollTransfer > 0) {
      const com = body.worldCom();
      const q = body.rotation();
      const up = { x: 2 * (q.x * q.y - q.w * q.z), y: 1 - 2 * (q.x * q.x + q.z * q.z), z: 2 * (q.y * q.z + q.w * q.x) };
      const fwd = { x: 1 - 2 * (q.y * q.y + q.z * q.z), y: 2 * (q.x * q.y + q.w * q.z), z: 2 * (q.x * q.z - q.w * q.y) };
      let roll = 0;
      for (let i = 0; i < 4; i++) {
        if (!vehicle.wheelIsInContact(i)) continue;
        const p = vehicle.wheelContactPoint(i);
        if (!p) continue;
        const h = (com.x - p.x) * up.x + (com.y - p.y) * up.y + (com.z - p.z) * up.z; // (height of the centre of mass over this contact)
        roll += (vehicle.wheelSideImpulse(i) ?? 0) * h;
      }
      const k = -roll * T.rollTransfer;
      body.applyTorqueImpulse({ x: fwd.x * k, y: fwd.y * k, z: fwd.z * k }, true);
    }
    for (let i = 0; i < 4; i++) sideForce[i] = Math.abs(vehicle.wheelSideImpulse(i) ?? 0) / dt;

    // ---- what the sound and camera need
    let contact = 0;
    let bump = 0;
    let side = 0;
    for (let i = 0; i < 4; i++) {
      if (vehicle.wheelIsInContact(i)) contact += 1;
      const l = vehicle.wheelSuspensionLength(i) ?? 0;
      if(suspensionPrimed)bump = Math.max(bump, Math.abs(l - lastSusp[i]) / dt);
      lastSusp[i] = l;
      side += Math.abs(vehicle.wheelSideImpulse(i) ?? 0);
    }
    out.airborne = contact === 0;
    suspensionPrimed=true;
    out.bump = bump;
    out.slip = Math.max(Math.min(1, side / (m * g * grip * dt + 1e-6) * 0.8), out.wheelspin, out.locked ? 0.8 : 0);
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
      rpm: eng.heardRpm ?? eng.rpm, gear: eng.gear, shifting: eng.shiftT > 0, load: eng.load, running: eng.running,
      misfire: eng.misfire > 0, ...out,
      cruiseActive: cruise.state().active, cruiseTarget: cruise.state().targetSpeed, cruiseLimited: cruise.state().limited,
    }),
    toggleCruise() {
      let contacts = 0;
      for (let i = 0; i < 4; i++) if (vehicle.wheelIsInContact(i)) contacts += 1;
      return cruise.toggle({ speed: vehicle.currentVehicleSpeed(), speedLimit: topSpeed,
        running: eng.running, forward: eng.gear > 0, manualThrottle: control.throttle,
        grounded: contacts >= 2, handbrake: control.handbrake, brakePressed: control.brakePressed });
    },
    cancelCruise: () => cruise.cancel(),
    setTowBraking(braked) { towBraked = !!braked; },
    setCargo(tonnes) {
      if (Math.abs(tonnes - cargoTonnes) < 0.01) return;
      cargoTonnes = tonnes;
      // The load sits in the bed: behind and above the chassis centre.
      const cm = tonnes * 1000;
      body.setAdditionalMassProperties(cm, { x: T.cargoCentre.x, y: T.cargoCentre.y, z: 0 },
        { x: cm * 0.35, y: cm * 0.9, z: cm * 0.8 }, { x: 0, y: 0, z: 0, w: 1 }, true);
    },
    setSpeedStat(s) {
      const t = s * T.topSpeedPerStat;
      if (t !== topSpeed) {
        topSpeed = t;
        updateFinalDrive();
      }
    },
    setPower(kw) {
      maxTorque = peakTorque(kw, T.powerRpm, E);
    },
    setCondition(c) {
      condition = c;
    },
    setEngineRunning(on) {
      // A cold diesel catches with a flare of revs, then settles to idle.
      if (on && !eng.running) eng.rpm = 1250;
      eng.running = on;
      if (!on) cruise.cancel();
    },
    steering: () => steer,
    rideHeight: T.rideHeight,
    // Put the truck back on its wheels at a spot (for "recover stuck vehicle").
    reset(px, py, pz, yawAngle) {
      cruise.cancel();
      body.setTranslation({ x: px, y: py + T.rideHeight + 0.1, z: pz }, true);
      body.setRotation(yawQuat(yawAngle), true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      steer=0;eng.gear=1;eng.shiftT=0;eng.directionT=0;eng.directionRequest=0;eng.load=0;eng.misfire=0;
      control.throttle=0;control.steer=0;control.handbrake=true;control.brakePressed=false;
      suspensionPrimed=false;out.bump=0;out.slip=0;out.braking=true;out.reversing=false;
    },
    destroy() {
      world.removeVehicleController(vehicle);
      world.removeRigidBody(body);
    },
  };
}

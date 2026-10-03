// Checks the truck's driving feel stays sensible when physics numbers change.
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createTruckPhysics, PICKUP, steeringStep } from './truckPhysics.js';

beforeAll(async () => {
  await RAPIER.init();
});

function setup(cargo = 0, slope = 0) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  // A slope rising toward +X (the way the truck faces).
  const q = { x: 0, y: 0, z: Math.sin(slope / 2), w: Math.cos(slope / 2) };
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0).setRotation(q).setFriction(1));
  const truck = createTruckPhysics({ RAPIER, world }, {
    x: 0, y: 0, z: 0, yaw: 0, speedStat: 8, mass: 4200, power: 70,
  });
  truck.setCargo(cargo);
  const run = (seconds) => {
    for (let i = 0; i < seconds * 60; i++) {
      truck.update(1 / 60);
      world.step();
    }
  };
  run(1); // settle on its wheels
  return { world, truck, run };
}

function speedAfter(cargo, seconds) {
  const { truck, run } = setup(cargo);
  truck.control.throttle = 1;
  run(seconds);
  return truck.speed();
}

describe('truck driving', () => {
  it('holds a captured hauling speed using the loaded drivetrain and immediately gives back pedal control', () => {
    const { truck, run } = setup(3);
    truck.control.throttle = 1;
    run(4);
    truck.control.brakePressed = true;
    expect(truck.toggleCruise().ok).toBe(false);
    truck.control.brakePressed = false;
    const setting = truck.toggleCruise();
    expect(setting.ok).toBe(true);
    const target = setting.targetSpeed;
    truck.control.throttle = 0;
    run(12);
    expect(truck.telemetry().cruiseActive).toBe(true);
    expect(truck.speed()).toBeGreaterThan(target - .7);
    expect(truck.speed()).toBeLessThan(target + .7);
    truck.control.throttle = -1;
    run(.05);
    expect(truck.telemetry().cruiseActive).toBe(false);
    expect(truck.telemetry().braking).toBe(true);
    expect(truck.speed()).toBeLessThan(target + .4);
    truck.control.throttle = 0;
    expect(truck.toggleCruise().ok).toBe(true);
    truck.setEngineRunning(false);
    expect(truck.telemetry().cruiseActive).toBe(false);
  });

  it('clears cruise on recovery and respects an overloaded towing speed cap', () => {
    const { truck, run } = setup();
    truck.control.throttle = 1;
    run(4);
    expect(truck.toggleCruise().ok).toBe(true);
    truck.control.throttle = 0;
    truck.setSpeedStat(.25);
    run(.05);
    expect(truck.telemetry().cruiseActive).toBe(false);
    truck.setSpeedStat(8);
    truck.control.throttle = 1;
    run(3);
    expect(truck.toggleCruise().ok).toBe(true);
    truck.reset(0, 0, 0, 0);
    expect(truck.telemetry().cruiseActive).toBe(false);
    expect(truck.telemetry().cruiseTarget).toBe(0);
  });

  it('holds a loaded uphill or downhill haul with ordinary engine and brake forces', () => {
    for (const grade of [.06, -.06]) {
      const { truck, run } = setup(3, Math.atan(grade));
      truck.control.throttle = 1;
      run(4);
      const result = truck.toggleCruise();
      expect(result.ok).toBe(true);
      truck.control.throttle = 0;
      run(14);
      expect(truck.telemetry().cruiseActive).toBe(true);
      expect(Math.abs(truck.speed() - result.targetSpeed)).toBeLessThan(.8);
    }
  });

  it('clears opposite steering through neutral consistently across physics steps',()=>{
    const run=dt=>{let angle=.6;for(let t=0;t<.5-1e-8;t+=dt)angle=steeringStep(angle,-.6,dt,.9,1.6);return angle;};
    expect(run(1/30)).toBeCloseTo(run(1/120),8);expect(run(1/60)).toBeLessThan(-.1);
  });
  it('brakes before changing direction and resets steering, controls and suspension shock on recovery',()=>{
    const{truck,run}=setup();truck.control.throttle=-1;run(3);expect(truck.speed()).toBeLessThan(-2);
    truck.control.throttle=1;run(.05);expect(truck.telemetry().gear).toBe(-1);expect(truck.telemetry().braking).toBe(true);
    run(3);expect(truck.telemetry().gear).toBeGreaterThan(0);expect(truck.speed()).toBeGreaterThan(1);
    truck.control.steer=1;run(.5);expect(truck.steering()).toBeGreaterThan(.1);
    truck.reset(20,0,20,0);expect(truck.steering()).toBe(0);expect(truck.control.throttle).toBe(0);expect(truck.control.handbrake).toBe(true);
    truck.update(0);expect(truck.telemetry().bump).toBe(0);truck.update(1/60);expect(truck.telemetry().bump).toBe(0);
  });
  it('accelerates to its top speed and no further', () => {
    const v = speedAfter(0, 8);
    expect(v).toBeGreaterThan(8 * 1.4 * 0.9);
    expect(v).toBeLessThan(8 * 1.4 * 1.1);
  });

  it('is slower to accelerate when loaded', () => {
    expect(speedAfter(3, 3)).toBeLessThan(speedAfter(0, 3) * 0.8);
  });

  it('brakes to a stop, taking longer when loaded', () => {
    const stopTime = (cargo) => {
      const { truck, run } = setup(cargo);
      truck.control.throttle = 1;
      run(6);
      truck.control.throttle = -1;
      let t = 0;
      while (truck.speed() > 0.3 && t < 10) {
        run(0.1);
        t += 0.1;
      }
      return t;
    };
    const empty = stopTime(0);
    expect(empty).toBeLessThan(3);
    expect(stopTime(3)).toBeGreaterThan(empty);
  });

  it('trailer brakes shorten a loaded combination’s stopping distance', () => {
    const stoppingDistance = (braked) => {
      const { truck, run } = setup(8);
      truck.setTowBraking(braked);
      truck.control.throttle = 1;
      run(14);
      const start = truck.body.translation().x;
      truck.control.throttle = -1;
      for (let t = 0; t < 10 && truck.speed() > .3; t += .05) run(.05);
      return truck.body.translation().x - start;
    };
    expect(stoppingDistance(true)).toBeLessThan(stoppingDistance(false) * .7);
  });

  it('changes up through the gears and revs within the engine range', () => {
    const { truck, run } = setup(0);
    expect(truck.telemetry().rpm).toBeCloseTo(700, -1); // idling
    truck.control.throttle = 1;
    let maxRpm = 0;
    for (let i = 0; i < 80; i++) {
      run(0.1);
      maxRpm = Math.max(maxRpm, truck.telemetry().rpm);
    }
    expect(truck.telemetry().gear).toBe(4);
    expect(maxRpm).toBeLessThan(2700);
  });

  it('reverses when you hold back from a standstill', () => {
    const { truck, run } = setup(0);
    truck.control.throttle = -1;
    run(3);
    expect(truck.speed()).toBeLessThan(-2);
    expect(truck.telemetry().reversing).toBe(true);
  });

  it('climbs a steep hill slower when loaded, and holds still with no pedal', () => {
    const climb = (cargo) => {
      const { truck, run } = setup(cargo, Math.atan(0.12));
      truck.control.throttle = 1;
      run(10);
      return truck;
    };
    const loaded = climb(3);
    expect(loaded.speed()).toBeGreaterThan(0.8);
    expect(loaded.speed()).toBeLessThan(climb(0).speed());
    const { truck, run } = setup(3, Math.atan(0.12));
    run(4);
    expect(Math.abs(truck.speed())).toBeLessThan(0.3);
  });

  it('turns without rolling over', () => {
    const { truck, run } = setup(0);
    truck.control.throttle = 0.6;
    truck.control.steer = 1;
    run(6);
    const r = truck.body.rotation();
    const upright = 1 - 2 * (r.x * r.x + r.z * r.z); // local up · world up
    expect(upright).toBeGreaterThan(0.9);
  });
});

describe('pickup driving', () => {
  it('rides at its own height, pulls away briskly and tops out at its speed', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    world.createCollider(RAPIER.ColliderDesc.cuboid(800, 1, 800).setTranslation(0, -1, 0).setFriction(1));
    const pickup = createTruckPhysics({ RAPIER, world }, {
      x: 0, y: 0, z: 0, yaw: 0, speedStat: 13, mass: 1650, power: 55, profile: PICKUP,
    });
    const run = (seconds) => {
      for (let i = 0; i < seconds * 60; i++) {
        pickup.update(1 / 60);
        world.step();
      }
    };
    run(1.5);
    const y = pickup.body.translation().y;
    expect(y).toBeGreaterThan(PICKUP.tuning.rideHeight - 0.15);
    expect(y).toBeLessThan(PICKUP.tuning.rideHeight + 0.15);
    pickup.control.throttle = 1;
    run(4);
    expect(pickup.speed()).toBeGreaterThan(10); // quicker off the mark than the truck
    run(16);
    expect(pickup.speed()).toBeGreaterThan(13 * 1.4 * 0.9);
    expect(pickup.speed()).toBeLessThan(13 * 1.4 * 1.1);
    expect(pickup.telemetry().rpm).toBeGreaterThan(2500); // it revs like a petrol engine
  });
});

// The pickup on one surface all over (grip, rolling resistance).
function pickupOn(surface, cargo = 0) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;
  world.createCollider(RAPIER.ColliderDesc.cuboid(1500, 1, 1500).setTranslation(0, -1, 0).setFriction(1));
  const car = createTruckPhysics({ RAPIER, world }, {
    x: 0, y: 0, z: 0, yaw: 0, speedStat: 13, mass: 1650, power: 55, profile: PICKUP, surfaceAt: () => surface,
  });
  car.setCargo(cargo);
  const run = (seconds, each) => {
    for (let i = 0; i < seconds * 60; i++) {
      car.update(1 / 60);
      world.step();
      each?.();
    }
  };
  run(1.5);
  return { car, run };
}
const TARMAC = { grip: 0.9, roll: 0.012, name: 'asphalt' };
const WET_GRASS = { grip: 0.4, roll: 0.065, name: 'grass' };

// Distance to stop from 40 km/h with the brake pedal held.
function stoppingDistance(surface) {
  const { car, run } = pickupOn(surface);
  car.control.throttle = 1;
  let n = 0;
  while (car.speed() < 40 / 3.6 && n++ < 60 * 30) run(1 / 60);
  const x0 = car.body.translation().x;
  let locked = false;
  car.control.throttle = -1;
  run(6, () => {
    if (car.telemetry().locked) locked = true;
    if (car.speed() < 0.3) car.control.throttle = 0;
  });
  return { distance: car.body.translation().x - x0, locked };
}

describe('grip', () => {
  it('stops in roughly the distance its grip allows: much longer on wet grass, sliding', () => {
    const dry = stoppingDistance(TARMAC);
    const wet = stoppingDistance(WET_GRASS);
    // (40 km/h: about 9 m on dry tarmac at 0.7 g, the brakes' limit; wet grass grips at about 0.4)
    expect(dry.distance).toBeGreaterThan(7);
    expect(dry.distance).toBeLessThan(12);
    expect(wet.distance).toBeGreaterThan(dry.distance * 1.4); // (0.7 g against about 0.45 g)
    expect(wet.locked).toBe(true);
  });

  it('spins its rear wheels pulling away on wet grass, and gets there slower than on tarmac', () => {
    const timeTo30 = (surface, cargo = 0) => {
      const { car, run } = pickupOn(surface, cargo);
      car.control.throttle = 1;
      let t = 0, spin = 0;
      while (car.speed() < 30 / 3.6 && t < 40) {
        run(1 / 60);
        t += 1 / 60;
        spin = Math.max(spin, car.telemetry().wheelspin);
      }
      return { t, spin };
    };
    const dry = timeTo30(TARMAC);
    const wet = timeTo30(WET_GRASS);
    expect(wet.spin).toBeGreaterThan(0.2);
    expect(wet.t).toBeGreaterThan(dry.t * 1.8);
    expect(wet.t).toBeLessThan(20); // (slow, but it does get going)
    // A load in the bed sits over the driven wheels: more traction on the slippery stuff.
    expect(timeTo30(WET_GRASS, 0.6).t).toBeLessThan(wet.t);
  });

  it('leans out of a bend, a few degrees, and stays on its wheels', () => {
    const { car, run } = pickupOn(TARMAC);
    car.control.throttle = 1;
    run(3);
    car.control.throttle = 0.35;
    car.control.steer = 1; // left
    let lean = 0;
    run(3, () => {
      // (the world's up seen from the body: tipped towards its left when the body leans right)
      const q = car.body.rotation();
      lean = Math.max(lean, -Math.asin(2 * (q.y * q.z - q.w * q.x)) * 57.3);
    });
    expect(lean).toBeGreaterThan(2);
    expect(lean).toBeLessThan(8);
    const r = car.body.rotation();
    expect(1 - 2 * (r.x * r.x + r.z * r.z)).toBeGreaterThan(0.95);
  });
});

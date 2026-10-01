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

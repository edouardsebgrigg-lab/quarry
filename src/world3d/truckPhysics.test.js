// Checks the truck's driving feel stays sensible when physics numbers change.
import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { createTruckPhysics } from './truckPhysics.js';

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

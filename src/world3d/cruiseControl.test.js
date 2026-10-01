import { describe, expect, it } from 'vitest';
import handling from '../../data/handling.json';
import { createCruiseControl } from './cruiseControl.js';

const fixture = { speed: 8, speedLimit: 14, running: true, forward: true, grounded: true };
const create = (change = {}) => {
  const cruise = createCruiseControl(handling.vehicle.cruise);
  cruise.toggle({ ...fixture, ...change });
  return cruise;
};

describe('hauling cruise control', () => {
  it('sets current forward speed only with an engine, grip and released handbrake', () => {
    for (const change of [{ running: false }, { forward: false }, { speed: 1 }, { speed: -8 }, { grounded: false }, { handbrake: true }, { brakePressed: true, manualThrottle: 0 }, { manualThrottle: -1 }, { speedLimit: NaN }]) {
      expect(create(change).state().active).toBe(false);
    }
    expect(create({ speed: 13, speedLimit: 10 }).state()).toMatchObject({ active: true, targetSpeed: 10 });
    const cruise = create();
    expect(cruise.toggle(fixture)).toMatchObject({ ok: true, active: false, targetSpeed: 0 });
  });

  it('accepts the accelerator held at engagement, then cancels on a fresh pedal or brake', () => {
    const cruise = create({ manualThrottle: 1 });
    expect(cruise.step(.02, { ...fixture, manualThrottle: 1 }).engaged).toBe(false);
    expect(cruise.state().active).toBe(true);
    expect(cruise.step(.02, fixture).engaged).toBe(true);
    cruise.step(.02, { ...fixture, manualThrottle: 1 });
    expect(cruise.state().active).toBe(false);
    for (const change of [{ manualThrottle: -1 }, { brakePressed: true, manualThrottle: 0 }, { handbrake: true }, { running: false }, { forward: false }, { speedLimit: .3 }]) {
      const control = create();
      expect(control.step(.02, { ...fixture, ...change }).engaged).toBe(false);
      expect(control.state().active).toBe(false);
    }
  });

  it('uses bounded pedals for grades, lowers targets with towing limits, and restrains poor grip', () => {
    const cruise = create();
    const climb = cruise.step(.02, { ...fixture, speed: 3, grip: .2 });
    expect(climb.throttle).toBeCloseTo(.52);
    expect(climb.brake).toBe(0);
    expect(cruise.state().limited).toBe(true);
    const slipping = cruise.step(.02, { ...fixture, speed: 3, slip: 1 });
    expect(slipping.throttle).toBeLessThan(.6);
    const descent = cruise.step(.02, { ...fixture, speed: 14 });
    expect(descent.throttle).toBe(0);
    expect(descent.brake).toBe(handling.vehicle.cruise.maxBrake);
    cruise.step(.02, { ...fixture, speedLimit: 6 });
    expect(cruise.state().targetSpeed).toBe(6);
    cruise.step(.02, { ...fixture, speedLimit: 14 });
    expect(cruise.state().targetSpeed).toBe(6);
  });

  it('brake intent cancels even while the engagement accelerator is still held', () => {
    const cruise = create({ manualThrottle: 1 });
    cruise.step(.02, { ...fixture, manualThrottle: 0, brakePressed: true });
    expect(cruise.state().active).toBe(false);
  });

  it('removes assistance in the air and cancels after sustained loss of wheel contact', () => {
    const cruise = create();
    for (let i = 0; i < 20; i++) expect(cruise.step(.02, { ...fixture, grounded: false })).toEqual({ engaged: true, throttle: 0, brake: 0 });
    expect(cruise.state().active).toBe(true);
    expect(cruise.step(.02, fixture).engaged).toBe(true);
    for (let i = 0; i < 40; i++) cruise.step(.02, { ...fixture, grounded: false });
    expect(cruise.state().active).toBe(false);
  });

  it('retains a paused target and cannot accumulate hidden throttle through a shift', () => {
    const cruise = create();
    const initial = cruise.state();
    expect(cruise.step(0, fixture).engaged).toBe(false);
    expect(cruise.step(NaN, fixture).engaged).toBe(false);
    expect(cruise.state()).toEqual(initial);
    for (let i = 0; i < 120; i++) cruise.step(1 / 60, { ...fixture, speed: 7, shifting: true });
    const afterShift = cruise.step(1 / 60, fixture);
    expect(afterShift.throttle).toBeCloseTo(handling.vehicle.cruise.initialThrottle);
    cruise.cancel();
    expect(cruise.state()).toEqual({ active: false, targetSpeed: 0, limited: false });
  });
});

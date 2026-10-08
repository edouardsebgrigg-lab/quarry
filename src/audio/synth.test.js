import { describe, it, expect } from 'vitest';
import * as S from './synth.js';

const SR = 22050;

function check(buf) {
  expect(buf.length).toBeGreaterThan(100);
  let rms = 0;
  for (const v of buf) {
    expect(Number.isFinite(v)).toBe(true);
    rms += v * v;
  }
  expect(S.peak(buf)).toBeLessThanOrEqual(1);
  expect(Math.sqrt(rms / buf.length)).toBeGreaterThan(0.005); // not silent
}

// A loop joins cleanly if the jump from its last sample to its first is no bigger than a
// typical sample-to-sample step inside it.
function seamless(buf) {
  let steps = 0;
  for (let i = 1; i < buf.length; i++) steps += Math.abs(buf[i] - buf[i - 1]);
  const typical = steps / (buf.length - 1);
  expect(Math.abs(buf[0] - buf[buf.length - 1])).toBeLessThan(typical * 6 + 0.02);
}

// Building sounds is heavy maths: give these tests room on a slow or busy machine.
describe('sound synthesis', { timeout: 30000 }, () => {
  it('builds diesel engine loops that are the right length and loop cleanly', () => {
    for (const [name, eng] of Object.entries(S.ENGINES)) {
      for (const rpm of [800, 2200]) {
        const buf = S.dieselLoop(SR, { ...eng, rpm, load: name === 'car' ? 0.3 : 1 });
        check(buf);
        seamless(buf);
        expect(buf.length).toBeCloseTo((6 * 2 * 60 * SR) / rpm, -1);
      }
    }
  });

  it('makes an engine under load louder than one coasting', () => {
    const rms = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);
    const eng = S.ENGINES.truckOld;
    expect(rms(S.dieselLoop(SR, { ...eng, rpm: 1400, load: 1 }))).toBeGreaterThan(rms(S.dieselLoop(SR, { ...eng, rpm: 1400, load: 0.1 })));
  });

  it('builds seamless loops for rolling, tracks, digging, hydraulics and wind', () => {
    for (const f of [S.gravelRoll, S.roadRoll, S.trackClank, S.scrape, S.hydraulicHiss, S.tipperRam, S.ptoDrive, S.wind, S.beeper, S.wade]) {
      const buf = f(SR);
      check(buf);
      seamless(buf);
    }
  });

  it('builds one-shot sounds', () => {
    for (const buf of [S.starter(SR), S.rockPour(SR), S.metalBoom(SR), S.thud(SR), S.clunk(SR), S.airHiss(SR),
      S.footstep(SR), S.footstep(SR, { surface: 'grass' }), S.birdCall(SR), S.coin(SR), S.chime(SR), S.shovelBite(SR),
      S.soilPour(SR), S.soilPour(SR, 1.6), S.quarryBlast(SR), S.splash(SR)]) check(buf);
  });

  it('is deterministic for a given seed', () => {
    expect(S.birdCall(SR, 4)).toEqual(S.birdCall(SR, 4));
  });
});

describe('reversing alarms', () => {
  it('the broadband alarm is a burst of noise then silence, and not too loud', async () => {
    const { broadbandAlarm, peak } = await import('./synth.js');
    const sr = 22050;
    const a = broadbandAlarm(sr);
    expect(a.length).toBe(Math.round(0.9 * sr));
    expect(peak(a)).toBeLessThanOrEqual(0.56);
    const on = a.slice(Math.round(0.1 * sr), Math.round(0.3 * sr)).reduce((x, v) => x + Math.abs(v), 0);
    const off = a.slice(Math.round(0.6 * sr), Math.round(0.85 * sr)).reduce((x, v) => x + Math.abs(v), 0);
    expect(on).toBeGreaterThan(100);
    expect(off).toBe(0);
  });
});

describe('rain', () => {
  it('loops without a click and is not silent', async () => {
    const { rain, peak } = await import('./synth.js');
    const sr = 22050;
    const a = rain(sr, 3);
    expect(peak(a)).toBeGreaterThan(0.3);
    expect(Math.abs(a[0] - a[a.length - 1])).toBeLessThan(0.2);
  });
});

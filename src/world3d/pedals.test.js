import { describe, it, expect } from 'vitest';
import { pedalStep } from './pedals.js';

describe('a pedal under a key', () => {
  it('goes down over a quarter of a second, and no further than asked', () => {
    let p = 0;
    p = pedalStep(p, 1, 0.1);
    expect(p).toBeCloseTo(0.4);
    p = pedalStep(p, 1, 0.1);
    expect(p).toBeCloseTo(0.8);
    p = pedalStep(p, 1, 0.1);
    expect(p).toBe(1);
    expect(pedalStep(0, 0.4, 1)).toBe(0.4); // (the precision key: a light foot)
  });

  it('comes straight up when let go, or eased off, and swaps to the other pedal from zero', () => {
    expect(pedalStep(1, 0, 0.016)).toBe(0);
    expect(pedalStep(1, 0.4, 0.016)).toBe(0.4);
    expect(pedalStep(1, -1, 0.1)).toBeCloseTo(-0.4);
  });
});

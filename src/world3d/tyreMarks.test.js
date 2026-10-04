import { describe, it, expect } from 'vitest';
import { markFor } from './tyreMarks.js';

describe('what a tyre leaves behind', () => {
  it('leaves rubber on tarmac only when it slides', () => {
    expect(markFor('asphalt', 0, 0)).toBe(null);
    expect(markFor('asphalt', 0, 0.2)).toBe(null);
    expect(markFor('asphalt', 0, 1).strength).toBeGreaterThan(0.5);
  });

  it('presses a track into grass and soil, deeper and darker when wet or spinning', () => {
    const dry = markFor('grass', 0, 0);
    const wet = markFor('grass', 1, 0);
    expect(dry.strength).toBeLessThan(0.3); // (flattened grass: you see where it's been)
    expect(wet.strength).toBeGreaterThan(dry.strength);
    expect(wet.color).not.toBe(dry.color); // (mud, not flattened grass)
    expect(markFor('grass', 0, 1).strength).toBeGreaterThan(dry.strength);
    expect(markFor('topsoil', 1, 0).strength).toBeGreaterThan(markFor('topsoil', 0, 0).strength);
  });

  it('only scuffs rock when it slides', () => {
    expect(markFor('rock', 0, 0)).toBe(null);
    expect(markFor('rock', 0, 1)).not.toBe(null);
  });
});

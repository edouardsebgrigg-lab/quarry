import { describe, it, expect } from 'vitest';
import { DEFAULT_BINDINGS, rebind, keyLabel } from './index.js';

describe('key bindings', () => {
  it('has no duplicate default keys', () => {
    const keys = Object.values(DEFAULT_BINDINGS);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('swaps keys when rebinding onto a used key', () => {
    const next = rebind(DEFAULT_BINDINGS, 'dig', 'KeyH');
    expect(next.dig).toBe('KeyH');
    expect(next.haul).toBe('KeyD');
  });

  it('labels keys nicely', () => {
    expect(keyLabel('KeyD')).toBe('D');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Space')).toBe('Space');
  });
});

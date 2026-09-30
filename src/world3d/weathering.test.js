import { describe, it, expect } from 'vitest';
import { materialRole } from './weathering.js';

describe('which materials get weathered', () => {
  it('reads the original model names', () => {
    expect(materialRole('Paint')).toEqual({ role: 'body', baked: false });
    expect(materialRole('PaintDark.001')).toEqual({ role: 'dark', baked: false });
    expect(materialRole('Glass')).toBe(null);
  });

  it('reads the refined fleet names, which already have wear painted in', () => {
    expect(materialRole('Review_Paint_Bed')).toEqual({ role: 'body', baked: true });
    expect(materialRole('Review_Paint.001_Tailgate')).toEqual({ role: 'body', baked: true });
    expect(materialRole('Review_PaintDark_BoomRam')).toEqual({ role: 'metal', baked: true }); // (rams)
    expect(materialRole('Review_PaintDark_Counterweight')).toEqual({ role: 'dark', baked: true });
    expect(materialRole('Review_TractorPaint_Bonnet')).toEqual({ role: 'body', baked: true });
    expect(materialRole('Review_Rubber_Wheel0_Tyre')).toEqual({ role: 'mud', baked: true });
    expect(materialRole('Review_WornSteel')).toEqual({ role: 'metal', baked: true });
    for (const n of ['Review_Glass', 'Review_Headlight', 'Review_Seat', 'Review seam rust', 'Review_Chrome']) expect(materialRole(n)).toBe(null);
  });
});

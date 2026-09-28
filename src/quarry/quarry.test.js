import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import {
  getZoneInfo, extractRock, addToYard, yardTotal, yardRoom, addToFacePile,
  takeFromFacePile, facePileTotal, pileTotal,
} from './index.js';

function setup() {
  return createGame({ seed: 1 }).ctx;
}

describe('zones and layers', () => {
  it('starts at the surface on the first layer', () => {
    const ctx = setup();
    const info = getZoneInfo(ctx, 'gravelPit', 'A');
    expect(info.depth).toBe(0);
    expect(info.layerIndex).toBe(0);
    expect(info.exhausted).toBe(false);
  });

  it('extracts rock in the layer mix and gets deeper', () => {
    const ctx = setup();
    const got = extractRock(ctx, 'gravelPit', 'A', 10);
    const mix = ctx.data.sites.gravelPit.layerProfile[0].mix;
    expect(got.tonnes).toBe(10);
    expect(got.materials.sand).toBeCloseTo(10 * mix.sand);
    expect(got.materials.gravel).toBeCloseTo(10 * mix.gravel);
    expect(getZoneInfo(ctx, 'gravelPit', 'A').depth).toBeGreaterThan(0);
  });

  it('never takes more than is left in the current layer', () => {
    const ctx = setup();
    const perLayer = ctx.data.sites.gravelPit.tonnesPerLayer;
    ctx.state.sites.gravelPit.zones.A.dug = perLayer - 1;
    expect(extractRock(ctx, 'gravelPit', 'A', 5).tonnes).toBeCloseTo(1);
    const info = getZoneInfo(ctx, 'gravelPit', 'A');
    expect(info.layerIndex).toBe(1);
    expect(info.depth).toBeCloseTo(ctx.data.sites.gravelPit.layerThickness);
  });

  it('is exhausted after the last layer', () => {
    const ctx = setup();
    const site = ctx.data.sites.gravelPit;
    ctx.state.sites.gravelPit.zones.B.dug = site.tonnesPerLayer * site.layerProfile.length;
    const info = getZoneInfo(ctx, 'gravelPit', 'B');
    expect(info.exhausted).toBe(true);
    expect(extractRock(ctx, 'gravelPit', 'B', 5).tonnes).toBe(0);
  });

  it('keeps zones separate', () => {
    const ctx = setup();
    extractRock(ctx, 'gravelPit', 'A', 50);
    expect(getZoneInfo(ctx, 'gravelPit', 'C').depth).toBe(0);
  });
});

describe('piles', () => {
  it('takes from the face pile proportionally', () => {
    const ctx = setup();
    addToFacePile(ctx, 'gravelPit', { sand: 2, gravel: 6 });
    const taken = takeFromFacePile(ctx, 'gravelPit', 4);
    expect(taken.sand).toBeCloseTo(1);
    expect(taken.gravel).toBeCloseTo(3);
    expect(facePileTotal(ctx, 'gravelPit')).toBeCloseTo(4);
    expect(pileTotal(taken)).toBeCloseTo(4);
  });

  it('caps the yard at its capacity and reports what spilled', () => {
    const ctx = setup();
    const cap = ctx.data.sites.gravelPit.yardCapacity;
    const lost = addToYard(ctx, 'gravelPit', { gravel: cap + 10 });
    expect(lost).toBeCloseTo(10);
    expect(yardTotal(ctx, 'gravelPit')).toBeCloseTo(cap);
    expect(yardRoom(ctx, 'gravelPit')).toBeCloseTo(0);
  });
});

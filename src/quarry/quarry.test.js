import { describe, it, expect } from 'vitest';
import { loadData } from '../core/index.js';
import {
  createSitesState, getSiteData, pileTotal, addToPile, takeProportional, takeMaterial,
} from './index.js';

describe('sites', () => {
  it('owns the start site, which has diggable ground', () => {
    const data = loadData();
    const sites = createSitesState(data);
    expect(sites[data.game.startSite].owned).toBe(true);
    expect(data.ground.plots[getSiteData(data, data.game.startSite).groundPlot]).toBeDefined();
  });
});

describe('piles (loads of material)', () => {
  it('adds, takes proportionally and takes one material', () => {
    const pile = {};
    addToPile(pile, { gravel: 3, sand: 1 });
    expect(pileTotal(pile)).toBe(4);
    const taken = takeProportional(pile, 2);
    expect(taken.gravel).toBeCloseTo(1.5);
    expect(taken.sand).toBeCloseTo(0.5);
    expect(pileTotal(pile)).toBeCloseTo(2);
    expect(takeMaterial(pile, 'sand', 5)).toBeCloseTo(0.5);
    expect(pile.sand).toBeUndefined();
  });
});

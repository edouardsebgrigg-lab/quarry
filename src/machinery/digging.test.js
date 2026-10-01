import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';
import { bucketFill, cuttingAttack } from './digging.js';
import { getStats, tickJobs } from './index.js';
import { pileTotal } from '../quarry/index.js';

describe('physical machine operation', () => {
  it('a first bite remains refillable until actual loose-volume capacity', () => {
    const game = createTestGame(18), g = game.ctx.ground;
    const m = game.state.machines.find(m => m.type === 'excavator'), stats = getStats(game.data, m);
    m.load = { topsoil: 0.015 };
    expect(bucketFill(g, stats, m.load)).toMatchObject({ loaded: true, full: false });
    const mass = Object.values(g.totals()).reduce((a,b) => a+b, 0) + pileTotal(m.load);
    for (let i = 0; i < 100 && !bucketFill(g, stats, m.load).full; i++) {
      const x = 40 + i * .15, y = g.heightAt(x, 40);
      const r = game.actions.bucketCut(m.id, { x, z: 40, from: { x: x+.25, y: y+.05, z: 40 }, to: { x, y: y-.3, z: 40 }, attack: .9 });
      expect(r.ok).toBe(true);
    }
    expect(bucketFill(g, stats, m.load).full).toBe(true);
    expect(bucketFill(g, stats, m.load).volume).toBeLessThanOrEqual(stats.bucketVolume + 1e-6);
    expect(Object.values(g.totals()).reduce((a,b) => a+b, 0) + pileTotal(m.load)).toBeCloseTo(mass, 4);
  });

  it('slewing sideways, stationary teeth and lifting an open bucket collect nothing', () => {
    const p = { x: 0, y: 0, z: 0 };
    expect(cuttingAttack(p, p, 0, -1)).toBe(0);
    expect(cuttingAttack(p, { x: 0, y: 0, z: .3 }, 0, -1)).toBe(0);
    expect(cuttingAttack(p, { x: -.3, y: 0, z: 0 }, 0, 0)).toBe(0);
    expect(cuttingAttack(p, { x: -.3, y: -.1, z: 0 }, 0, -1)).toBeGreaterThan(.8);
  });

  it('an interrupted assisted cycle keeps its real bite and never generates another on completion', () => {
    const game = createTestGame(19), g = game.ctx.ground;
    const m = game.state.machines.find(m => m.type === 'excavator');
    game.actions.scoop(m.id, { x: 40, z: 40, physical: true, depth: .3, groundY: g.heightAt(40, 40) });
    const y = g.heightAt(40, 40);
    expect(game.actions.bucketCut(m.id, { x: 40, z: 40, from: { x: 40.3, y: y+.05, z: 40 }, to: { x: 40, y: y-.2, z: 40 } }).tonnes).toBeGreaterThan(0);
    const load = pileTotal(m.load), height = g.heightAt(40,40);
    tickJobs(game.ctx, 100);
    expect(pileTotal(m.load)).toBe(load);
    expect(g.heightAt(40,40)).toBe(height);
  });

  it('attachments require an empty idle owned machine and change real cut dimensions', () => {
    const game = createTestGame(19), m = game.state.machines.find(m => m.type === 'excavator');
    const base = getStats(game.data,m);
    expect(game.actions.setDiggerAttachment(m.id,'trench').ok).toBe(true);
    expect(getStats(game.data,m).bucketWidth).toBeLessThan(base.bucketWidth);
    m.load = { clay: .01 };
    expect(game.actions.setDiggerAttachment(m.id,'grading').ok).toBe(false);
    m.load = {}; m.rental = {};
    expect(game.actions.setDiggerAttachment(m.id,'standard').ok).toBe(false);
  });

  it('a breaker leaves collectible rubble rather than holding material in a hammer', () => {
    const game=createTestGame(23),g=game.ctx.ground,m=game.state.machines.find(m=>m.type==='excavator');
    m.tier='utility80';
    const stripped=g.dig({x:50.25,z:50.25,radius:2,bottomY:-20,maxVolume:Infinity});
    g.deposit({x:100,z:100,tonnes:stripped.tonnes,radius:2});
    expect(g.materialResponseAt(50.25,50.25).material).toBe('rock');
    const total=()=>Object.values(g.totals()).reduce((a,b)=>a+b,0)+pileTotal(m.load);
    const mass=total();
    expect(game.actions.setDiggerAttachment(m.id,'breaker').ok).toBe(true);
    const y=g.heightAt(50.25,50.25);
    const r=game.actions.bucketCut(m.id,{x:50.25,z:50.25,from:{x:50.4,y:y+.05,z:50.25},to:{x:50.25,y:y-.15,z:50.25}});
    expect(r.tonnes).toBeGreaterThan(0);
    expect(m.load).toEqual({});
    expect(g.materialResponseAt(50.25,50.25).loose).toBeTruthy();
    expect(total()).toBeCloseTo(mass,2);
    expect(game.actions.setDiggerAttachment(m.id,'standard').ok).toBe(true);
    const h=g.heightAt(50.25,50.25);
    const scoop=game.actions.bucketCut(m.id,{x:50.25,z:50.25,from:{x:50.4,y:h+.05,z:50.25},to:{x:50.25,y:h-.15,z:50.25}});
    expect(scoop.tonnes).toBeGreaterThan(0);
    expect(m.load.rock).toBeGreaterThan(0);
    expect(total()).toBeCloseTo(mass,2);
  });
});

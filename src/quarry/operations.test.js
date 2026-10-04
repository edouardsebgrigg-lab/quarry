import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { workAreas, surveyWorkArea, activeWorkArea } from './operations.js';

describe('sampled excavation work areas', () => {
  it('covers the actual plot with nine disjoint areas and reads current remaining layers', () => {
    const g=createGame({seed:1}), areas=workAreas(g.ctx);
    expect(areas).toHaveLength(9); expect(areas.reduce((t,a)=>t+a.area,0)).toBeCloseTo(152*152);
    const s=surveyWorkArea(g.ctx,areas[0].id);
    expect(s.samples).toHaveLength(9); expect(s.estimates.gravel).toBeGreaterThan(0);
    expect(s.bedrockDepth).toBeGreaterThan(s.coverDepth);
  });
  it('is deterministic, read-only and reacts to extraction at its actual sample positions', () => {
    const g=createGame({seed:2}); const before=JSON.stringify(g.snapshot());
    const first=surveyWorkArea(g.ctx,'0-0'); expect(surveyWorkArea(g.ctx,'0-0')).toEqual(first);
    expect(JSON.stringify(g.snapshot())).toBe(before);
    const p=first.samples[0]; const cut=g.ctx.ground.dig({x:p.x,z:p.z,radius:2,bottomY:g.ctx.ground.heightAt(p.x,p.z)-0.5});
    expect(cut.total).toBeGreaterThan(0);
    expect(surveyWorkArea(g.ctx,'0-0').estimates.topsoil).toBeLessThan(first.estimates.topsoil);
  });
  it('saves a chosen area, leaves machine selection alone and gives navigation back explicitly', () => {
    const g=createGame(); const machine=g.state.player.selectedMachineId;
    expect(g.actions.setWorkArea('1-1').ok).toBe(true); expect(activeWorkArea(g.ctx).id).toBe('1-1');
    expect(g.state.player.selectedMachineId).toBe(machine);
    const old=createGame({state:JSON.parse(JSON.stringify(g.snapshot()))}); expect(activeWorkArea(old.ctx).id).toBe('1-1');
    expect(old.actions.navigateFleet(machine).ok).toBe(true); expect(activeWorkArea(old.ctx)).toBeNull();
    old.actions.setWorkArea('0-0'); old.actions.navigateFleet(null); expect(activeWorkArea(old.ctx)).toBeNull();
  });
  it('rejects nonexistent work areas without changing state and old saves have no chosen area', () => {
    const g=createGame(); const before=JSON.stringify(g.snapshot());
    expect(g.actions.setWorkArea('missing').ok).toBe(false); expect(JSON.stringify(g.snapshot())).toBe(before);
    expect(surveyWorkArea(g.ctx,'missing')).toBeNull(); expect(activeWorkArea(g.ctx)).toBeNull();
  });
});

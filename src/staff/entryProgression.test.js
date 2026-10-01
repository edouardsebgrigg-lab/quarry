import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { openSlots, staffState, hiringFee } from './index.js';
import { sellLoad } from '../economy/depot.js';

describe('first apprentice', () => {
  it('opens after a purchased digger and two real sales, without waiting for dawn', () => {
    const g = createGame({seed:8});
    g.actions.buyMachine('miniDigger','micro08');
    expect(openSlots(g.ctx)).toBe(0);
    sellLoad(g.ctx,g.state.machines[0].id,'topsoil',{topsoil:.1});
    expect(openSlots(g.ctx)).toBe(0);
    sellLoad(g.ctx,g.state.machines[0].id,'topsoil',{topsoil:.1});
    expect(openSlots(g.ctx)).toBe(1);
    const a = staffState(g.ctx).applicants.find(a=>a.apprentice);
    expect(a.wage).toBe(18);
    expect(hiringFee(g.ctx,a)).toBe(18);
    expect(g.actions.hireStaff(a.id).ok).toBe(true);
    expect(g.state.money).toBeGreaterThanOrEqual(0);
  });
  it('renting a digger does not count as owning one', () => {
    const g = createGame({seed:8});
    g.actions.rentMachine('miniDigger','mini16');
    g.state.stats.deliveries = 2;
    expect(openSlots(g.ctx)).toBe(0);
  });
});

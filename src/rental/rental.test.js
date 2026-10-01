import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { ticksPerDay } from '../core/clock.js';
import { rentalTick } from './index.js';

describe('incoming short rentals', () => {
  it('lets starting money try a digger, then refunds the security deposit', () => {
    const game = createGame({seed:2});
    const before = game.state.money;
    const q = game.actions.rentalQuote('miniDigger','mini16',1);
    expect(q.ok).toBe(true);
    expect(q.total).toBeLessThan(before);
    const r = game.actions.rentMachine('miniDigger','mini16',1);
    expect(r.ok).toBe(true);
    expect(game.state.money).toBe(before-q.total);
    expect(game.actions.sellMachine(r.machine.id).ok).toBe(false);
    const refund = game.actions.returnRental(r.machine.id);
    expect(refund.ok).toBe(true);
    expect(game.state.money).toBe(before-q.fee);
    expect(game.state.machines.some(m=>m.id===r.machine.id)).toBe(false);
  });
  it('preserves loaded equipment after expiry and charges only elapsed extra days', () => {
    const game = createGame({seed:2});
    const r = game.actions.rentMachine('miniDigger','mini16',1);
    const m = r.machine;
    m.load = { clay:.1 };
    game.state.time.tick += ticksPerDay(game.data)*1.5;
    const before = game.state.money;
    rentalTick(game.ctx);
    expect(game.state.money).toBe(before);
    expect(game.actions.returnRental(m.id).reason).toMatch(/Unload/);
    const reloaded = createGame({data:game.data,state:JSON.parse(JSON.stringify(game.snapshot()))});
    expect(reloaded.state.machines.find(x=>x.id===m.id).load).toEqual({clay:.1});
    m.load = {};
    const ret = game.actions.returnRental(m.id);
    expect(ret.overdue).toBe(1);
    expect(game.state.money).toBe(before+r.deposit-r.rate);
  });
  it('retains cargo/driver safety and charges damage independently of refunds', () => {
    const game = createGame({seed:2});
    const m = game.actions.rentMachine('miniDigger','mini16').machine;
    game.state.player.driving = m.id;
    expect(game.actions.returnRental(m.id).reason).toMatch(/Get out/);
    game.state.player.driving = null;
    m.condition -= 2;
    expect(game.actions.returnRental(m.id).damage).toBe(3);
  });
});

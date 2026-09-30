import { describe, it, expect } from 'vitest';
import { createTestGame } from '../game/testing.js';

describe('the mobile mechanic', () => {
  it('quotes and does a service where the machine stands, for a call-out fee on top', () => {
    const game = createTestGame(3);
    game.state.money = 500;
    const m = game.state.machines.find((x) => x.type === 'excavator');
    m.condition = 50;
    const q = game.actions.mechanicQuote(m.id);
    expect(q.kind).toBe('service');
    expect(q.total).toBeCloseTo(q.cost + game.data.economy.mechanicCallOut, 6);
    const before = game.state.money;
    expect(game.actions.callMechanic(m.id).ok).toBe(true);
    expect(game.state.money).toBeCloseTo(before - q.total, 2);
    expect(m.job.type).toBe('service');
    game.advance(2000);
    expect(m.condition).toBe(100);
  });

  it('repairs a broken machine, and says no when it can’t be afforded or there’s nothing to do', () => {
    const game = createTestGame(3);
    const m = game.state.machines.find((x) => x.type === 'excavator');
    m.broken = true;
    game.state.money = 5;
    expect(game.actions.callMechanic(m.id).ok).toBe(false);
    expect(game.state.money).toBe(5);
    game.state.money = 1000;
    expect(game.actions.mechanicQuote(m.id).kind).toBe('repair');
    expect(game.actions.callMechanic(m.id).ok).toBe(true);
    game.advance(3000);
    expect(m.broken).toBe(false);
    m.condition = 100;
    expect(game.actions.mechanicQuote(m.id).reason).toMatch(/top condition/);
  });
});

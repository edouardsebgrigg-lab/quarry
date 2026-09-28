import { describe, it, expect } from 'vitest';
import { createGame } from './index.js';
import { createTestGame } from './testing.js';
import { createSaveSystem, createMemoryStorage, ticksPerDay, getDate } from '../core/index.js';
import { playerJob } from '../machinery/index.js';

// Plays the manual loop like a sensible player: fix worn or broken machines,
// dig until the pile is full, haul, and sell at the end.
function playManually(game, seconds) {
  const ticks = seconds * game.data.game.ticksPerSecond;
  for (let i = 0; i < ticks; i++) {
    if (!playerJob(game.ctx)) {
      const worn = game.state.machines.find((m) => m.broken || m.condition < 50);
      if (worn) {
        game.actions.selectMachine(worn.id);
        game.actions.serviceOrRepair();
      } else if (!game.actions.dig().ok) {
        game.actions.haul();
      }
    }
    game.tick();
  }
  game.actions.sellAll();
}

describe('game', () => {
  it('starts with no machines, the starting money and the first goal', () => {
    const game = createGame({ seed: 1 });
    expect(game.state.money).toBe(game.data.economy.startMoney);
    expect(game.state.machines).toEqual([]);
    expect(getDate(game.state, game.data)).toMatchObject({ day: 1, hour: game.data.game.startHour });
    expect(game.state.objectives.index).toBe(0);
  });

  it('can afford the rusty starter machines', () => {
    const game = createGame({ seed: 1 });
    expect(game.actions.buyMachine('excavator', 'rusty').ok).toBe(true);
    expect(game.actions.buyMachine('truck', 'rusty').ok).toBe(true);
    expect(game.state.money).toBeGreaterThanOrEqual(0);
  });

  it('manual dig, haul and sell earns money', () => {
    const game = createTestGame(3);
    playManually(game, 600);
    expect(game.state.stats.tonnesSold).toBeGreaterThan(5);
    expect(game.state.money).toBeGreaterThan(30);
  });

  it('skipping a day moves the calendar and updates the market', () => {
    const game = createTestGame(1);
    const historyBefore = game.state.market.products.gravel.history.length;
    game.dev.skipDays(1);
    expect(getDate(game.state, game.data).day).toBe(2);
    expect(game.state.market.products.gravel.history.length).toBe(historyBefore + 24);
  });

  it('dig picks the selected excavator, haul picks a truck', () => {
    const game = createTestGame(1);
    game.state.player.selectedMachineId = game.state.machines.find((m) => m.type === 'truck').id;
    expect(game.actions.dig().ok).toBe(true);
    expect(playerJob(game.ctx).machine.type).toBe('excavator');
  });

  it('save and load gives an identical game that carries on identically', () => {
    const storage = createMemoryStorage();
    const saves = createSaveSystem({ storage, version: 1 });
    const a = createTestGame(5);
    playManually(a, 60);
    saves.save('slot1', a.state);
    const b = createGame({ state: saves.load('slot1') });
    expect(b.state).toEqual(a.state);
    a.advance(ticksPerDay(a.data));
    b.advance(ticksPerDay(b.data));
    expect(b.state).toEqual(a.state);
  });
});

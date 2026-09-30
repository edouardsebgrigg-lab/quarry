import { describe, it, expect } from 'vitest';
import { createGame } from './index.js';
import { createTestGame } from './testing.js';
import { createSaveSystem, createMemoryStorage, ticksPerDay, getDate } from '../core/index.js';
import { pileTotal } from '../quarry/index.js';

// Plays the machine loop like a sensible player (without the driving): dig buckets into the
// truck until it's full, weigh in at the depot and tip in the gravel bay; service worn machines.
function playMachines(game, loads) {
  const { ctx, actions } = game;
  const ex = game.state.machines.find((m) => m.type === 'excavator');
  const truck = game.state.machines.find((m) => m.type === 'truck');
  const finish = (m) => { for (let i = 0; i < 10000 && m.job; i++) game.tick(); };
  let spot = 0;
  for (let n = 0; n < loads; n++) {
    for (let i = 0; i < 40; i++) {
      for (const m of [ex, truck]) {
        if (m.broken || m.condition < 40) {
          actions.selectMachine(m.id);
          actions.serviceOrRepair();
          finish(m);
        }
      }
      // A bucket left over from the last load goes in first.
      if (pileTotal(ex.load) < 0.01) {
        const x = 20 + (spot % 50) * 1.5;
        const z = 20 + Math.floor(spot / 50) * 1.5;
        spot += 1;
        if (!actions.scoop(ex.id, { x, z }).ok) continue;
        finish(ex);
      }
      if (!actions.dumpBucket(ex.id, { machineId: truck.id }).ok) break;
    }
    actions.weighIn(truck.id);
    const bay = Object.entries(truck.load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed';
    actions.tip(truck.id, { bay });
    finish(truck);
  }
}

describe('game', () => {
  it('starts with the pickup, the starting money and the first goal', () => {
    const game = createGame({ seed: 1 });
    expect(game.state.money).toBe(game.data.economy.startMoney);
    expect(game.state.machines.map((m) => m.type)).toEqual(['pickup']);
    expect(getDate(game.state, game.data)).toMatchObject({ day: 1, hour: game.data.game.startHour });
    expect(game.state.objectives.index).toBe(0);
  });

  it('starts with a shovel and a wheelbarrow, and not quite enough for the first machine', () => {
    const game = createGame({ seed: 1 });
    expect(game.state.tools).toEqual({ shovel: { load: {} }, barrow: { load: {} } });
    const cheapest = Math.min(...Object.values(game.data.machines.types).filter((t) => t.shop !== false)
      .map((t) => t.tiers.rusty.price));
    expect(game.state.money).toBeLessThan(cheapest);
    expect(game.state.money).toBeGreaterThan(cheapest * 0.5); // but it's not far off
    expect(game.actions.buyMachine('miniDigger', 'rusty').ok).toBe(false);
  });

  it('digging, hauling and selling at the depot earns money', () => {
    const game = createTestGame(3);
    game.state.money = 100;
    playMachines(game, 3);
    expect(game.state.stats.tonnesSold).toBeGreaterThan(5);
    expect(game.state.money).toBeGreaterThan(100);
  });

  it('skipping a day moves the calendar and updates the market', () => {
    const game = createTestGame(1);
    const historyBefore = game.state.market.products.gravel.history.length;
    game.dev.skipDays(1);
    expect(getDate(game.state, game.data).day).toBe(2);
    expect(game.state.market.products.gravel.history.length).toBe(historyBefore + 24);
  });

  it('save and load gives an identical game (ground included) that carries on identically', () => {
    const storage = createMemoryStorage();
    const saves = createSaveSystem({ storage, version: 1 });
    const a = createTestGame(5);
    a.state.money = 100;
    playMachines(a, 1);
    saves.save('slot1', JSON.parse(JSON.stringify(a.snapshot())));
    const b = createGame({ state: saves.load('slot1') });
    for (const [x, z] of [[20, 20], [35, 21], [80, 80]]) expect(b.ctx.ground.heightAt(x, z)).toBeCloseTo(a.ctx.ground.heightAt(x, z), 2);
    delete a.state.ground;
    delete b.state.ground;
    expect(b.state).toEqual(a.state);
    a.advance(ticksPerDay(a.data));
    b.advance(ticksPerDay(b.data));
    expect(b.state).toEqual(a.state);
    expect(pileTotal(a.state.machines.find((m) => m.type === 'truck').load)).toBe(0);
  });
});

describe('your company', () => {
  it('has a name you choose, tidied up, with a sensible default', async () => {
    const { createGame } = await import('./index.js');
    const game = createGame({ seed: 1 });
    expect(game.actions.companyName()).toBe('Wolds Quarry Co.');
    expect(game.actions.setCompanyName('   Brady   &  Sons Aggregates  ').name).toBe('Brady & Sons Aggregates');
    expect(game.actions.setCompanyName('').name).toBe('Wolds Quarry Co.');
    expect(game.actions.setCompanyName('x'.repeat(50)).name).toHaveLength(32);
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  createEventBus, createRng, advanceClock, getDate, ticksPerHour, ticksPerDay, loadData,
  createSaveSystem, createMemoryStorage,
} from './index.js';

describe('event bus', () => {
  it('delivers events to listeners and wildcard listeners', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const any = vi.fn();
    bus.on('oreSold', fn);
    bus.on('*', any);
    bus.emit('oreSold', { t: 1 });
    expect(fn).toHaveBeenCalledWith({ t: 1 });
    expect(any).toHaveBeenCalledWith('oreSold', { t: 1 });
  });

  it('stops delivering after unsubscribe', () => {
    const bus = createEventBus();
    const fn = vi.fn();
    const off = bus.on('x', fn);
    off();
    bus.emit('x');
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('rng', () => {
  it('is repeatable for the same seed', () => {
    const a = { rngState: 42 };
    const b = { rngState: 42 };
    const ra = createRng(() => a);
    const rb = createRng(() => b);
    const seqA = Array.from({ length: 5 }, () => ra.next());
    const seqB = Array.from({ length: 5 }, () => rb.next());
    expect(seqA).toEqual(seqB);
    seqA.forEach((n) => expect(n).toBeGreaterThanOrEqual(0));
    seqA.forEach((n) => expect(n).toBeLessThan(1));
  });
});

describe('clock', () => {
  const data = loadData();

  it('has whole ticks per hour', () => {
    expect(Number.isInteger(ticksPerHour(data))).toBe(true);
    expect(ticksPerDay(data)).toBe(data.game.dayLengthSeconds * data.game.ticksPerSecond);
  });

  it('emits hourPassed and dayStarted at the right time', () => {
    const events = createEventBus();
    const hours = [];
    const days = [];
    events.on('hourPassed', (e) => hours.push(e.hour));
    events.on('dayStarted', (e) => days.push(e.day));
    const ctx = { data, events, state: { time: { tick: 23 * ticksPerHour(data) } } };
    for (let i = 0; i < ticksPerHour(data) * 2; i++) advanceClock(ctx);
    expect(hours).toEqual([0, 1]);
    expect(days).toEqual([2]);
    expect(getDate(ctx.state, data)).toEqual({ day: 2, hour: 1, minute: 0 });
  });
});

describe('save system', () => {
  it('round-trips a state and lists slots', () => {
    const saves = createSaveSystem({ storage: createMemoryStorage(), version: 1 });
    saves.save('slot1', { money: 5 }, { day: 3 });
    expect(saves.load('slot1')).toEqual({ money: 5 });
    expect(saves.load('slot2')).toBeNull();
    const slot1 = saves.list().find((s) => s.slotId === 'slot1');
    expect(slot1.summary).toEqual({ day: 3 });
    expect(saves.latest().slotId).toBe('slot1');
  });

  it('upgrades old saves with migrations', () => {
    const storage = createMemoryStorage();
    createSaveSystem({ storage, version: 1 }).save('slot1', { money: 5 });
    const v2 = createSaveSystem({
      storage, version: 2, migrations: { 1: (s) => ({ ...s, reputation: 0 }) },
    });
    expect(v2.load('slot1')).toEqual({ money: 5, reputation: 0 });
  });

  it('refuses saves from a newer version', () => {
    const storage = createMemoryStorage();
    createSaveSystem({ storage, version: 3 }).save('slot1', {});
    expect(() => createSaveSystem({ storage, version: 1 }).load('slot1')).toThrow();
  });
});

describe('wording', () => {
  it('picks a or an', async () => {
    const { withArticle } = await import('./text.js');
    expect(withArticle('excavator')).toBe('an excavator');
    expect(withArticle('truck')).toBe('a truck');
    expect(withArticle('Utility 80')).toBe('a Utility 80');
  });
});

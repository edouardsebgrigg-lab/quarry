import { describe, it, expect } from 'vitest';
import { createGame } from './index.js';
import { logbook, machineLog } from './logbook.js';

describe('the logbook', () => {
  it('keeps what each machine has done', () => {
    const game = createGame({ seed: 5 });
    const e = game.events;
    e.emit('rockDug', { machineId: 'm9', tonnes: 0.4 });
    e.emit('rockDug', { machineId: 'm9', tonnes: 0.35 });
    e.emit('productSold', { machineId: 'm2', tonnes: 3, revenue: 120 });
    e.emit('machineBrokeDown', { machineId: 'm9' });
    e.emit('jobCompleted', { machineId: 'm9', type: 'repair' });
    expect(machineLog(game.ctx, 'm9')).toMatchObject({ tonnesDug: 0.75, breakdowns: 1, repairs: 1 });
    expect(machineLog(game.ctx, 'm2')).toMatchObject({ loads: 1, tonnesDelivered: 3, earned: 120 });
  });

  it('adds up each day and reports the day before each morning, leaving out loans', () => {
    const game = createGame({ seed: 5 });
    const reports = [];
    game.events.on('dailyReport', (r) => reports.push(r));
    game.dev.addMoney(0); // (nothing)
    game.events.emit('moneyChanged', { amount: 80, reason: 'sale', money: 280 });
    game.events.emit('moneyChanged', { amount: -12, reason: 'fuel', money: 268 });
    game.events.emit('moneyChanged', { amount: 500, reason: 'loan', money: 768 });
    game.events.emit('productSold', { machineId: 'm1', tonnes: 2, revenue: 80 });
    game.dev.skipDays(1);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ day: 1, income: 80, spending: 12, profit: 68, loads: 1, tonnesSold: 2 });
    expect(Array.isArray(reports[0].movers)).toBe(true);
  });

  it('keeps Ray’s messages, and the logbook is saved with the game', () => {
    const game = createGame({ seed: 5 });
    game.events.emit('mentorMessage', { from: 'Ray', text: 'Morning!', kind: 'tip' });
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 5, state: saved });
    expect(logbook(g2.ctx).messages.at(-1)).toMatchObject({ from: 'Ray', text: 'Morning!' });
  });
});

describe('unread messages', () => {
  it('counts messages you have not opened, and opening them clears the count', async () => {
    const { unreadMessages, markMessagesRead } = await import('./logbook.js');
    const game = createGame({ seed: 5 });
    game.events.emit('mentorMessage', { from: 'Ray', text: 'One', kind: 'tip' });
    game.events.emit('mentorMessage', { from: 'Ray', text: 'Two', kind: 'tip' });
    expect(unreadMessages(game.ctx)).toBeGreaterThanOrEqual(2);
    markMessagesRead(game.ctx);
    expect(unreadMessages(game.ctx)).toBe(0);
    game.events.emit('mentorMessage', { from: 'Ray', text: 'Three', kind: 'tip' });
    expect(unreadMessages(game.ctx)).toBe(1);
  });
});

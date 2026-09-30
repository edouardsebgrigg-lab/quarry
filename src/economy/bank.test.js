import { describe, it, expect } from 'vitest';
import { createGame } from '../game/index.js';
import { loadData } from '../core/data.js';
import { dailyPayment, bankState, owed } from './bank.js';

// (milestones off: their rewards would change the balances these tests check)
const noMilestones = () => { const data = loadData(); data.milestones.list = []; return data; };
const newGame = (money = 100) => {
  const game = createGame({ seed: 4, data: noMilestones() });
  game.state.money = money;
  return game;
};
const day = (game) => game.events.emit('dayStarted', {});

describe('the bank statement', () => {
  it('records money in and out, merging small charges of one kind in the same hour', () => {
    const game = newGame();
    game.events.emit('moneyChanged', { amount: -0.3, reason: 'fuel', money: 99.7 });
    game.events.emit('moneyChanged', { amount: -0.2, reason: 'fuel', money: 99.5 });
    game.events.emit('moneyChanged', { amount: 42, reason: 'sale', money: 141.5 });
    const s = bankState(game.ctx).statement;
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ reason: 'fuel', amount: -0.5, count: 2, balance: 99.5 });
    expect(s[1]).toMatchObject({ reason: 'sale', amount: 42 });
  });

  it('keeps only the most recent lines', () => {
    const game = newGame();
    const max = game.data.economy.bank.statementLength;
    for (let i = 0; i < max + 20; i++) game.events.emit('moneyChanged', { amount: i % 2 ? 1 : -1, reason: `r${i}`, money: 0 });
    expect(bankState(game.ctx).statement).toHaveLength(max);
  });
});

describe('loans', () => {
  it('works out a fixed daily repayment that clears the loan', () => {
    const p = dailyPayment(1000, 0.012, 14);
    let bal = 1000;
    for (let d = 0; d < 14; d++) bal = bal * 1.012 - p;
    expect(Math.abs(bal)).toBeLessThan(0.05);
    expect(p * 14).toBeGreaterThan(1000);
  });

  it('lends within the limit, pays the money in, and takes a repayment each morning until it is paid off', () => {
    const game = newGame(100);
    const a = game.actions;
    const offers = a.loanOffers();
    expect(offers.some((o) => o.ok)).toBe(true);
    const r = a.takeLoan(250, 7);
    expect(r.ok).toBe(true);
    expect(game.state.money).toBe(350);
    const start = game.state.money;
    for (let d = 0; d < 7; d++) day(game);
    expect(bankState(game.ctx).loans).toHaveLength(0);
    const paid = start - game.state.money;
    expect(paid).toBeCloseTo(r.loan.payment * 7, 0);
    expect(paid).toBeGreaterThan(250);
  });

  it('refuses a loan over the limit or when you already have the most loans, and says why', () => {
    const game = newGame(0);
    const a = game.actions;
    const limit = a.creditLimit();
    const tooBig = game.data.economy.bank.amounts.find((x) => x > limit);
    expect(a.takeLoan(tooBig, 7).ok).toBe(false);
    expect(a.takeLoan(tooBig, 7).reason).toMatch(/limit/i);
    expect(a.takeLoan(123, 7).ok).toBe(false);
  });

  it('can be paid off early for what is left, and the limit grows with what you earn', () => {
    const game = newGame(1000);
    const a = game.actions;
    const before = a.creditLimit();
    const { loan } = a.takeLoan(250, 28);
    day(game);
    const left = bankState(game.ctx).loans[0].balance;
    const money = game.state.money;
    expect(a.repayLoan(loan.id).ok).toBe(true);
    expect(game.state.money).toBeCloseTo(money - left, 2);
    expect(owed(game.ctx)).toBe(0);
    game.state.stats.totalEarned += 2000;
    expect(a.creditLimit()).toBeGreaterThan(before);
  });

  it('is saved with the game', () => {
    const game = newGame(100);
    game.actions.takeLoan(250, 14);
    const saved = JSON.parse(JSON.stringify(game.snapshot()));
    const g2 = createGame({ seed: 4, state: saved, data: noMilestones() });
    expect(bankState(g2.ctx).loans).toHaveLength(1);
    day(g2);
    expect(bankState(g2.ctx).loans[0].daysLeft).toBe(13);
  });
});

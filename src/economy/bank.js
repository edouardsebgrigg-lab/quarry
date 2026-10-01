// The bank: a statement of every payment in and out, and loans with fixed daily repayments.
// Borrowing is limited by what you've earned and what your machines are worth. The overdraft
// (going below zero) still works as an emergency, at its own daily interest (money.js).
// A credit rating (0 to 100, from 50) rises a little each morning you're in credit and with each
// loan paid off, and falls each morning you start overdrawn. It scales how much you can borrow
// (half to one and a half times) and the interest on new loans (1.3 to 0.7 times).
import { addMoney, spendMoney } from './money.js';
import { getDate } from '../core/index.js';

const round2 = (n) => Math.round(n * 100) / 100;

export function bankState(ctx) {
  ctx.state.bank ??= { loans: [], statement: [], nextLoanId: 1 };
  ctx.state.bank.credit ??= ctx.data.economy.bank.credit?.start ?? 50;
  return ctx.state.bank;
}

// The credit rating: { score 0..100, name, limitFactor, rateFactor }.
export function creditRating(ctx) {
  const score = Math.max(0, Math.min(100, bankState(ctx).credit));
  const bands = ctx.data.economy.bank.credit?.bands ?? [[0, 'Fair']];
  const name = bands.find(([min]) => score >= min)?.[1] ?? bands[bands.length - 1][1];
  return { score, name, limitFactor: 0.5 + score / 100, rateFactor: 1.3 - (0.6 * score) / 100 };
}
function moveCredit(ctx, by) {
  const b = bankState(ctx);
  const before = creditRating(ctx).name;
  b.credit = Math.max(0, Math.min(100, Math.round((b.credit + by) * 10) / 10));
  const after = creditRating(ctx).name;
  if (after !== before) ctx.events.emit('creditRatingChanged', { from: before, to: after, score: b.credit });
}

// Every change of money lands on the statement. Lots of small charges of the same kind in the
// same hour (fuel for each bucket) are merged into one line.
export function recordMoney(ctx, { amount, reason, money }) {
  if (!amount) return;
  const b = bankState(ctx);
  const { day, hour } = getDate(ctx.state, ctx.data);
  const last = b.statement[b.statement.length - 1];
  if (last && last.reason === reason && last.day === day && last.hour === hour && Math.sign(last.amount) === Math.sign(amount)) {
    last.amount = round2(last.amount + amount);
    last.count += 1;
    last.balance = money;
    return;
  }
  b.statement.push({ day, hour, reason, amount: round2(amount), count: 1, balance: money });
  const max = ctx.data.economy.bank.statementLength;
  if (b.statement.length > max) b.statement.splice(0, b.statement.length - max);
}

// Fixed daily repayment that pays off `amount` over `days` at `rate` a day.
export function dailyPayment(amount, rate, days) {
  if (rate <= 0) return round2(amount / days);
  return round2((amount * rate) / (1 - (1 + rate) ** -days));
}

export const owed = (ctx) => bankState(ctx).loans.reduce((a, l) => a + l.balance, 0);

// How much more the bank will lend.
export function creditLimit(ctx, fleetValue = 0) {
  const cfg = ctx.data.economy.bank;
  const limit = (cfg.creditBase + cfg.creditPerEarned * (ctx.state.stats.totalEarned ?? 0) + cfg.creditPerFleetValue * fleetValue)
    * creditRating(ctx).limitFactor;
  return Math.max(0, Math.floor(limit - owed(ctx)));
}

// What the bank offers right now: [{ amount, days, rate, payment, total, ok, reason }].
export function loanOffers(ctx, fleetValue = 0) {
  const cfg = ctx.data.economy.bank;
  const room = creditLimit(ctx, fleetValue);
  const full = bankState(ctx).loans.length >= cfg.maxLoans;
  const rate = Math.round(cfg.dailyRate * creditRating(ctx).rateFactor * 10000) / 10000;
  const out = [];
  for (const amount of cfg.amounts) {
    for (const days of cfg.terms) {
      const payment = dailyPayment(amount, rate, days);
      const total = round2(payment * days);
      let reason = null;
      if (full) reason = `You can have ${cfg.maxLoans} loans at once`;
      else if (amount > room) reason = `Your limit is ${room}`;
      out.push({ amount, days, rate, payment, total, ok: !reason, reason });
    }
  }
  return out;
}

export function takeLoan(ctx, amount, days, fleetValue = 0) {
  const offer = loanOffers(ctx, fleetValue).find((o) => o.amount === amount && o.days === days);
  if (!offer) return { ok: false, reason: 'The bank doesn’t offer that loan' };
  if (!offer.ok) return { ok: false, reason: offer.reason };
  const b = bankState(ctx);
  const loan = { id: b.nextLoanId++, amount, balance: amount, rate: offer.rate, payment: offer.payment, daysLeft: days, days };
  b.loans.push(loan);
  addMoney(ctx, amount, 'loan');
  ctx.events.emit('loanTaken', { loanId: loan.id, amount, days, payment: loan.payment });
  return { ok: true, loan };
}

// Pay a loan off early: what's left of it, with no further interest.
export function repayLoan(ctx, loanId) {
  const b = bankState(ctx);
  const loan = b.loans.find((l) => l.id === loanId);
  if (!loan) return { ok: false, reason: 'No such loan' };
  const due = round2(loan.balance);
  if (ctx.state.money < due) return { ok: false, reason: `You need ${due} to pay it off` };
  spendMoney(ctx, due, 'loanRepaid');
  b.loans = b.loans.filter((l) => l !== loan);
  const credit = ctx.data.economy.bank.credit;
  if (credit) moveCredit(ctx, credit.perLoanRepaid);
  ctx.events.emit('loanRepaid', { loanId, amount: due, early: true });
  return { ok: true, paid: due };
}

// Each morning: a day's interest on each loan, then its repayment (even into the overdraft).
export function bankDaily(ctx) {
  const b = bankState(ctx);
  const credit = ctx.data.economy.bank.credit;
  if (credit) moveCredit(ctx, ctx.state.money < 0 ? credit.perOverdrawnDay : credit.perCleanDay);
  for (const loan of [...b.loans]) {
    loan.balance = round2(loan.balance * (1 + loan.rate));
    const pay = round2(Math.min(loan.payment, loan.balance));
    loan.balance = round2(loan.balance - pay);
    loan.daysLeft -= 1;
    spendMoney(ctx, pay, 'loanPayment');
    if (loan.balance <= 0.01 || loan.daysLeft <= 0) {
      if (loan.balance > 0.01) spendMoney(ctx, loan.balance, 'loanPayment'); // (rounding: the last day clears it)
      b.loans = b.loans.filter((l) => l !== loan);
      if (credit) moveCredit(ctx, credit.perLoanRepaid);
      ctx.events.emit('loanRepaid', { loanId: loan.id, amount: pay, early: false });
    }
  }
}

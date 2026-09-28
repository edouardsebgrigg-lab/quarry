// Money and debt. Money can go below zero (from running costs only);
// a negative balance is an emergency loan that charges daily interest.

const round2 = (n) => Math.round(n * 100) / 100;

export function addMoney(ctx, amount, reason) {
  ctx.state.money = round2(ctx.state.money + amount);
  ctx.events.emit('moneyChanged', { amount, reason, money: ctx.state.money });
}

export function spendMoney(ctx, amount, reason) {
  addMoney(ctx, -amount, reason);
}

// Purchases need the full price in hand and no debt.
export function canAfford(ctx, price) {
  return ctx.state.money >= price && ctx.state.money >= 0;
}

export function isInDebt(ctx) {
  return ctx.state.money < 0;
}

export function chargeDailyInterest(ctx) {
  if (ctx.state.money >= 0) return 0;
  const interest = round2(-ctx.state.money * ctx.data.economy.debtInterestPerDay);
  if (interest <= 0) return 0;
  spendMoney(ctx, interest, 'interest');
  ctx.events.emit('interestCharged', { amount: interest, money: ctx.state.money });
  return interest;
}

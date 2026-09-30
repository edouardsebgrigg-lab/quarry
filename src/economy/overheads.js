// Running costs: every week the machines are insured, at a share of what each one cost new.
// A bigger fleet costs more to keep, so selling what you don't use is worth it.
import { spendMoney } from './money.js';
import { getDate } from '../core/index.js';

export function weeklyInsurance(ctx) {
  const rate = ctx.data.economy.insurance.weeklyRate;
  let total = 0;
  for (const m of ctx.state.machines) total += (ctx.data.machines.types[m.type]?.tiers[m.tier]?.price ?? 0) * rate;
  return Math.round(total * 100) / 100;
}

// Each morning: on the first day of a new week, the insurance.
export function overheadsDaily(ctx) {
  const { day } = getDate(ctx.state, ctx.data);
  const every = ctx.data.economy.insurance.everyDays;
  if (day <= 1 || (day - 1) % every !== 0) return 0;
  const amount = weeklyInsurance(ctx);
  if (amount <= 0) return 0;
  spendMoney(ctx, amount, 'insurance');
  ctx.events.emit('overheadsCharged', { amount, machines: ctx.state.machines.length, day });
  return amount;
}

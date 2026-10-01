// What your staff do for prices, read by the depot and the machine jobs. Imports nothing (they
// import it). Workers are in ctx.state.staff (src/staff/index.js).

const workers = (ctx) => ctx.state.staff?.workers ?? [];
const best = (ctx, role, skill) => Math.max(0, ...workers(ctx).filter((w) => w.role === role).map((w) => w.skills[skill]));

// A sales person gets more for every load sold: +1% per star of their selling.
export function staffSaleBonus(ctx) {
  const stars = best(ctx, 'sales', 'sell');
  return stars * (ctx.data.staff?.sales.bonusPerStar ?? 0);
}

// A fitter cuts what services and repairs cost (by their fixing skill).
export function staffMaintenanceMultiplier(ctx) {
  const stars = best(ctx, 'mechanic', 'fix');
  return stars ? ctx.data.staff.mechanic.costByFix[stars - 1] : 1;
}

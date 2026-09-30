// Perks: lasting benefits switched on by milestones (data/milestones.json "perks"). This file
// only reads the state and the data, so the economy and the dealer can ask it for prices
// without depending on the rest of the career module.

// The ids of the perks you have.
export function ownedPerks(ctx) {
  return ctx.state.career?.perks ?? [];
}

export function hasPerk(ctx, id) {
  return ownedPerks(ctx).includes(id);
}

// The combined value of one effect across your perks: multipliers multiply, bonuses add.
function effect(ctx, key, { multiply = false } = {}) {
  const defs = ctx.data.milestones?.perks ?? {};
  let v = multiply ? 1 : 0;
  for (const id of ownedPerks(ctx)) {
    const x = defs[id]?.[key];
    if (typeof x !== 'number') continue;
    v = multiply ? v * x : v + x;
  }
  return v;
}

// What the dealer charges you for something listed at `price` (machines, upgrades, buildings).
export function dealerPrice(ctx, price) {
  const discount = Math.min(0.5, effect(ctx, 'dealerDiscount'));
  return discount > 0 ? Math.round(price * (1 - discount)) : price;
}

// Multiplies the cost of fuel.
export function fuelPerkMultiplier(ctx) {
  return effect(ctx, 'fuelCostMultiplier', { multiply: true });
}

// Extra share paid on top of a clean load's price at the depot (0.04 = 4% more).
export function cleanSaleBonus(ctx) {
  return effect(ctx, 'cleanSaleBonus');
}

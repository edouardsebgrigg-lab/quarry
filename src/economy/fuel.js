// Fuel: every machine job burns litres; the price drifts a little each day.
import { buildingMultiplier } from '../buildings/index.js';
import { spendMoney } from './money.js';
import { fuelPerkMultiplier } from '../career/index.js';

export function fuelPrice(ctx) {
  return ctx.data.economy.fuelPrice * ctx.state.fuel.priceMult;
}

export function chargeFuel(ctx, litres, siteId = ctx.state.currentSiteId) {
  const cost = litres * fuelPrice(ctx) * buildingMultiplier(ctx, 'fuelTank', 'fuelCostMultiplier', siteId) * fuelPerkMultiplier(ctx);
  if (cost > 0) spendMoney(ctx, cost, 'fuel');
  ctx.state.stats.fuelSpent += cost;
  return cost;
}

export function fuelDaily(ctx) {
  const { min, max, dailyNoise } = ctx.data.economy.fuelDrift;
  const f = ctx.state.fuel;
  // Drift randomly, with a gentle pull back toward normal.
  f.priceMult += ctx.rng.gauss() * dailyNoise - 0.2 * (f.priceMult - 1);
  f.priceMult = Math.min(max, Math.max(min, f.priceMult));
}

// Market prices: base price x trend x saturation.
// Trend: slow random swings with momentum, pulled back toward 1.
// Saturation: grows as you sell a product, lowers its price, recovers hourly.

export function createMarketState(data) {
  const products = {};
  for (const id of Object.keys(data.market.products)) {
    products[id] = { trend: 1, velocity: 0, saturation: 0, history: [] };
  }
  const market = { products };
  return market;
}

function productState(ctx, productId) {
  const p = ctx.state.market.products[productId];
  if (!p) throw new Error(`Unknown product ${productId}`);
  return p;
}

export function basePrice(data, productId) {
  return data.materials[productId].basePrice;
}

// Price multiplier after `saturation` tonnes have been sold recently.
export function saturationMultiplier(data, productId, saturation) {
  const k = data.market.products[productId].saturationPerTonne;
  const min = data.market.saturation.minMultiplier;
  return Math.max(min, 1 - k * saturation);
}

// Area under max(min, 1 - k*s) between s = a and s = b.
export function integrateMultiplier(k, min, a, b) {
  if (b <= a) return 0;
  const threshold = k > 0 ? (1 - min) / k : Infinity;
  let area = 0;
  const linEnd = Math.min(b, threshold);
  if (linEnd > a) {
    const F = (s) => s - (k * s * s) / 2;
    area += F(linEnd) - F(a);
  }
  const flatStart = Math.max(a, threshold);
  if (b > flatStart) area += min * (b - flatStart);
  return area;
}

// Current market price per tonne (before delivery cost).
export function currentPrice(ctx, productId) {
  const p = productState(ctx, productId);
  return basePrice(ctx.data, productId) * p.trend * saturationMultiplier(ctx.data, productId, p.saturation);
}

// What selling `tonnes` right now would earn (gross), accounting for the price
// dropping as you sell.
export function quoteSale(ctx, productId, tonnes) {
  const p = productState(ctx, productId);
  const k = ctx.data.market.products[productId].saturationPerTonne;
  const min = ctx.data.market.saturation.minMultiplier;
  const area = integrateMultiplier(k, min, p.saturation, p.saturation + tonnes);
  return basePrice(ctx.data, productId) * p.trend * area;
}

export function applySaleToMarket(ctx, productId, tonnes) {
  productState(ctx, productId).saturation += tonnes;
}

export function priceTrendDirection(ctx, productId) {
  const v = productState(ctx, productId).velocity;
  if (v > 0.002) return 1;
  if (v < -0.002) return -1;
  return 0;
}

export function recordPriceHistory(ctx) {
  const max = ctx.data.market.historyLength;
  for (const id of Object.keys(ctx.state.market.products)) {
    const p = ctx.state.market.products[id];
    p.history.push(Math.round(currentPrice(ctx, id) * 100) / 100);
    if (p.history.length > max) p.history.splice(0, p.history.length - max);
  }
}

export function marketHourly(ctx) {
  const { trend, saturation } = ctx.data.market;
  for (const id of Object.keys(ctx.state.market.products)) {
    const p = ctx.state.market.products[id];
    p.velocity = p.velocity * trend.momentum + ctx.rng.gauss() * trend.noise;
    p.trend += p.velocity - trend.reversion * (p.trend - 1);
    if (p.trend > trend.max || p.trend < trend.min) {
      p.trend = Math.min(trend.max, Math.max(trend.min, p.trend));
      p.velocity = 0;
    }
    p.saturation *= 1 - saturation.recoveryPerHour;
    if (p.saturation < 0.01) p.saturation = 0;
  }
  recordPriceHistory(ctx);
  ctx.events.emit('marketUpdated', {});
}

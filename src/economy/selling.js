// Selling yard stock on the open market.
import { getSiteData, yardAmount, takeFromYard } from '../quarry/index.js';
import { addMoney } from './money.js';
import { quoteSale, applySaleToMarket } from './market.js';

const MIN_SALE = 0.01;

// Net value of selling `tonnes` now (after delivery cost), without selling.
export function quoteNet(ctx, siteId, productId, tonnes) {
  const gross = quoteSale(ctx, productId, tonnes);
  const delivery = tonnes * getSiteData(ctx.data, siteId).deliveryCostPerTonne;
  return { gross, delivery, net: gross - delivery };
}

export function sellProduct(ctx, siteId, productId, tonnes = Infinity) {
  const amount = Math.min(tonnes, yardAmount(ctx, siteId, productId));
  if (amount < MIN_SALE) return { ok: false, reason: 'Nothing to sell' };
  const { gross, delivery, net } = quoteNet(ctx, siteId, productId, amount);
  takeFromYard(ctx, siteId, productId, amount);
  applySaleToMarket(ctx, productId, amount);
  addMoney(ctx, net, 'sale');
  ctx.state.stats.totalEarned += net;
  ctx.state.stats.tonnesSold += amount;
  ctx.events.emit('productSold', {
    siteId, productId, tonnes: amount, gross, delivery, revenue: net, pricePerTonne: gross / amount,
  });
  return { ok: true, tonnes: amount, revenue: net };
}

export function sellAll(ctx, siteId) {
  const products = Object.keys(ctx.state.sites[siteId].yard);
  let tonnes = 0;
  let revenue = 0;
  for (const productId of products) {
    const r = sellProduct(ctx, siteId, productId);
    if (r.ok) {
      tonnes += r.tonnes;
      revenue += r.revenue;
    }
  }
  if (tonnes === 0) return { ok: false, reason: 'The yard is empty' };
  return { ok: true, tonnes, revenue };
}

// Selling at the depot. A road vehicle drives onto the weighbridge (weighIn), then tips or
// unloads into a bay. Each bay takes one material and pays its market price per tonne for a
// clean load; a slightly mixed load is graded down, and a load that's too mixed is paid as
// mixed fill. The mixed-fill bay takes anything at the fill price.
import { pileTotal } from '../quarry/index.js';
import { addMoney } from './money.js';
import { quoteSale, applySaleToMarket } from './market.js';
import { cleanSaleBonus } from '../career/index.js';
import { staffSaleBonus } from '../staff/perks.js';

function tickets(ctx) {
  ctx.state.depot ??= { tickets: {} };
  return ctx.state.depot.tickets;
}

// Record a vehicle's load on the weighbridge. Returns { ok, tonnes }.
export function weighIn(ctx, machine) {
  const tonnes = pileTotal(machine.load);
  if (tonnes < ctx.data.depot.minLoad) return { ok: false, reason: 'Nothing on board to sell' };
  tickets(ctx)[machine.id] = { tonnes, materials: { ...machine.load } };
  ctx.events.emit('weighedIn', { machineId: machine.id, tonnes, materials: { ...machine.load } });
  return { ok: true, tonnes };
}

export const hasTicket = (ctx, machineId) => !!tickets(ctx)[machineId];

// How a load would be paid in a bay: { product, grade, factor, purity, gross, perTonne }.
export function quoteDelivery(ctx, bayId, load, tonnes = pileTotal(load)) {
  const depot = ctx.data.depot;
  const mixed = depot.mixedProduct;
  const total = pileTotal(load);
  const purity = bayId === mixed ? 1 : total > 0 ? (load[bayId] ?? 0) / total : 0;
  const grade = bayId === mixed ? null : depot.grades.find((g) => purity >= g.minPurity - 1e-9) ?? null;
  const product = grade ? bayId : mixed;
  // (a depot account, from a milestone, pays a little more for the top grade)
  const clean = grade && grade === depot.grades[0];
  // (and a sales person gets a bit more for every load)
  const factor = (grade ? grade.factor : 1) * (clean ? 1 + cleanSaleBonus(ctx) : 1) * (1 + staffSaleBonus(ctx));
  const gross = quoteSale(ctx, product, tonnes) * factor;
  return {
    product,
    purity,
    grade: bayId === mixed ? 'Mixed fill' : grade ? grade.name : 'Too mixed: paid as mixed fill',
    factor,
    gross,
    perTonne: tonnes > 0 ? gross / tonnes : 0,
  };
}

// Pay for `load` ({ material: tonnes }, already taken off the vehicle) tipped in a bay.
export function sellLoad(ctx, machineId, bayId, load) {
  const tonnes = pileTotal(load);
  const q = quoteDelivery(ctx, bayId, load, tonnes);
  applySaleToMarket(ctx, q.product, tonnes);
  addMoney(ctx, q.gross, 'sale');
  delete tickets(ctx)[machineId];
  ctx.state.stats.totalEarned += q.gross;
  ctx.state.stats.tonnesSold += tonnes;
  const sale = {
    machineId, bayId, productId: q.product, tonnes, revenue: q.gross, pricePerTonne: q.perTonne, grade: q.grade, purity: q.purity,
  };
  ctx.events.emit('productSold', sale);
  return { ok: true, ...sale };
}

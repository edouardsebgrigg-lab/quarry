// Selling at the depot. A road vehicle drives onto the weighbridge (weighIn), then tips or
// unloads into a bay. Each bay takes one material and pays its market price per tonne for a
// clean load; a slightly mixed load is graded down, and a load that's too mixed is paid as
// mixed fill. The mixed-fill bay takes anything at the fill price.
import { pileTotal } from '../quarry/index.js';
import { addMoney } from './money.js';
import { quoteSale, applySaleToMarket } from './market.js';
import { cleanSaleBonus } from '../career/index.js';
import { staffSaleBonus } from '../staff/perks.js';
import { loadCarrier } from '../machinery/trailers.js';

function tickets(ctx) {
  ctx.state.depot ??= { tickets: {} };
  return ctx.state.depot.tickets ??= {};
}

// Record a vehicle's load on the weighbridge. Returns { ok, tonnes }.
export function weighIn(ctx, machine) {
  const carrier = loadCarrier(ctx,machine);
  const tonnes = pileTotal(carrier?.load ?? {});
  if (tonnes < ctx.data.depot.minLoad) return { ok: false, reason: 'Nothing on board to sell' };
  if (hasTicket(ctx, machine.id)) return { ok: true, tonnes, existing: true };
  tickets(ctx)[machine.id] = { tonnes, carrierId:carrier.id, materials: { ...carrier.load } };
  ctx.events.emit('weighedIn', { machineId: machine.id, tonnes, materials: { ...carrier.load } });
  return { ok: true, tonnes };
}

export function hasTicket(ctx, machineId) {
  const ticket = tickets(ctx)[machineId];
  if (!ticket) return false;
  const owner = ctx.state.machines.find(m => m.id === machineId);
  const carrier = loadCarrier(ctx,owner);
  const load = carrier?.load;
  const ids = new Set([...Object.keys(load ?? {}), ...Object.keys(ticket.materials ?? {})]);
  const valid = load && (!ticket.carrierId || ticket.carrierId === carrier.id) && ticket.materials && pileTotal(load) >= ctx.data.depot.minLoad &&
    Math.abs(pileTotal(load) - ticket.tonnes) < 1e-8 &&
    [...ids].every(id => Math.abs((load[id] ?? 0) - (ticket.materials[id] ?? 0)) < 1e-8);
  if (!valid) delete tickets(ctx)[machineId];
  return !!valid;
}

export function bestDeliveryQuote(ctx, load) {
  return Object.keys(ctx.data.depot.bays).map(bay => ({ bay, ...quoteDelivery(ctx, bay, load) }))
    .sort((a,b) => b.gross - a.gross)[0];
}

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
export function sellLoad(ctx, machineId, bayId, load, { deliveryTarget = null, buyerId = null, priceMultiplier = 1 } = {}) {
  const tonnes = pileTotal(load);
  const q = quoteDelivery(ctx, bayId, load, tonnes);
  q.gross *= priceMultiplier;
  q.perTonne *= priceMultiplier;
  applySaleToMarket(ctx, q.product, tonnes);
  addMoney(ctx, q.gross, 'sale');
  delete tickets(ctx)[machineId];
  ctx.state.stats.totalEarned += q.gross;
  ctx.state.stats.tonnesSold += tonnes;
  if (tonnes >= ctx.data.depot.minLoad) ctx.state.stats.deliveries = (ctx.state.stats.deliveries ?? 0) + 1;
  const sale = {
    machineId, bayId, productId: q.product, tonnes, revenue: q.gross, pricePerTonne: q.perTonne, grade: q.grade, purity: q.purity,
    ...(deliveryTarget ? { deliveryTarget } : {}),
    ...(buyerId ? { buyerId } : {}),
  };
  ctx.events.emit('productSold', sale);
  return { ok: true, ...sale };
}

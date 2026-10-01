// Short incoming rentals are separate from contractor hire-out. Returning never
// deletes a load: the player must unload and release the machine first.
import { ticksPerDay } from '../core/clock.js';
import { canAfford, spendMoney, addMoney } from '../economy/money.js';
import { createMachine, getMachine, isTierUnlocked } from '../machinery/fleet.js';
import { getStats } from '../machinery/stats.js';
import { pileTotal } from '../quarry/index.js';

export const rentalDate = ctx => ctx.state.time.tick / ticksPerDay(ctx.data);

export function rentalQuote(ctx, type, tier, days = 1) {
  const cfg = ctx.data.rental, t = ctx.data.machines.types[type], spec = t?.tiers[tier];
  if (!cfg || !spec || t.shop === false || !cfg.allowedKinds.includes(t.kind) || cfg.excludedTypes.includes(type)) return { ok:false,reason:'This machine is available to buy only' };
  if (!isTierUnlocked(ctx,type,tier)) return { ok:false,reason:'Not unlocked yet' };
  if (!cfg.durations.includes(days)) return { ok:false,reason:'Choose a one-day or three-day rental' };
  const rate = Math.max(cfg.minimumDayRate, Math.ceil(spec.price * cfg.dayRateOfPrice));
  const deposit = Math.min(cfg.maximumDeposit, Math.ceil(spec.price * cfg.depositOfPrice));
  const fee = rate * days;
  return { ok:true,rate,deposit,fee,total:fee+deposit,days };
}

export function rentMachine(ctx, type, tier, days = 1) {
  const q = rentalQuote(ctx,type,tier,days);
  if (!q.ok) return q;
  if (ctx.state.machines.filter(m=>m.rental).length >= ctx.data.rental.maximumActive) return { ok:false,reason:'Return a rental before taking another' };
  if (!canAfford(ctx,q.total)) return { ok:false,reason:`Rental and refundable deposit cost $${q.total}` };
  spendMoney(ctx,q.total,'rental');
  const m = createMachine(ctx.state,ctx.data,type,tier,ctx.state.currentSiteId);
  m.rental = { due:rentalDate(ctx)+days,rate:q.rate,deposit:q.deposit,startCondition:m.condition,paidThrough:rentalDate(ctx)+days };
  ctx.events.emit('machineBought',{machineId:m.id,type,tier,price:q.total,rental:true});
  return { ok:true,machine:m,...q };
}

export function returnRental(ctx, id) {
  const m = getMachine(ctx,id);
  if (!m?.rental) return { ok:false,reason:'That machine belongs to you' };
  if (ctx.state.player.driving === id) return { ok:false,reason:'Get out before returning the rental' };
  if (m.operator || m.job || m.away || m.onHire) return { ok:false,reason:'Finish its work and release the operator first' };
  if (pileTotal(m.load) > 1e-8) return { ok:false,reason:'Unload the rented machine first' };
  const h = m.rental;
  const overdue = Math.max(0,Math.ceil(rentalDate(ctx)-h.paidThrough-1e-8));
  if (overdue) spendMoney(ctx,overdue*h.rate,'rental');
  const damage = Math.max(0,h.startCondition-m.condition)*ctx.data.rental.damagePerCondition;
  const refund = Math.max(0,h.deposit-damage);
  if (refund) addMoney(ctx,refund,'rentalDeposit');
  if (damage > h.deposit) spendMoney(ctx,damage-h.deposit,'rentalDamage');
  ctx.state.machines = ctx.state.machines.filter(x=>x!==m);
  if (ctx.state.player.selectedMachineId === id) ctx.state.player.selectedMachineId = ctx.state.machines.find(x=>x.type!=='trailer')?.id ?? null;
  ctx.events.emit('machineSold',{machineId:id,name:getStats(ctx.data,m).modelName ?? m.type,value:refund,rental:true});
  return { ok:true,refund,damage,overdue };
}

export function rentalTick(ctx) {
  const now = rentalDate(ctx);
  for (const m of ctx.state.machines) {
    const h = m.rental;
    if (!h || now < h.due) continue;
    if (!h.warned) {
      h.warned = true;
      ctx.events.emit('rentalDue',{machineId:m.id,rate:h.rate});
    }
    // Charges follow full calendar days, including when a loaded machine cannot
    // be returned yet; the short final overdue day is settled on return.
    while (now >= h.paidThrough + 1) {
      spendMoney(ctx,h.rate,'rental');
      h.paidThrough += 1;
    }
  }
}

export const rentalActions = ctx => ({
  rentalQuote:(type,tier,days)=>rentalQuote(ctx,type,tier,days),
  rentMachine:(type,tier,days)=>rentMachine(ctx,type,tier,days),
  returnRental:id=>returnRental(ctx,id),
});

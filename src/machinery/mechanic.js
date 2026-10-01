// A mobile mechanic: service or repair a machine where it stands, booked from the laptop, for a
// call-out fee on top of the normal price. (Walking up to it and pressing R has no fee.)
import { canAfford, spendMoney, repairShare } from '../economy/index.js';
import { buildingMultiplier } from '../buildings/index.js';
import { getMachine } from './fleet.js';
import { getStats } from './stats.js';
import { serviceCost } from './wear.js';
import { startJob } from './jobs.js';

// What a call-out would be for this machine: { kind: 'repair' | 'service', cost, fee, total } or
// { reason } when there's nothing to do.
export function mechanicQuote(ctx, machineId) {
  const m = getMachine(ctx, machineId);
  if (!m) return { reason: 'No such machine' };
  if (m.job) return { reason: 'It’s busy' };
  if (m.onHire) return { reason: 'It’s out on hire' };
  const stats = getStats(ctx.data, m);
  const k = buildingMultiplier(ctx, 'workshop', 'maintenanceCostMultiplier', m.siteId);
  const fee = ctx.data.economy.mechanicCallOut;
  if (m.broken) {
    const cost = stats.repairCost * k * repairShare(ctx); // (less the insurer's share)
    return { kind: 'repair', cost, fee, total: cost + fee };
  }
  if (m.condition >= 99.9) return { reason: 'Already in top condition' };
  const cost = serviceCost(stats, m) * k;
  return { kind: 'service', cost, fee, total: cost + fee };
}

export function callMechanic(ctx, machineId) {
  const q = mechanicQuote(ctx, machineId);
  if (q.reason) return { ok: false, reason: q.reason };
  if (!canAfford(ctx, q.total)) return { ok: false, reason: `It costs ${Math.round(q.total)} with the call-out` };
  const r = startJob(ctx, machineId, q.kind, { byPlayer: false });
  if (!r.ok) return r;
  spendMoney(ctx, q.fee, 'callout');
  ctx.events.emit('mechanicCalled', { machineId, kind: q.kind, fee: q.fee });
  return { ok: true, ...q };
}

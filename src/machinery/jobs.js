import { groundAt } from '../quarry/land.js';
// Timed jobs: Dig, Tip, Service, Repair. The player (and later operators) start work
// through startJob(). Digging and tipping work on the real ground (src/ground); tipping in
// a depot bay sells the load. Which machines can do a job goes by what they are (a digger
// has a bucket, a carrier has a bed), not by their exact type.
import { buildingMultiplier, stockpileConfig, stockpileLoad, whyCannotStore, storeStockpile, scoopStockpile, ownsBuilding } from '../buildings/index.js';
import { pileTotal } from '../quarry/index.js';
import { chargeFuel, spendMoney, hasTicket, sellLoad, repairShare } from '../economy/index.js';
import { staffMaintenanceMultiplier } from '../staff/perks.js';
import { getStats, typeName, isDigger, isRoadLegal, unloadSeconds } from './stats.js';
import { applyWear, serviceCost } from './wear.js';
import { getMachine, machineName } from './fleet.js';
import { loadCarrier, combinationStats } from './trailers.js';
import { serviceSupport } from './serviceSupport.js';
import { quoteBuyerDelivery, deliverToBuyer } from '../trade/index.js';

const MIN_LOAD = 0.02;

// Where a tipped load lands: the middle of a ground cell, so heaps come out the same shape.
function snap(ground, x, z) {
  const c = ground.cellSize;
  return { x: ground.x0 + (Math.floor((x - ground.x0) / c) + 0.5) * c, z: ground.z0 + (Math.floor((z - ground.z0) / c) + 0.5) * c };
}

// Size of the bowl one bucket takes out of the ground.
export const bucketRadius = (stats) => 0.4 + stats.bucketVolume * 0.75;

export const JOBS = {
  // One bucket out of the ground at { x, z } (the excavator's bucket target).
  dig: {
    can: (data, m) => isDigger(data, m.type),
    label: 'Digging',
    check(ctx, m, stats, params) {
      if (params.stockpileBay) {
        if (!stockpileConfig(ctx, params.stockpileBay) || !ownsBuilding(ctx, 'stockpiles', m.siteId)) return 'Commission the stockpile bays first';
        if (pileTotal(stockpileLoad(ctx, params.stockpileBay, m.siteId)) <= 0) return 'Stockpile bay is empty';
      } else if (!groundAt(ctx,params.x,params.z)?.workable(params.x, params.z)) return 'You can only dig on your own land';
      if (pileTotal(m.load) > 1e-9) return 'The bucket is full. Dump it first.';
      return null;
    },
    begin(ctx, m, stats, job) {
      if (!job.params.physical) chargeFuel(ctx, stats.fuelPerJob, m.siteId);
      return stats.cycleTime;
    },
    finish(ctx, m, stats, job) {
      // Cab-controlled cycles collect progressively through game.actions.bucketCut.
      // Reloading or leaving the cab cannot conjure a second bucket at completion.
      if (job.params.physical) return;
      const { x, z } = job.params;
      const ground=groundAt(ctx,x,z);
      const r = job.params.stockpileBay ? scoopStockpile(ctx, job.params.stockpileBay, stats.bucketVolume, m.siteId) : ground.dig({
        x, z, radius: bucketRadius(stats), bottomY: ground.heightAt(x, z) - (stats.digDepth ?? 0.7), maxVolume: stats.bucketVolume,
      });
      m.load = { ...r.tonnes };
      if (!job.params.stockpileBay) ctx.state.stats.tonnesDug += r.total;
      ctx.events.emit(job.params.stockpileBay ? 'stockpileScooped' : 'rockDug', { machineId: m.id, tonnes: r.total, materials: { ...r.tonnes }, x, z });
      applyWear(ctx, m, stats);
    },
  },

  // Empty the bed: params { bay } in a depot bay (sold), or { x, z } onto your own ground
  // as a heap. Trucks, trailers and dumpers tip; a pickup is shovelled off by hand (slower).
  tip: {
    can: (data, m) => m.type === 'tractor' || getStats(data, m).capacity > 0,
    label: 'Tipping',
    check(ctx, m, stats, params) {
      const cargo = loadCarrier(ctx, m);
      if (!cargo) return 'Hitch a trailer first';
      if (pileTotal(cargo.load) < MIN_LOAD) return `The ${typeName(ctx.data, m.type).toLowerCase()} is empty`;
      if ([params.stockpileBay,params.bay,params.buyerId].filter(Boolean).length>1) return 'Choose one tipping destination';
      if (params.buyerId) {
        if (!isRoadLegal(ctx.data,m.type)) return 'Only road vehicles can deliver to regional businesses';
        if (!hasTicket(ctx,m.id)) return 'Weigh in on a weighbridge first';
        const q=quoteBuyerDelivery(ctx,params.buyerId,cargo.load,m.id);
        return q.ok?null:q.reason;
      }
      if (params.stockpileBay) return whyCannotStore(ctx, params.stockpileBay, pileTotal(cargo.load), m.siteId, m.id);
      if (params.bay) {
        if (!ctx.data.depot.bays[params.bay]) return 'Not a depot bay';
        if (!isRoadLegal(ctx.data, m.type)) return 'Only road vehicles can deliver to the depot';
        if (!hasTicket(ctx, m.id)) return 'Weigh in on the weighbridge first';
        return null;
      }
      if (!groundAt(ctx,params.x,params.z)?.workable(params.x, params.z)) return 'Tip on your own land, or in a bay at the depot';
      return null;
    },
    begin(ctx, m, stats, job) {
      if(job.params.buyerId) {
        const q=quoteBuyerDelivery(ctx,job.params.buyerId,loadCarrier(ctx,m).load,m.id);
        job.params.buyerTonnes=q.tonnes;job.params.buyerMaterial=q.material;
      }
      chargeFuel(ctx, stats.fuelPerJob, m.siteId);
      return unloadSeconds(combinationStats(ctx, m), pileTotal(loadCarrier(ctx, m)?.load ?? {}));
    },
    finish(ctx, m, stats, job) {
      const cargo = loadCarrier(ctx, m);
      if (!cargo) return;
      if(job.params.buyerId) {
        const sale=deliverToBuyer(ctx,m,job.params.buyerId,job.params.buyerTonnes);
        if(!sale.ok){ctx.events.emit('jobFailed',{machineId:m.id,reason:sale.reason});return;}
        ctx.events.emit('rockHauled',{machineId:m.id,tonnes:sale.tonnes,bay:job.params.buyerMaterial});
        applyWear(ctx,m,stats);return;
      }
      const load = cargo.load;
      const tonnes = pileTotal(load);
      if (job.params.bay && !hasTicket(ctx, m.id)) {
        ctx.events.emit('jobFailed', { machineId: m.id, reason: 'Load changed: weigh in again before selling' });
        return;
      }
      if (job.params.stockpileBay) {
        const stored = storeStockpile(ctx, job.params.stockpileBay, load, m.siteId, m.id);
        if (!stored.ok) { ctx.events.emit('jobFailed', { machineId: m.id, reason: stored.reason }); return; }
      }
      cargo.load = {};
      if (job.params.bay) {
        sellLoad(ctx, m.id, job.params.bay, load);
      } else if (!job.params.stockpileBay) {
        const ground=groundAt(ctx,job.params.x,job.params.z);
        const at = snap(ground, job.params.x, job.params.z);
        ground.deposit({ ...at, tonnes: load, radius: Math.min(1.6, 0.4 + tonnes * 0.35) });
      }
      if (!job.params.bay) delete ctx.state.depot?.tickets?.[m.id];
      ctx.events.emit('rockHauled', { machineId: m.id, tonnes, bay: job.params.bay ?? null });
      applyWear(ctx, m, stats);
    },
  },

  service: {
    label: 'Servicing',
    check(ctx, m) {
      if (m.condition >= 99.9) return 'Already in top condition';
      return null;
    },
    begin(ctx, m, stats, job) {
      job.cost = serviceCost(stats, m) * buildingMultiplier(ctx, 'workshop', 'maintenanceCostMultiplier', m.siteId) * staffMaintenanceMultiplier(ctx) * serviceSupport(ctx, m).cost;
      spendMoney(ctx, job.cost, 'service');
      return stats.serviceTime * buildingMultiplier(ctx, 'workshop', 'maintenanceTimeMultiplier', m.siteId) * serviceSupport(ctx, m).time;
    },
    finish(ctx, m) {
      m.condition = 100;
      ctx.events.emit('machineServiced', { machineId: m.id });
    },
  },

  repair: {
    label: 'Repairing',
    worksWhenBroken: true,
    check(ctx, m) {
      if (!m.broken) return 'Not broken';
      return null;
    },
    begin(ctx, m, stats, job) {
      // (the insurance pays its share of the bill)
      job.cost = stats.repairCost * buildingMultiplier(ctx, 'workshop', 'maintenanceCostMultiplier', m.siteId) * repairShare(ctx) * staffMaintenanceMultiplier(ctx) * serviceSupport(ctx, m).cost;
      spendMoney(ctx, job.cost, 'repair');
      return stats.repairTime * buildingMultiplier(ctx, 'workshop', 'maintenanceTimeMultiplier', m.siteId) * serviceSupport(ctx, m).time;
    },
    finish(ctx, m, stats) {
      m.broken = false;
      m.condition = Math.max(m.condition, stats.repairTo);
      ctx.events.emit('machineRepaired', { machineId: m.id });
    },
  },
};

export function playerJob(ctx) {
  const m = ctx.state.machines.find((x) => x.job?.byPlayer);
  return m ? { machine: m, job: m.job } : null;
}

export function isPlayerBusy(ctx) {
  return playerJob(ctx) !== null;
}

// Checks whether a job could start, without starting it. Returns a reason or null.
export function whyCannotStart(ctx, m, jobType, { byPlayer = true, params = {} } = {}) {
  const def = JOBS[jobType];
  if (!def) return 'Unknown job';
  if (!m) return 'No such machine';
  if (def.can && !def.can(ctx.data, m)) return `A ${typeName(ctx.data, m.type).toLowerCase()} can't do that`;
  if (m.job) return `${machineName(ctx.data, m)} is busy`;
  if (m.broken && !def.worksWhenBroken) return `${machineName(ctx.data, m)} is broken down. Repair it first.`;
  if (byPlayer && isPlayerBusy(ctx)) return 'You are busy with another job';
  return def.check(ctx, m, getStats(ctx.data, m), params);
}

export function startJob(ctx, machineId, jobType, { byPlayer = true, params = {} } = {}) {
  const m = getMachine(ctx, machineId);
  const reason = whyCannotStart(ctx, m, jobType, { byPlayer, params });
  if (reason) return { ok: false, reason };
  const def = JOBS[jobType];
  const job = { type: jobType, elapsed: 0, duration: 0, byPlayer, params };
  job.duration = def.begin(ctx, m, getStats(ctx.data, m), job);
  m.job = job;
  ctx.events.emit('jobStarted', { machineId, type: jobType, byPlayer });
  return { ok: true };
}

export function jobProgress(job) {
  return job.duration > 0 ? Math.min(1, job.elapsed / job.duration) : 1;
}

export function tickJobs(ctx, dt) {
  for (const m of [...ctx.state.machines]) {
    const job = m.job;
    if (!job) continue;
    const def = JOBS[job.type];
    const stats = getStats(ctx.data, m);
    job.elapsed += dt;
    def.progress?.(ctx, m, stats, job, jobProgress(job));
    if (job.elapsed >= job.duration - 1e-9) {
      m.job = null;
      def.finish(ctx, m, stats, job);
      ctx.events.emit('jobCompleted', { machineId: m.id, type: job.type, byPlayer: job.byPlayer });
    }
  }
}

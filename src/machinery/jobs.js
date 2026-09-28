// Timed jobs: Dig, Haul, Service, Repair. The player, operators (later) and
// 3D driving (later) all start work through startJob().
import {
  getSiteData, getZoneInfo, extractRock, facePileRoom, facePileTotal,
  addToFacePile, takeFromFacePile, yardRoom, addToYard, pileTotal,
} from '../quarry/index.js';
import { chargeFuel, spendMoney } from '../economy/index.js';
import { getStats, haulTiming, typeName } from './stats.js';
import { applyWear, serviceCost } from './wear.js';
import { getMachine, machineName } from './fleet.js';

const MIN_LOAD = 0.05;

function deliverLoad(ctx, m, job) {
  const lost = addToYard(ctx, m.siteId, job.load);
  job.delivered = true;
  ctx.events.emit('rockHauled', { machineId: m.id, tonnes: pileTotal(job.load) - lost });
  if (lost > 0.01) {
    ctx.events.emit('message', { level: 'warn', text: `Yard full: ${lost.toFixed(1)} t spilled` });
  }
}

export const JOBS = {
  dig: {
    machineType: 'excavator',
    label: 'Digging',
    check(ctx, m, stats) {
      const site = ctx.state.sites[m.siteId];
      const info = getZoneInfo(ctx, m.siteId, site.selectedZoneId);
      if (info.exhausted) return 'This zone is dug out. Pick another zone.';
      if (info.layer.hardness > stats.maxHardness) {
        return `Rock too hard (hardness ${info.layer.hardness}). You need a stronger excavator.`;
      }
      if (facePileRoom(ctx, m.siteId) < MIN_LOAD) return 'The face pile is full. Haul it away first.';
      return null;
    },
    begin(ctx, m, stats, job) {
      job.zoneId = ctx.state.sites[m.siteId].selectedZoneId;
      chargeFuel(ctx, stats.fuelPerJob);
      return stats.cycleTime;
    },
    finish(ctx, m, stats, job) {
      const want = Math.min(stats.bucket, facePileRoom(ctx, m.siteId));
      const got = extractRock(ctx, m.siteId, job.zoneId, want);
      addToFacePile(ctx, m.siteId, got.materials);
      ctx.state.stats.tonnesDug += got.tonnes;
      ctx.events.emit('rockDug', { machineId: m.id, tonnes: got.tonnes, zoneId: job.zoneId });
      applyWear(ctx, m, stats);
    },
  },

  haul: {
    machineType: 'truck',
    label: 'Hauling',
    check(ctx, m) {
      if (facePileTotal(ctx, m.siteId) < MIN_LOAD) return 'Nothing at the face pile to haul. Dig first.';
      if (yardRoom(ctx, m.siteId) < MIN_LOAD) return 'The yard is full. Sell some stock.';
      return null;
    },
    begin(ctx, m, stats, job) {
      const amount = Math.min(stats.capacity, facePileTotal(ctx, m.siteId), yardRoom(ctx, m.siteId));
      job.load = takeFromFacePile(ctx, m.siteId, amount);
      job.tonnes = amount;
      job.delivered = false;
      const timing = haulTiming(stats, getSiteData(ctx.data, m.siteId));
      job.timing = timing;
      chargeFuel(ctx, stats.fuelPerJob);
      return timing.total;
    },
    progress(ctx, m, stats, job, fraction) {
      if (!job.delivered && fraction >= job.timing.unloadEnd) deliverLoad(ctx, m, job);
    },
    finish(ctx, m, stats, job) {
      if (!job.delivered) deliverLoad(ctx, m, job);
      applyWear(ctx, m, stats);
    },
  },

  service: {
    machineType: null,
    label: 'Servicing',
    check(ctx, m) {
      if (m.condition >= 99.9) return 'Already in top condition';
      return null;
    },
    begin(ctx, m, stats, job) {
      job.cost = serviceCost(stats, m);
      spendMoney(ctx, job.cost, 'service');
      return stats.serviceTime;
    },
    finish(ctx, m) {
      m.condition = 100;
      ctx.events.emit('machineServiced', { machineId: m.id });
    },
  },

  repair: {
    machineType: null,
    label: 'Repairing',
    worksWhenBroken: true,
    check(ctx, m) {
      if (!m.broken) return 'Not broken';
      return null;
    },
    begin(ctx, m, stats, job) {
      job.cost = stats.repairCost;
      spendMoney(ctx, job.cost, 'repair');
      return stats.repairTime;
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
export function whyCannotStart(ctx, m, jobType, { byPlayer = true } = {}) {
  const def = JOBS[jobType];
  if (!def) return 'Unknown job';
  if (!m) return 'No such machine';
  if (def.machineType && m.type !== def.machineType) {
    return `A ${typeName(ctx.data, m.type).toLowerCase()} can't do that`;
  }
  if (m.job) return `${machineName(ctx.data, m)} is busy`;
  if (m.broken && !def.worksWhenBroken) return `${machineName(ctx.data, m)} is broken down. Repair it first.`;
  if (byPlayer && isPlayerBusy(ctx)) return 'You are busy with another job';
  return def.check(ctx, m, getStats(ctx.data, m));
}

export function startJob(ctx, machineId, jobType, { byPlayer = true } = {}) {
  const m = getMachine(ctx, machineId);
  const reason = whyCannotStart(ctx, m, jobType, { byPlayer });
  if (reason) return { ok: false, reason };
  const def = JOBS[jobType];
  const job = { type: jobType, elapsed: 0, duration: 0, byPlayer };
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

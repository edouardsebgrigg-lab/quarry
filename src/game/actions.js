// Player actions. Buttons, hotkeys and 3D driving/digging all call these.
// Every action returns { ok, reason? }.
import { weighIn as depotWeighIn } from '../economy/index.js';
import {
  getMachine, machinesAt, startJob, buyMachine as fleetBuyMachine,
  sellMachine as fleetSellMachine, buyMod as fleetBuyMod, dumpBucket as fleetDumpBucket,
} from '../machinery/index.js';
import { shovelDig, shovelDump, tipBarrow } from '../handtools/index.js';

export function createActions(ctx) {
  const site = () => ctx.state.currentSiteId;

  return {
    // Broken machines come first: repairs the selected machine if broken,
    // else the first broken machine here, else services the selected machine.
    serviceOrRepair() {
      const selected = getMachine(ctx, ctx.state.player.selectedMachineId);
      const broken = machinesAt(ctx, site()).find((x) => x.broken && !x.job);
      const m = selected?.broken ? selected : (broken ?? selected);
      if (!m) return { ok: false, reason: 'No machine selected' };
      return startJob(ctx, m.id, m.broken ? 'repair' : 'service');
    },

    selectMachine(id) {
      if (!getMachine(ctx, id)) return { ok: false, reason: 'No such machine' };
      ctx.state.player.selectedMachineId = id;
      ctx.events.emit('machineSelected', { machineId: id });
      return { ok: true };
    },

    // ---- machines on the ground ----
    // One bucket out of the ground at { x, z } (where the excavator's bucket is).
    scoop: (excavatorId, at) => startJob(ctx, excavatorId, 'dig', { params: { x: at.x, z: at.z } }),
    // Empty the bucket into a bed ({ machineId }) or onto the ground ({ x, z }).
    dumpBucket: (excavatorId, target) => fleetDumpBucket(ctx, excavatorId, target),
    // Empty a truck or pickup: { bay } at the depot (sells it) or { x, z } onto your ground.
    tip: (machineId, where) => startJob(ctx, machineId, 'tip', { params: { ...where } }),
    // Stop on the depot's weighbridge.
    weighIn(machineId) {
      const m = getMachine(ctx, machineId);
      if (!m) return { ok: false, reason: 'No such machine' };
      return depotWeighIn(ctx, m);
    },

    // Real ground: carve a bowl (returns { tonnes: { material: t }, total }) or drop material.
    digGround(opts) {
      if (!ctx.ground) return { tonnes: {}, total: 0 };
      const r = ctx.ground.dig(opts);
      if (r.total > 0) ctx.events.emit('groundDug', { ...r, x: opts.x, z: opts.z });
      return r;
    },
    dumpGround(opts) {
      if (!ctx.ground) return;
      ctx.ground.deposit(opts);
      ctx.events.emit('groundDumped', { x: opts.x, z: opts.z, tonnes: opts.tonnes });
    },

    // Hand tools: dig a shovelful at { x, z }; tip it { into: 'barrow' | 'machine' | 'ground', ... };
    // tip the wheelbarrow at { x, z } or into { machineId }.
    shovelDig: (at) => shovelDig(ctx, at),
    shovelDump: (target) => shovelDump(ctx, target),
    tipBarrow: (at) => tipBarrow(ctx, at),

    buyMachine: (type, tier) => fleetBuyMachine(ctx, type, tier),
    sellMachine: (id) => fleetSellMachine(ctx, id),
    buyMod: (machineId, modId) => fleetBuyMod(ctx, machineId, modId),
  };
}

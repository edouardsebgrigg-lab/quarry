// Player actions. Buttons, hotkeys and (later) 3D driving all call these.
// Every action returns { ok, reason? }.
import { selectZone as quarrySelectZone } from '../quarry/index.js';
import { sellAll as economySellAll, sellProduct as economySellProduct } from '../economy/index.js';
import {
  getMachine, machinesAt, startJob, whyCannotStart, buyMachine as fleetBuyMachine,
  sellMachine as fleetSellMachine, buyMod as fleetBuyMod,
} from '../machinery/index.js';

export function createActions(ctx) {
  const site = () => ctx.state.currentSiteId;

  // Pick the machine for a job: the selected one if it can do it,
  // otherwise the first machine at this site that can.
  function pickMachine(type, jobType) {
    const selected = getMachine(ctx, ctx.state.player.selectedMachineId);
    if (selected && selected.type === type && selected.siteId === site()
      && !whyCannotStart(ctx, selected, jobType)) {
      return { machine: selected };
    }
    const candidates = machinesAt(ctx, site()).filter((m) => m.type === type);
    const ready = candidates.find((m) => !whyCannotStart(ctx, m, jobType));
    if (ready) return { machine: ready };
    const first = selected?.type === type ? selected : candidates[0];
    return { reason: first ? whyCannotStart(ctx, first, jobType) : `You have no ${type}` };
  }

  function runJob(type, jobType) {
    const { machine, reason } = pickMachine(type, jobType);
    if (!machine) return { ok: false, reason };
    return startJob(ctx, machine.id, jobType);
  }

  return {
    dig: () => runJob('excavator', 'dig'),
    haul: () => runJob('truck', 'haul'),

    // Broken machines come first: repairs the selected machine if broken,
    // else the first broken machine here, else services the selected machine.
    serviceOrRepair() {
      const selected = getMachine(ctx, ctx.state.player.selectedMachineId);
      const broken = machinesAt(ctx, site()).find((x) => x.broken && !x.job);
      const m = selected?.broken ? selected : (broken ?? selected);
      if (!m) return { ok: false, reason: 'No machine selected' };
      return startJob(ctx, m.id, m.broken ? 'repair' : 'service');
    },

    sellAll: () => economySellAll(ctx, site()),
    sellProduct: (productId, tonnes) => economySellProduct(ctx, site(), productId, tonnes),

    selectZone: (zoneId) => quarrySelectZone(ctx, site(), zoneId),

    selectMachine(id) {
      if (!getMachine(ctx, id)) return { ok: false, reason: 'No such machine' };
      ctx.state.player.selectedMachineId = id;
      ctx.events.emit('machineSelected', { machineId: id });
      return { ok: true };
    },

    nextMachine() {
      const list = machinesAt(ctx, site());
      if (list.length === 0) return { ok: false, reason: 'No machines' };
      const i = list.findIndex((m) => m.id === ctx.state.player.selectedMachineId);
      const next = list[(i + 1) % list.length];
      ctx.state.player.selectedMachineId = next.id;
      ctx.events.emit('machineSelected', { machineId: next.id });
      return { ok: true };
    },

    buyMachine: (type, tier) => fleetBuyMachine(ctx, type, tier),
    sellMachine: (id) => fleetSellMachine(ctx, id),
    buyMod: (machineId, modId) => fleetBuyMod(ctx, machineId, modId),
  };
}

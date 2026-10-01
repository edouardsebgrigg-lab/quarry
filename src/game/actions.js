// Player actions. Buttons, hotkeys and 3D driving/digging all call these.
// Every action returns { ok, reason? }.
import { weighIn as depotWeighIn, takeLoan as bankTakeLoan, repayLoan as bankRepayLoan, loanOffers as bankLoanOffers, creditLimit as bankCreditLimit, setInsuranceCover } from '../economy/index.js';
import {
  getMachine, machinesAt, startJob, buyMachine as fleetBuyMachine,
  sellMachine as fleetSellMachine, resaleValue, mechanicQuote, callMechanic, buyMod as fleetBuyMod, dumpBucket as fleetDumpBucket, bucketCut as fleetBucketCut,
} from '../machinery/index.js';
import { shovelDig, shovelDump, tipBarrow } from '../handtools/index.js';
import { buyBuilding } from '../buildings/index.js';
import { planEarthworks, buildEarthworks } from '../earthworks/index.js';
import { acceptContract, acceptStandingOrder, declineStandingOrder } from '../contracts/index.js';
import { acceptHire, declineHire } from '../hire/index.js';
import { inspectListing, buyListing } from '../classifieds/index.js';

export const DEFAULT_COMPANY = 'Wolds Quarry Co.';

export function createActions(ctx) {
  const site = () => ctx.state.currentSiteId;
  // (what the bank counts as security: what your machines would fetch)
  const fleetValue = () => ctx.state.machines.reduce((a, m) => a + resaleValue(ctx, m), 0);

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
    // Assisted digging: one bucket out of the ground at { x, z } (where the digger's bucket is).
    scoop: (diggerId, at) => startJob(ctx, diggerId, 'dig', { params: { x: at.x, z: at.z } }),
    // Direct digging: the teeth cut a little bowl { x, z, bottomY, radius } as they move.
    bucketCut: (diggerId, cut) => fleetBucketCut(ctx, diggerId, cut),
    // Empty the bucket (or a `share` of it) into a bed ({ machineId }) or onto the ground ({ x, z }).
    dumpBucket: (diggerId, target, share = 1) => fleetDumpBucket(ctx, diggerId, target, share),
    // Empty a carrier: { bay } at the depot (sells it) or { x, z } onto your ground.
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

    // Earthworks on your land: { mode: 'road' | 'ramp' | 'level', ax, az, bx, bz, width, obstacles }.
    // planWorks only says what would happen and what it costs; buildWorks does it and charges.
    planWorks: (input) => planEarthworks(ctx, input),
    buildWorks: (input) => buildEarthworks(ctx, input),

    buyBuilding: (id) => buyBuilding(ctx, id),

    // The bank: what you could borrow, take a loan ({ amount, days } from the offers), pay one off.
    loanOffers: () => bankLoanOffers(ctx, fleetValue()),
    creditLimit: () => bankCreditLimit(ctx, fleetValue()),
    takeLoan: (amount, days) => bankTakeLoan(ctx, amount, days, fleetValue()),
    repayLoan: (loanId) => bankRepayLoan(ctx, loanId),

    // A mobile mechanic, booked from the laptop: services or repairs a machine where it is.
    mechanicQuote: (machineId) => mechanicQuote(ctx, machineId),
    callMechanic: (machineId) => callMechanic(ctx, machineId),

    // Your company's name (from the intro card; shown on the laptop, the bank and reports).
    setCompanyName(name) {
      const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);
      ctx.state.company = { name: clean || DEFAULT_COMPANY };
      ctx.events.emit('companyNamed', { name: ctx.state.company.name });
      return { ok: true, name: ctx.state.company.name };
    },
    companyName: () => ctx.state.company?.name ?? DEFAULT_COMPANY,

    // The jobs board: take on one of the offers.
    acceptContract: (offerId) => acceptContract(ctx, offerId),
    acceptStandingOrder: () => acceptStandingOrder(ctx),
    declineStandingOrder: () => declineStandingOrder(ctx),
    acceptHire: (machineId) => acceptHire(ctx, machineId),
    setInsuranceCover: (id) => setInsuranceCover(ctx, id),
    declineHire: () => declineHire(ctx),
    inspectListing: (id) => inspectListing(ctx, id),
    buyListing: (id) => buyListing(ctx, id),

    buyMachine: (type, tier) => fleetBuyMachine(ctx, type, tier),
    sellMachine: (id) => fleetSellMachine(ctx, id),
    buyMod: (machineId, modId) => fleetBuyMod(ctx, machineId, modId),
  };
}

// Player actions. Buttons, hotkeys and 3D driving/digging all call these.
// Every action returns { ok, reason? }.
import { weighIn as depotWeighIn, bestDeliveryQuote, takeLoan as bankTakeLoan, repayLoan as bankRepayLoan, loanOffers as bankLoanOffers, creditLimit as bankCreditLimit, setInsuranceCover } from '../economy/index.js';
import {
  getMachine, machinesAt, startJob, isRoadLegal, buyMachine as fleetBuyMachine,
  sellMachine as fleetSellMachine, resaleValue, mechanicQuote, callMechanic, buyMod as fleetBuyMod, dumpBucket as fleetDumpBucket, bucketCut as fleetBucketCut,
} from '../machinery/index.js';
import { shovelDig, shovelDump, tipBarrow } from '../handtools/index.js';
import { buyBuilding, ownsBuilding, upgradeStockpile } from '../buildings/index.js';
import { planEarthworks, buildEarthworks } from '../earthworks/index.js';
import { acceptContract, acceptStandingOrder, declineStandingOrder } from '../contracts/index.js';
import { acceptHire, declineHire } from '../hire/index.js';
import { inspectListing, buyListing } from '../classifieds/index.js';
import { hireApplicant, assignWorker, dismissWorker, configureHaul } from '../staff/index.js';
import { attachTrailer, detachTrailer } from '../machinery/trailers.js';
import { setDiggerAttachment } from '../machinery/fleet.js';
import { setGuideEnabled } from '../progression/index.js';
import { pinMilestone, unpinMilestone } from '../career/index.js';
import { quoteProduction, startProduction, cancelProduction, saveProductionPlan, upgradePlant, servicePlant, queueProduction, pauseProductionQueue, removeQueuedProduction, moveQueuedProduction, setProductionCashReserve } from '../production/index.js';
import { setWorkArea, recordSurvey } from '../quarry/index.js';
import { quoteBuyerDelivery, navigateBuyer } from '../trade/index.js';
import { quoteBlast, startBlast, chargeBlast, fireBlast, abortBlast, cancelBlast, blastClearance } from '../blasting/index.js';
import { buyLand, navigateLand, groundAt } from '../quarry/land.js';

export const DEFAULT_COMPANY = 'Wolds Quarry Co.';

export function createActions(ctx) {
  const site = () => ctx.state.currentSiteId;
  // (what the bank counts as security: what your machines would fetch)
  const fleetValue = () => ctx.state.machines.reduce((a, m) => a + resaleValue(ctx, m), 0);

  return {
    buyLand:id=>buyLand(ctx,id),
    navigateLand:id=>navigateLand(ctx,id),
    setGuideEnabled: enabled => setGuideEnabled(ctx,enabled),
    quoteBlast: request => quoteBlast(ctx,request),
    startBlast: request => startBlast(ctx,request),
    chargeBlast: id => chargeBlast(ctx,id),
    fireBlast: id => fireBlast(ctx,id),
    abortBlast: id => abortBlast(ctx,id),
    cancelBlast: id => cancelBlast(ctx,id),
    blastClearance: id => blastClearance(ctx,id),
    upgradeStockpile: id => upgradeStockpile(ctx,id),
    queueProduction: (request,options) => queueProduction(ctx,request,options),
    pauseProductionQueue: (plantId,paused) => pauseProductionQueue(ctx,plantId,paused),
    removeQueuedProduction: (plantId,id) => removeQueuedProduction(ctx,plantId,id),
    moveQueuedProduction: (plantId,id,direction) => moveQueuedProduction(ctx,plantId,id,direction),
    setProductionCashReserve: amount => setProductionCashReserve(ctx,amount),
    recordSurvey: id => recordSurvey(ctx,id),
    upgradePlant: id => upgradePlant(ctx,id),
    servicePlant: id => servicePlant(ctx,id),
    quoteBuyerDelivery: (id,load) => quoteBuyerDelivery(ctx,id,load),
    navigateBuyer: id => navigateBuyer(ctx,id),
    saveProductionPlan: request => saveProductionPlan(ctx,request),
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
    scoop: (diggerId, at) => startJob(ctx, diggerId, 'dig', { params: { x: at.x, z: at.z, stockpileBay: at.stockpileBay, physical: !!at.physical, depth: at.depth, groundY: at.groundY } }),
    // Direct digging: the teeth cut a little bowl { x, z, bottomY, radius } as they move.
    bucketCut: (diggerId, cut) => fleetBucketCut(ctx, diggerId, cut),
    // Empty the bucket (or a `share` of it) into a bed ({ machineId }) or onto the ground ({ x, z }).
    dumpBucket: (diggerId, target, share = 1) => fleetDumpBucket(ctx, diggerId, target, share),
    // Empty a carrier: { bay } at the depot (sells it) or { x, z } onto your ground.
    tip: (machineId, where) => startJob(ctx, machineId, 'tip', { params: { ...where } }),
    attachTrailer: (tractorId, trailerId) => attachTrailer(ctx, tractorId, trailerId),
    detachTrailer: (tractorId) => detachTrailer(ctx, tractorId),
    setDiggerAttachment: (machineId, attachment) => setDiggerAttachment(ctx, machineId, attachment),
    // World verifies physical placement; home tickets use the same load identity as depot tickets.
    weighIn(machineId, { home = false } = {}) {
      const m = getMachine(ctx, machineId);
      if (!m) return { ok: false, reason: 'No such machine' };
      if (!isRoadLegal(ctx.data, m.type)) return { ok: false, reason: 'Only road vehicles can weigh in' };
      if (home && (m.siteId !== site() || !ownsBuilding(ctx, 'weighbridge', m.siteId))) return { ok: false, reason: 'Commission the home weighbridge first' };
      const r = depotWeighIn(ctx, m);
      return r.ok && home ? { ...r, quote: bestDeliveryQuote(ctx, m.load) } : r;
    },

    // Real ground: carve a bowl (returns { tonnes: { material: t }, total }) or drop material.
    digGround(opts) {
      const ground=groundAt(ctx,opts.x,opts.z);
      if (!ground) return { tonnes: {}, total: 0 };
      const r = ground.dig(opts);
      if (r.total > 0) ctx.events.emit('groundDug', { ...r, x: opts.x, z: opts.z });
      return r;
    },
    dumpGround(opts) {
      const ground=groundAt(ctx,opts.x,opts.z);
      if (!ground) return;
      ground.deposit(opts);
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
    quoteProduction: (request) => quoteProduction(ctx, request),
    startProduction: (request) => startProduction(ctx, request),
    cancelProduction: (id) => cancelProduction(ctx, id),
    setWorkArea: (id) => setWorkArea(ctx, id),

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

    // Optional personal direction; choosing a target never pays or completes anything.
    pinMilestone: (id) => pinMilestone(ctx, id),
    unpinMilestone: () => unpinMilestone(ctx),

    // The jobs board: take on one of the offers.
    acceptContract: (offerId) => acceptContract(ctx, offerId),
    acceptStandingOrder: () => acceptStandingOrder(ctx),
    declineStandingOrder: () => declineStandingOrder(ctx),
    acceptHire: (machineId) => acceptHire(ctx, machineId),
    setInsuranceCover: (id) => setInsuranceCover(ctx, id),
    hireStaff: (applicantId) => hireApplicant(ctx, applicantId),
    assignStaff: (workerId, role, opts) => assignWorker(ctx, workerId, role, opts),
    configureStaffHaul: (workerId, opts) => configureHaul(ctx, workerId, opts),
    dismissStaff: (workerId) => dismissWorker(ctx, workerId),
    declineHire: () => declineHire(ctx),
    inspectListing: (id) => inspectListing(ctx, id),
    buyListing: (id) => buyListing(ctx, id),

    buyMachine: (type, tier) => fleetBuyMachine(ctx, type, tier),
    sellMachine: (id) => fleetSellMachine(ctx, id),
    buyMod: (machineId, modId) => fleetBuyMod(ctx, machineId, modId),
  };
}

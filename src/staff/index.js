// Staff: people you employ to work the quarry while you do something else. Each has four skills
// (digging, driving, selling, fixing; 1 to 5 stars) and a daily wage that goes with them, and you
// give them a role:
//  - Digger operator: works a digger where it's parked, digging out the field bucket by bucket
//    and heaping it beside (a good one keeps each material on its own heap, so loads sell clean);
//  - Haulage driver: loads a road vehicle from the heaps on your field, drives it to the depot,
//    weighs in and sells in the best bay, then drives back (the vehicle is away meanwhile);
//  - Sales and office: more for every load sold (yours too), and takes on work from the jobs board;
//  - Fitter: services and repairs the machines without being asked, and cuts the cost of the work.
// You start with no one. The first post opens once the business is going (data/staff.json slots),
// each further one needs a lot more. Applicants come and go every few days; there's a hiring fee,
// a wage every morning and a couple of days' notice if you let someone go.
// Digging uses the machine job system (startJob 'dig'), hauling the real depot sale (sellLoad), so
// what staff do counts for contracts, milestones and the logbook like your own work.
import { getDate, createRng } from '../core/index.js';
import { spendMoney, chargeFuel, weighIn, quoteDelivery, sellLoad } from '../economy/index.js';
import { getMachine, getStats, machineName, startJob, dumpBucket, isDigger, isRoadLegal } from '../machinery/index.js';
import { applyWear } from '../machinery/wear.js';
import { contractsState, reputation, acceptContract } from '../contracts/index.js';
import { pileTotal } from '../quarry/index.js';
import { loadCarrier, combinationStats, canDeliver, cargoRoom, cargoVolume } from '../machinery/trailers.js';

export const SKILLS = ['dig', 'drive', 'sell', 'fix'];

export function staffState(ctx) {
  ctx.state.staff ??= { workers: [], applicants: [], applicantsDay: 0, nextId: 1, slotsOpen: 0, rngState: (((ctx.state.seed ?? 1) * 2971215073) >>> 0) || 17 };
  for (const w of ctx.state.staff.workers) {
    w.experience ??= { dig: 0, drive: 0, sell: 0, fix: 0 };
    w.delivery ??= null; w.partnerId ??= null;
  }
  return ctx.state.staff;
}
const today = (ctx) => getDate(ctx.state, ctx.data).day;
const cfg = (ctx) => ctx.data.staff;

export function experienceProgress(ctx, w, skill) {
  const need = cfg(ctx).experience[skill] * w.skills[skill];
  return { have: w.experience?.[skill] ?? 0, need, max: w.skills[skill] >= 5 };
}
function learn(ctx, w, skill, amount) {
  if (!(amount > 0) || w.skills[skill] >= 5) return;
  w.experience ??= { dig:0, drive:0, sell:0, fix:0 };
  w.experience[skill] += amount;
  while (w.skills[skill] < 5 && w.experience[skill] >= experienceProgress(ctx,w,skill).need) {
    w.experience[skill] -= experienceProgress(ctx,w,skill).need;
    w.skills[skill] += 1;
    ctx.events.emit('staffSkillGained', { workerId:w.id, name:w.name, skill, stars:w.skills[skill] });
  }
}

export function deliveryOrder(ctx, target) {
  if (!target) return null;
  const c = contractsState(ctx);
  if (target.kind === 'job') return c.active.find(a => a.id === target.id && a.deadline >= today(ctx)) ?? null;
  const st = c.standing.active;
  return target.kind === 'standing' && st?.client === target.client && st.material === target.material ? st : null;
}
export function configureHaul(ctx, workerId, { delivery, partnerId, spot } = {}) {
  const w = staffState(ctx).workers.find(w => w.id === workerId);
  if (!w || w.role !== 'haul') return {ok:false,reason:'Choose a haulage driver'};
  const m = getMachine(ctx,w.machineId);
  if (m?.away || w.phase === 'out') return {ok:false,reason:'Wait until the driver is back and waiting'};
  if (delivery && !deliveryOrder(ctx,delivery)) return {ok:false,reason:'That customer order is no longer active'};
  if (partnerId && !staffState(ctx).workers.some(p => p.id === partnerId && p.role === 'dig')) return {ok:false,reason:'Choose a working digger operator'};
  if (delivery !== undefined) w.delivery = delivery ? { ...delivery } : null;
  if (partnerId !== undefined) w.partnerId = partnerId;
  if (spot) w.spot = {x:spot.x,z:spot.z,face:spot.yaw ?? 0,bed:spot.bed ?? null};
  w.t=0; w.phase='wait';
  return {ok:true};
}

function waitingDriver(ctx, operator, digger) {
  return staffState(ctx).workers.find(w => {
    const m = getMachine(ctx,w.machineId);
    if (w.role !== 'haul' || w.partnerId !== operator.id || !w.spot || !m || m.siteId !== digger.siteId || m.away || m.onHire || m.broken || m.job || !['start','wait'].includes(w.phase)) return false;
    const order = deliveryOrder(ctx,w.delivery);
    if (w.delivery && (!order || order.paidThisWeek || (order.delivered ?? 0) >= (order.tonnes ?? order.tonnesPerWeek))) return false;
    const bed = w.spot.bed ?? w.spot;
    const reach = getStats(ctx.data,digger).reach * cfg(ctx).trip.pairReachFactor;
    return Math.hypot(bed.x-operator.spot.x,bed.z-operator.spot.z) <= reach &&
      cargoRoom(ctx,m,digger.load) > 1e-8 &&
      (!order || quoteDelivery(ctx,order.material,digger.load).purity >= ctx.data.depot.grades[0].minPurity);
  });
}

// ---- posts (slots): how many you may employ, and what opens the next one

function slotMet(ctx, s) {
  const progress = (ctx.state.stats.totalEarned ?? 0) >= s.earned ||
    (s.deliveries != null && (ctx.state.stats.deliveries ?? 0) >= s.deliveries);
  const diggers = ctx.state.machines.filter(m => isDigger(ctx.data, m.type) && !m.rental).length;
  return progress && ctx.state.machines.filter(m => !m.rental).length >= s.machines &&
    diggers >= (s.diggers ?? 0) && reputation(ctx).level >= s.reputation;
}
// Posts open now (once opened, a post stays open).
export function openSlots(ctx) {
  const st = staffState(ctx);
  let n = 0;
  for (const s of cfg(ctx).slots) if (slotMet(ctx, s)) n += 1; else break;
  st.slotsOpen = Math.max(st.slotsOpen, n);
  if (st.slotsOpen > st.workers.length && !st.applicants.length) refreshApplicants(ctx);
  return st.slotsOpen;
}
// What the next post needs, with how far along you are: { text, parts: [{ label, have, need }] } or null.
export function nextSlot(ctx) {
  const s = cfg(ctx).slots[openSlots(ctx)];
  if (!s) return null;
  return {
    text: s.text,
    parts: [
      { label: 'Earned', have: Math.floor(ctx.state.stats.totalEarned ?? 0), need: s.earned, money: true },
      ...(s.deliveries ? [{ label: 'Or sales', have: ctx.state.stats.deliveries ?? 0, need: s.deliveries }] : []),
      { label: 'Machines', have: ctx.state.machines.length, need: s.machines },
      ...(s.diggers ? [{ label: 'Diggers', have: ctx.state.machines.filter(m => isDigger(ctx.data,m.type) && !m.rental).length, need: s.diggers }] : []),
      ...(s.reputation ? [{ label: 'Reputation', have: Math.floor(reputation(ctx).level), need: s.reputation }] : []),
    ],
  };
}

// ---- applicants

const wageFor = (ctx, skills) => cfg(ctx).wage.base + cfg(ctx).wage.perStar * SKILLS.reduce((t, k) => t + skills[k], 0);
export const hiringFee = (ctx, a) => a.wage * (a.apprentice ? cfg(ctx).apprentice.feeDays : cfg(ctx).hiringFeeDays);

function makeApplicant(ctx, rng) {
  const st = staffState(ctx);
  const taken = new Set([...st.workers, ...st.applicants].map((w) => w.name));
  const names = cfg(ctx).names.filter((n) => !taken.has(n));
  const best = rng.pick(SKILLS); // (everyone's good at one thing)
  const skills = {};
  for (const k of SKILLS) skills[k] = k === best ? 3 + Math.floor(rng.next() * 3) : 1 + Math.floor(rng.next() * 3);
  return { id: `a${st.nextId++}`, name: rng.pick(names.length ? names : cfg(ctx).names), skills, wage: wageFor(ctx, skills) };
}

function refreshApplicants(ctx) {
  const st = staffState(ctx);
  const rng = createRng(() => st);
  st.applicants = Array.from({ length: cfg(ctx).applicants }, () => makeApplicant(ctx, rng));
  if (!st.apprenticeHired && cfg(ctx).apprentice) {
    Object.assign(st.applicants[0], { apprentice: true, skills: { ...cfg(ctx).apprentice.skills }, wage: cfg(ctx).apprentice.wage });
  }
  st.applicantsDay = today(ctx);
}

export function hireApplicant(ctx, applicantId) {
  const st = staffState(ctx);
  const a = st.applicants.find((x) => x.id === applicantId);
  if (!a) return { ok: false, reason: 'They’ve found other work' };
  if (st.workers.length >= openSlots(ctx)) return { ok: false, reason: 'No post open: grow the business first' };
  const fee = hiringFee(ctx, a);
  spendMoney(ctx, fee, 'hiringFee');
  const w = { ...a, id: `w${st.nextId++}`, hired: today(ctx), role: null, machineId: null, spot: null, phase: 'idle', t: 0, status: 'Waiting for a job', stats: { dug: 0, loads: 0, sold: 0, fixed: 0 }, experience: {dig:0,drive:0,sell:0,fix:0}, delivery:null, partnerId:null };
  st.workers.push(w);
  if (a.apprentice) st.apprenticeHired = true;
  st.applicants = st.applicants.filter((x) => x !== a);
  ctx.events.emit('staffHired', { workerId: w.id, name: w.name, fee });
  return { ok: true, worker: w };
}

// Let someone go: they finish today and get a couple of days' pay.
export function dismissWorker(ctx, workerId) {
  const st = staffState(ctx);
  const w = st.workers.find((x) => x.id === workerId);
  if (!w) return { ok: false, reason: 'No such person' };
  const m = w.machineId && getMachine(ctx, w.machineId);
  if (m?.away) return { ok: false, reason: `${w.name} is out on the road: wait till they’re back` };
  release(ctx, w);
  const pay = w.wage * cfg(ctx).noticeDays;
  spendMoney(ctx, pay, 'wages');
  st.workers = st.workers.filter((x) => x !== w);
  ctx.events.emit('staffLeft', { workerId: w.id, name: w.name, pay });
  return { ok: true, pay };
}

// ---- roles

export const roleNeeds = (role) => (role === 'dig' ? 'digger' : role === 'haul' ? 'haulage' : null);

// Can this machine be worked in this role? (a digger to dig; a road vehicle with a bed to haul)
export function machineFits(ctx, role, m) {
  if (role === 'dig') return isDigger(ctx.data, m.type);
  if (role === 'haul') return canDeliver(ctx,m);
  return false;
}

// Machines someone could take for a role now: right kind, here, not on hire, not anyone else's;
// the biggest first (the most bucket or bed), so that's the one they're given by default.
export function machinesFor(ctx, role, worker = null) {
  const size = (m) => { const s = combinationStats(ctx, m); return role === 'dig' ? s.bucketVolume ?? 0 : s.capacity ?? 0; };
  return ctx.state.machines.filter((m) => machineFits(ctx, role, m) && !m.onHire && m.siteId === ctx.state.currentSiteId
    && (!m.operator || m.operator === worker?.id)).sort((a, b) => size(b) - size(a));
}

function release(ctx, w) {
  const m = w.machineId && getMachine(ctx, w.machineId);
  if (m && m.operator === w.id) m.operator = null;
  const carrier = m && loadCarrier(ctx,m);
  if (carrier?.operator === w.id) carrier.operator = null;
  w.role = null;
  w.machineId = null;
  w.spot = null;
  w.phase = 'idle';
  w.t = 0;
  w.status = 'Waiting for a job';
}

// Give someone a role. `machineId` for dig and haul; `spot` { x, z, yaw } is where the digger is
// parked (the 3D world knows; without it the middle of the field).
export function assignWorker(ctx, workerId, role, { machineId = null, spot = null } = {}) {
  const st = staffState(ctx);
  const w = st.workers.find((x) => x.id === workerId);
  if (!w) return { ok: false, reason: 'No such person' };
  if (role && !cfg(ctx).roles[role]) return { ok: false, reason: 'No such job' };
  const cur = w.machineId && getMachine(ctx, w.machineId);
  if (cur?.away) return { ok: false, reason: `${w.name} is out on the road: wait till they’re back` };
  let m = null;
  if (role && roleNeeds(role)) {
    m = getMachine(ctx, machineId);
    if (!m || !machineFits(ctx, role, m)) return { ok: false, reason: role === 'dig' ? 'They need a digger' : 'They need a road vehicle with a bed' };
    if (m.operator && m.operator !== w.id) return { ok: false, reason: 'Someone else is on that machine' };
    const carrier = role === 'haul' && loadCarrier(ctx,m);
    if (carrier?.operator && carrier.operator !== w.id) return {ok:false,reason:'Someone else is working its trailer'};
    if (m.onHire) return { ok: false, reason: 'That one’s out on hire' };
  }
  release(ctx, w);
  if (!role) return { ok: true };
  w.role = role;
  if (m) {
    w.machineId = m.id;
    m.operator = w.id;
    if (role === 'haul') loadCarrier(ctx,m).operator = w.id;
  }
  if (role === 'haul' && spot) w.spot = { x: spot.x, z: spot.z, face: spot.yaw ?? 0, bed: spot.bed ?? null };
  if (role === 'dig') {
    const g = ctx.ground;
    const at = spot ?? (g ? { x: g.x0 + (g.nx * g.cellSize) / 2, z: g.z0 + (g.nz * g.cellSize) / 2, yaw: 0 } : { x: 0, z: 0, yaw: 0 });
    w.spot = { x: at.x, z: at.z, face: at.yaw ?? 0, sweep: 0 };
  }
  w.phase = 'start';
  w.t = 0;
  ctx.events.emit('staffAssigned', { workerId: w.id, name: w.name, role, machineId: m?.id ?? null });
  return { ok: true };
}

// ---- the work, a little each tick

const fwd = (a) => ({ x: Math.cos(a), z: -Math.sin(a) }); // (the 3D machines' forward for a yaw)

function digTarget(ctx, w, m) {
  const st = getStats(ctx.data, m);
  const f = fwd(w.spot.face + [-0.32, -0.12, 0.1, 0.3][w.spot.sweep % 4]);
  return { x: w.spot.x + f.x * st.reach, z: w.spot.z + f.z * st.reach };
}
// Where a bucket goes: behind, on a heap per material when the operator is good (3 stars up).
function heapTarget(ctx, w, m) {
  const st = getStats(ctx.data, m);
  const load = m.load ?? {};
  const main = Object.entries(load).sort((a, b) => b[1] - a[1])[0]?.[0];
  const order = ['topsoil', 'clay', 'sand', 'gravel'];
  const k = w.skills.dig >= 3 ? Math.max(0, order.indexOf(main)) : 1;
  const r = st.reach * 0.85;
  for (let tries = 0; tries < 6; tries++) {
    const a = w.spot.face + Math.PI + (k - 1.5) * 0.42 + tries * 0.6;
    const f = fwd(a);
    const p = { x: w.spot.x + f.x * r, z: w.spot.z + f.z * r };
    if (!ctx.ground || ctx.ground.workable(p.x, p.z)) return p;
  }
  return null;
}

function workDig(ctx, w, m, dt) {
  const D = cfg(ctx).dig;
  const st = getStats(ctx.data, m);
  if (m.broken) {
    w.status = `${machineName(ctx.data, m)} has broken down`;
    return;
  }
  if (m.job) return; // (a dig in progress, or a service)
  if (w.t > 0) {
    w.t -= dt;
    return;
  }
  const g = ctx.ground;
  if (!g) {
    w.status = 'Nothing to dig here';
    return;
  }
  switch (w.phase) {
    case 'start':
    case 'aim': {
      if (pileTotal(m.load) > 1e-9) { w.phase='dumpAim'; return; }
      // Swing to the next spot; if it's too deep for the arm (or off the field), turn to new ground.
      for (let i = 0; i < 8; i++) {
        const p = digTarget(ctx, w, m);
        const deep = g.heightAt(w.spot.x, w.spot.z) - g.heightAt(p.x, p.z) > st.reach * D.maxDepthOfReach;
        if (g.workable(p.x, p.z) && !deep) break;
        w.spot.face += 0.7;
      }
      w.target = digTarget(ctx, w, m);
      ctx.events.emit('operatorAim', { machineId: m.id, ...w.target });
      w.phase = 'dig';
      w.t = D.swingSeconds;
      w.status = 'Digging';
      return;
    }
    case 'dig': {
      const r = startJob(ctx, m.id, 'dig', { byPlayer: false, params: { ...w.target } });
      if (!r.ok) {
        w.spot.face += 0.7;
        w.phase = 'aim';
        w.t = 1;
        return;
      }
      m.job.duration *= 1.25 - 0.1 * w.skills.dig; // (a good operator is quicker)
      w.phase = 'dumpAim';
      return;
    }
    case 'dumpAim': {
      if (pileTotal(m.load) <= 1e-9) { // (nothing came up: bedrock, or it's dug out)
        w.spot.face += 0.7;
        w.phase = 'aim';
        return;
      }
      const driver = waitingDriver(ctx,w,m);
      w.loadingMachineId = driver?.machineId ?? null;
      w.heap = driver ? { ...(driver.spot.bed ?? driver.spot) } : heapTarget(ctx, w, m);
      if (!w.heap) {
        w.status = 'Nowhere to heap it';
        w.t = 5;
        return;
      }
      ctx.events.emit('operatorAim', { machineId: m.id, ...w.heap });
      w.phase = 'dump';
      w.t = D.swingSeconds;
      return;
    }
    case 'dump': {
      const driver = waitingDriver(ctx,w,m);
      if (w.loadingMachineId && driver?.machineId !== w.loadingMachineId) { w.phase='dumpAim'; return; }
      const before = pileTotal(m.load);
      const r = dumpBucket(ctx,m.id,w.loadingMachineId ? {machineId:w.loadingMachineId} : {x:w.heap.x,z:w.heap.z,radius:1});
      if (r.ok) {
        const tonnes = before-pileTotal(m.load);
        w.stats.dug = Math.round((w.stats.dug + tonnes) * 100) / 100;
        ctx.events.emit('operatorDump', { machineId:m.id, ...w.heap, intoMachineId:w.loadingMachineId });
      }
      if (pileTotal(m.load) > 1e-9) { w.phase='dumpAim'; w.t=D.swingSeconds; return; }
      w.spot.sweep += 1;
      w.phase = 'aim';
      w.t = D.dumpSeconds;
      return;
    }
    default:
      w.phase = 'aim';
  }
}

// The loose material on the field, by the material it mostly is: { material: [{ x, z, i, j, depth }] }.
function looseHeaps(g) {
  const out = {};
  for (let j = 1; j < g.nz - 1; j++) {
    for (let i = 1; i < g.nx - 1; i++) {
      const d = g.cellLoose(i, j);
      if (d < 0.05) continue;
      const x = g.x0 + (i + 0.5) * g.cellSize;
      const z = g.z0 + (j + 0.5) * g.cellSize;
      (out[g.surfaceAt(x, z)] ??= []).push({ x, z, i, j, depth: d });
    }
  }
  return out;
}

// Fill the bed from the heaps: the material there's most of first, so a load is as clean as it can be.
function loadUp(ctx, m, room, material = null) {
  const g = ctx.ground;
  const heaps = looseHeaps(g);
  const area = g.cellSize * g.cellSize;
  const kinds = Object.entries(heaps).map(([k, cells]) => [k, cells, cells.reduce((t, c) => t + c.depth * area, 0)]).sort((a, b) => b[2] - a[2]);
  const choice = material ? kinds.find(([k]) => k === material) : kinds[0];
  if (!choice || room <= 0) return {};
  const [, cells] = choice;
  const load = {};
  const carrier = loadCarrier(ctx,m);
  const volumeLimit = combinationStats(ctx,m).bedVolume ?? Infinity;
  let got = 0;
  for (const c of cells.sort((a, b) => b.depth - a.depth)) {
    if (got >= room - 1e-6) break;
    const maxVolume = volumeLimit - cargoVolume(ctx,carrier.load) - cargoVolume(ctx,load);
    if (maxVolume <= 1e-8) break;
    const r = g.dig({ x: c.x, z: c.z, radius: g.cellSize * 0.55, bottomY: g.cellHeight(c.i, c.j) - c.depth, maxTonnes: room - got, maxVolume });
    for (const [k, t] of Object.entries(r.tonnes)) load[k] = (load[k] ?? 0) + t;
    got += r.total;
  }
  return load;
}

function bestBay(ctx, load) {
  let best = null;
  for (const bay of Object.keys(ctx.data.depot.bays)) {
    const q = quoteDelivery(ctx, bay, load);
    if (!best || q.gross > best.gross) best = { bay, gross: q.gross };
  }
  return best.bay;
}

function workHaul(ctx, w, m, dt) {
  const T = cfg(ctx).trip;
  const st = combinationStats(ctx,m);
  const carrier = loadCarrier(ctx,m);
  if (!carrier) { w.status = 'Hitch a trailer before hauling'; return; }
  const skill = 1.2 - 0.08 * w.skills.drive; // (time, fuel and wear: a good driver is quicker and kinder)
  if (w.t > 0) {
    w.t -= dt;
    return;
  }
  const travel = (T.metres / (st.speed * T.speedFactor)) * skill;
  switch (w.phase) {
    case 'start':
    case 'wait': {
      if (m.broken) {
        w.status = `${machineName(ctx.data, m)} has broken down`;
        w.t = T.checkEvery;
        return;
      }
      if (m.job) return;
      if (!ctx.ground) {
        w.status = 'Nothing to haul from here';
        return;
      }
      const order = deliveryOrder(ctx,w.delivery);
      if (w.delivery && !order) { w.status='Selected order finished: choose a delivery'; w.t=T.checkEvery; return; }
      if (order && (order.paidThisWeek || (order.delivered ?? 0) >= (order.tonnes ?? order.tonnesPerWeek))) { w.status='Quota filled: waiting for next week'; w.t=T.checkEvery; return; }
      if (order && pileTotal(carrier.load) > 0 && quoteDelivery(ctx,order.material,carrier.load).purity < ctx.data.depot.grades[0].minPurity) { w.status='Unload incompatible material before serving this customer'; w.t=T.checkEvery; return; }
      const remaining = order ? Math.max(0,(order.tonnes ?? order.tonnesPerWeek)-order.delivered) : Infinity;
      const goal = Math.min(st.capacity,remaining);
      const room = Math.max(0, goal - pileTotal(carrier.load));
      const load = w.partnerId ? {} : loadUp(ctx, m, room, order?.material);
      const t = pileTotal(load);
      if (pileTotal(carrier.load) + t < Math.min(T.minLoad, goal)) {
        if (t > 0) ctx.ground.deposit({ ...looseSpot(ctx), tonnes: load, radius: 1 }); // (not worth the trip: put it back)
        w.status = w.partnerId ? 'Waiting for the paired operator to load' : order ? `Waiting for clean ${order.material} for ${order.client}` : 'Waiting for material to haul';
        w.phase = 'wait';
        w.t = T.checkEvery;
        return;
      }
      for (const [k, v] of Object.entries(load)) carrier.load[k] = (carrier.load[k] ?? 0) + v;
      if (order && quoteDelivery(ctx,order.material,carrier.load).purity < ctx.data.depot.grades[0].minPurity) {
        w.status='Mixed heap cannot fill the selected clean order'; w.t=T.checkEvery; return;
      }
      w.tripDelivery = w.delivery ? { ...w.delivery } : null;
      w.tripMaterial = order?.material ?? null;
      w.status = `Loading ${pileTotal(carrier.load).toFixed(1)} t${order ? ` for ${order.client}` : ''}`;
      w.phase = 'out';
      w.t = t * T.loadSecondsPerTonne * skill;
      return;
    }
    case 'out':
      m.away = true;
      carrier.away = true;
      chargeFuel(ctx, st.fuelPerJob * skill, m.siteId);
      applyWear(ctx, m, st, skill);
      ctx.events.emit('staffTripOut', { machineId: m.id, workerId: w.id, name: w.name });
      w.status = 'On the road to the depot';
      w.phase = 'sell';
      w.t = travel;
      return;
    case 'sell': {
      weighIn(ctx, m);
      const load = carrier.load;
      carrier.load = {};
      const r = sellLoad(ctx, m.id, w.tripMaterial ?? bestBay(ctx, load), load, {deliveryTarget:w.tripDelivery});
      w.stats.loads += 1;
      w.stats.sold = Math.round((w.stats.sold + r.revenue) * 100) / 100;
      w.status = `Sold ${r.tonnes.toFixed(1)} t (${r.grade}), coming back`;
      w.phase = 'back';
      w.t = T.unloadSeconds * skill + travel;
      return;
    }
    case 'back':
      chargeFuel(ctx, st.fuelPerJob * skill, m.siteId);
      m.away = false;
      carrier.away = false;
      learn(ctx,w,'drive',1);
      ctx.events.emit('staffTripBack', { machineId: m.id, workerId: w.id, name: w.name });
      w.phase = 'wait';
      return;
    default:
      w.phase = 'wait';
  }
}
function looseSpot(ctx) {
  const g = ctx.ground;
  return { x: g.x0 + (g.nx * g.cellSize) / 2, z: g.z0 + (g.nz * g.cellSize) / 2 };
}

function workMechanic(ctx, w, dt) {
  const M = cfg(ctx).mechanic;
  const busy = w.machineId && getMachine(ctx, w.machineId);
  if (busy?.job) return;
  if (busy) {
    w.stats.fixed += 1;
    w.machineId = null;
  }
  if (w.t > 0) {
    w.t -= dt;
    return;
  }
  w.t = M.checkEvery;
  // (machines in use by someone else at this moment are left alone, unless broken)
  const free = (m) => m.siteId === ctx.state.currentSiteId && !m.job && !m.away && !m.onHire && ctx.state.player?.driving !== m.id;
  const target = ctx.state.machines.filter((m) => free(m) && m.broken)[0]
    ?? ctx.state.machines.filter((m) => free(m) && !m.operator && m.condition < M.below).sort((a, b) => a.condition - b.condition)[0];
  if (!target) {
    w.status = 'Keeping the fleet in order';
    return;
  }
  const kind = target.broken ? 'repair' : 'service';
  const r = startJob(ctx, target.id, kind, { byPlayer: false });
  if (!r.ok) return;
  w.machineId = target.id;
  w.status = `${kind === 'repair' ? 'Repairing' : 'Servicing'} ${machineName(ctx.data, target)}`;
}

export function staffTick(ctx, dt) {
  if (!ctx.state.staff?.workers.length) return;
  const st = staffState(ctx);
  for (const w of st.workers) {
    if (w.role === 'mechanic') {
      workMechanic(ctx, w, dt);
      continue;
    }
    if (w.role === 'sales') {
      w.status = 'In the office';
      continue;
    }
    const m = w.machineId && getMachine(ctx, w.machineId);
    if (!m) {
      if (w.role) release(ctx, w);
      continue;
    }
    if (w.role === 'dig') workDig(ctx, w, m, dt);
    else if (w.role === 'haul') workHaul(ctx, w, m, dt);
  }
}

// ---- each morning: wages, new posts, applicants, and the office takes on work

export function staffDaily(ctx) {
  if (!cfg(ctx)) return;
  const st = staffState(ctx);
  const before = st.slotsOpen;
  const open = openSlots(ctx);
  if (open > before) ctx.events.emit('staffSlotOpened', { slots: open });
  const total = st.workers.reduce((t, w) => t + w.wage, 0);
  if (total > 0) {
    spendMoney(ctx, total, 'wages');
    ctx.events.emit('wagesPaid', { amount: total, workers: st.workers.length });
  }
  if (open > st.workers.length && (!st.applicants.length || today(ctx) - st.applicantsDay >= cfg(ctx).refreshDays)) refreshApplicants(ctx);
  // The office takes the best job on the board when there's room for one.
  if (st.workers.some((w) => w.role === 'sales')) {
    const c = contractsState(ctx);
    if (c.active.length < ctx.data.contracts.maxActive && c.offers.length) {
      const o = [...c.offers].sort((a, b) => b.bonus / b.tonnes - a.bonus / a.tonnes)[0];
      const r = acceptContract(ctx, o.id);
      if (r.ok) ctx.events.emit('staffTookJob', { client: o.client, material: o.material, tonnes: o.tonnes, bonus: o.bonus });
    }
  }
}

export function staffOnEvent(ctx, type, e) {
  if (type === 'dayStarted') staffDaily(ctx);
  if (type === 'productSold' || type === 'machineBought') {
    const before = staffState(ctx).slotsOpen;
    const open = openSlots(ctx);
    if (open > before) ctx.events.emit('staffSlotOpened', { slots: open });
  }
  const workers = ctx.state.staff?.workers ?? [];
  if (type === 'rockDug') {
    const w = workers.find(w=>w.role==='dig' && w.machineId===e.machineId);
    if (w) learn(ctx,w,'dig',e.tonnes);
  }
  if (type === 'productSold') for (const w of workers.filter(w=>w.role==='sales')) learn(ctx,w,'sell',e.tonnes);
  if (type === 'machineServiced' || type === 'machineRepaired') {
    const w = workers.find(w=>w.role==='mechanic' && w.machineId===e.machineId);
    if (w) learn(ctx,w,'fix',1);
  }
}

export const workerFor = (ctx, machine) => (machine?.operator ? staffState(ctx).workers.find((w) => w.id === machine.operator) ?? null : null);
export { staffSaleBonus, staffMaintenanceMultiplier } from './perks.js';

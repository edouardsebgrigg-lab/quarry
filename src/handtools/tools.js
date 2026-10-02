// Hand tools: the shovel and the wheelbarrow. What they carry is dug ground material
// ({ material: tonnes }); how much fits is a loose volume (data/tools.json), so a barrow
// holds more tonnes of heavy gravel than of light topsoil.
//
// - shovelDig() takes one shovelful out of the real ground (loose piles first).
// - shovelDump() tips the shovel into the barrow, a vehicle's bed, or onto the ground as a heap.
// - tipBarrow() empties the barrow onto the ground (a real pile) or into a low bed (the pickup).
// Tonnes are always conserved: whatever doesn't fit stays where it was.
import { pileTotal, addToPile, takeProportional } from '../quarry/index.js';
import { getMachine } from '../machinery/index.js';
import { loadCarrier, combinationStats, cargoRoom } from '../machinery/trailers.js';

const EPS = 1e-6;

export function createToolsState() {
  return { shovel: { load: {} }, barrow: { load: {} } };
}

const tools = (ctx) => ctx.state.tools;

// Loose volume (m³) of a load of dug material.
export function looseVolume(data, load) {
  let v = 0;
  for (const [id, t] of Object.entries(load)) {
    const g = data.ground.materials[id];
    v += t / (g ? g.density / g.swell : 1.5);
  }
  return v;
}

// The middle of the ground cell under (x, z): tipping there gives the same neat heap
// wherever you stand, rather than a flatter one when you happen to tip on a cell corner.
function cellCentre(ground, x, z) {
  const c = ground.cellSize;
  return { x: ground.x0 + (Math.floor((x - ground.x0) / c) + 0.5) * c, z: ground.z0 + (Math.floor((z - ground.z0) / c) + 0.5) * c };
}

// Takes a share (0..1) of every material in a load.
function takeShare(load, share) {
  return takeProportional(load, pileTotal(load) * Math.min(1, Math.max(0, share)));
}

export const shovelLoad = (ctx) => tools(ctx).shovel.load;
export const barrowLoad = (ctx) => tools(ctx).barrow.load;
export const shovelFull = (ctx) => pileTotal(shovelLoad(ctx)) > EPS;
export const barrowVolume = (ctx) => looseVolume(ctx.data, barrowLoad(ctx));
export const barrowFill = (ctx) => barrowVolume(ctx) / ctx.data.tools.wheelbarrow.volume;

// Can you dig at (x, z)? Returns a reason, or null.
export function whyCannotDig(ctx, x, z) {
  if (!ctx.ground || !ctx.ground.workable(x, z)) return 'You can only dig on your own field';
  if (shovelFull(ctx)) return 'Tip the shovel first';
  return null;
}

// One shovelful out of the ground at (x, z).
export function shovelDig(ctx, { x, z }) {
  const reason = whyCannotDig(ctx, x, z);
  if (reason) return { ok: false, reason };
  const spec = ctx.data.tools.shovel;
  const resistance = ctx.ground.digResistanceAt?.(x,z) ?? spec.force;
  const effort = Math.max(spec.minimumBiteFactor,Math.min(1,spec.force/Math.max(1,resistance)));
  const r = ctx.ground.dig({
    x, z, radius: spec.radius, bottomY: ctx.ground.heightAt(x, z) - spec.depth * effort, maxVolume: spec.volume * effort,
  });
  if (r.total < 1e-4) return { ok: false, reason: 'Solid rock: too hard for a shovel' };
  tools(ctx).shovel.load = r.tonnes;
  ctx.state.stats.tonnesDug += r.total;
  ctx.events.emit('shovelDug', { x, z, tonnes: r.total, materials: { ...r.tonnes } });
  return { ok: true, tonnes: r.total, materials: { ...r.tonnes } };
}

// Tip the shovel: target is { into: 'barrow' }, { into: 'machine', machineId } (a bed) or
// { into: 'ground', x, z }. Returns { ok, tonnes } (what went in); the rest stays on the shovel.
export function shovelDump(ctx, target) {
  const load = shovelLoad(ctx);
  const total = pileTotal(load);
  if (total <= EPS) return { ok: false, reason: 'The shovel is empty' };
  let moved = 0;
  if (target.into === 'barrow') {
    const cap = ctx.data.tools.wheelbarrow.volume;
    const room = cap - barrowVolume(ctx);
    if (room < cap * 0.02) return { ok: false, reason: 'The wheelbarrow is full' };
    const part = takeShare(load, room / looseVolume(ctx.data, load));
    moved = pileTotal(part);
    addToPile(barrowLoad(ctx), part);
  } else if (target.into === 'machine') {
    const r = intoBed(ctx, target.machineId, load);
    if (!r.ok) return r;
    moved = r.tonnes;
  } else {
    const { x, z } = target;
    if (!ctx.ground || !ctx.ground.workable(x, z)) return { ok: false, reason: 'You can only tip it on your field (or into the barrow)' };
    moved = ctx.ground.deposit({ ...cellCentre(ctx.ground, x, z), tonnes: load, radius: 0.25 });
    tools(ctx).shovel.load = {};
  }
  if (pileTotal(load) <= EPS) tools(ctx).shovel.load = {};
  ctx.events.emit('shovelDumped', { into: target.into, machineId: target.machineId ?? null, tonnes: moved, x: target.x, z: target.z });
  return { ok: true, tonnes: moved };
}

// Put as much of a load as fits into a vehicle's bed. Returns { ok, tonnes }.
function intoBed(ctx, machineId, load) {
  const m = getMachine(ctx, machineId);
  const carrier = loadCarrier(ctx,m);
  const cap = m ? combinationStats(ctx,m).capacity ?? 0 : 0;
  if (!cap) return { ok: false, reason: 'That has nowhere to put it' };
  if (m.job || carrier?.job) return { ok: false, reason: 'Wait for it to finish' };
  const room = cargoRoom(ctx,m,load);
  if (room < 0.005) return { ok: false, reason: 'It\'s full' };
  const moved = Math.min(room, pileTotal(load));
  addToPile(carrier.load, takeProportional(load, moved));
  ctx.events.emit('truckLoaded', { machineId: m.id, carrierId:carrier.id, tonnes: pileTotal(carrier.load) });
  return { ok: true, tonnes: moved };
}

// Tip the wheelbarrow: onto your ground at (x, z) as a pile, or into a vehicle's bed
// ({ machineId }; anything that doesn't fit stays in the barrow).
export function tipBarrow(ctx, { x, z, machineId = null }) {
  const load = barrowLoad(ctx);
  const total = pileTotal(load);
  if (total <= EPS) return { ok: false, reason: 'The wheelbarrow is empty' };
  let moved;
  if (machineId) {
    const r = intoBed(ctx, machineId, load);
    if (!r.ok) return r;
    moved = r.tonnes;
  } else {
    if (!ctx.ground || !ctx.ground.workable(x, z)) return { ok: false, reason: 'Tip it on your field, or into the pickup' };
    moved = ctx.ground.deposit({ ...cellCentre(ctx.ground, x, z), tonnes: load, radius: 0.35 }); // it slumps from there
    tools(ctx).barrow.load = {};
  }
  if (pileTotal(load) <= EPS) tools(ctx).barrow.load = {};
  ctx.events.emit('barrowTipped', { machineId, tonnes: moved, x, z });
  return { ok: true, tonnes: moved };
}

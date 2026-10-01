// A rough balance check of the early game: how long each rung of the machine ladder takes to
// save for, playing the obvious way (dig topsoil, drive it to the depot, sell it clean). The
// timings are estimates of real play, not a simulation; they catch prices drifting out of line.
import { describe, it, expect } from 'vitest';
import { loadData } from '../core/data.js';
import { topSpeedKmh, unloadSeconds } from '../machinery/index.js';
import { worksCost } from '../earthworks/index.js';

const data = loadData();
const ENTRY = {pickup:'rusty',miniDigger:'mini16',tractor:'utility60',trailer:'singleTipper',excavator:'utility80',truck:'rusty'};
const tier = (type, t = ENTRY[type]) => data.machines.types[type].tiers[t];
const TOPSOIL = data.materials.topsoil.basePrice;
const g = data.ground.materials.topsoil;
const LOOSE = g.density / g.swell; // t per loose m³
const ROUTE = 1200; // metres from your gate to the depot by road
const DEPOT_TIME = 60; // s: turning in, the weighbridge, backing into the bay
const FUEL = data.economy.fuelPrice;

// Seconds for one round trip, and the money it makes.
function trip(carrier, { digger = null, springs = false } = {}) {
  const c = carrier === 'tractor' ? { ...tier('tractor'), capacity:tier('trailer').capacity, tipTime:tier('trailer').tipTime } : tier(carrier);
  const load = c.capacity + (springs ? data.mods.stifferSprings.effects.capacity.add : 0);
  let fill;
  if (digger) {
    const d = tier(digger);
    fill = Math.ceil(load / (d.bucketVolume * LOOSE)) * (d.cycleTime + 2.5) + 30;
  } else {
    fill = (load / (data.tools.shovel.volume * LOOSE)) * 1.3 + 60; // shovelling straight into the bed
  }
  const drive = (2 * ROUTE) / (0.6 * (topSpeedKmh(c) / 3.6));
  const seconds = fill + drive + DEPOT_TIME + unloadSeconds(c, load);
  const fuel = (c.fuelPerJob + (digger ? Math.ceil(load / (tier(digger).bucketVolume * LOOSE)) * tier(digger).fuelPerJob : 0)) * FUEL;
  return { seconds, money: load * TOPSOIL - fuel };
}

const minutesToSave = (price, have, t) => Math.max(0, price - have) / (t.money / t.seconds) / 60;

describe('early-game pacing', () => {
  it('keeps the first digger and tractor/trailer within a few pickup sales', () => {
    const small = data.machines.types.miniDigger.tiers.micro08;
    expect(small.price).toBeLessThanOrEqual(data.economy.startMoney);
    const pairPrice = data.machines.types.tractor.tiers.yard35.price + data.machines.types.trailer.tiers.yardTipper.price;
    const t = trip('pickup', { digger:'miniDigger', springs:true });
    expect(t.money).toBeGreaterThan(0);
    const minutes = minutesToSave(pairPrice,0,t);
    expect(minutes).toBeLessThan(40);
  });

  it('a practical tractor and independent trailer earn positive net revenue', () => {
    const t = trip('tractor',{digger:'excavator'});
    expect(t.money).toBeGreaterThan(tier('trailer').capacity * TOPSOIL * .8);
    expect(Number.isFinite(t.seconds)).toBe(true);
    expect(t.seconds / 60).toBeLessThan(15);
  });

  // T8: groundworks come up as a goal once you have the tractor. Their labour should cost about
  // what a trailer load earns, so building one is a choice, not a week's savings.
  it('groundworks cost no more than about one good trailer load', () => {
    const load = tier('trailer').capacity * TOPSOIL; // a full trailer of clean topsoil
    const cost = (mode, length) => worksCost(data, mode, length * data.works.modes[mode].width.default);
    const rows = [['road', 20], ['ramp', 15], ['level', 8]].map(([mode, length]) => ({ mode, length, cost: cost(mode, length) }));
    console.table(rows.map((r) => ({ ...r, loads: +(r.cost / load).toFixed(2) })));
    for (const r of rows) expect(r.cost, r.mode).toBeLessThanOrEqual(load);
    // The goal's reward pays back a small level area.
    const reward = data.objectives.steps.find((s) => s.id === 'buildWorks').reward;
    expect(reward).toBeGreaterThanOrEqual(cost('level', 8) * 0.8);
  });

  // Milestones (data/milestones.json) pay rewards too. The ones a player can reach while still
  // climbing the first machine ladder shouldn't buy the ladder for them: at most a quarter of it.
  it('early milestone rewards stay under a quarter of the machine ladder', () => {
    const ladder = ['miniDigger', 'tractor', 'trailer', 'excavator', 'truck'].reduce((a, t) => a + tier(t).price, 0);
    const early = ['clean5', 'sold25', 'works1', 'dug50'];
    const rewards = data.milestones.list.filter((m) => early.includes(m.id)).reduce((a, m) => a + m.reward, 0);
    expect(rewards).toBeLessThanOrEqual(ladder * 0.25);
  });
});

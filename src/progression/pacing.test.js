// A rough balance check of the early game: how long each rung of the machine ladder takes to
// save for, playing the obvious way (dig topsoil, drive it to the depot, sell it clean). The
// timings are estimates of real play, not a simulation; they catch prices drifting out of line.
import { describe, it, expect } from 'vitest';
import { loadData } from '../core/data.js';
import { topSpeedKmh, unloadSeconds } from '../machinery/index.js';

const data = loadData();
const tier = (type, t = 'rusty') => data.machines.types[type].tiers[t];
const TOPSOIL = data.materials.topsoil.basePrice;
const g = data.ground.materials.topsoil;
const LOOSE = g.density / g.swell; // t per loose m³
const ROUTE = 1200; // metres from your gate to the depot by road
const DEPOT_TIME = 60; // s: turning in, the weighbridge, backing into the bay
const FUEL = data.economy.fuelPrice;

// Seconds for one round trip, and the money it makes.
function trip(carrier, { digger = null, springs = false } = {}) {
  const c = tier(carrier);
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
  it('each rung of the ladder takes a few trips, not hours', () => {
    const steps = [];
    let money = data.economy.startMoney + data.objectives.steps.find((s) => s.id === 'firstSale').reward;
    money -= data.mods.stifferSprings.price;
    const rungs = [
      ['miniDigger', trip('pickup', { springs: true })],
      ['tractor', trip('pickup', { digger: 'miniDigger', springs: true })],
      ['excavator', trip('tractor', { digger: 'miniDigger' })],
      ['truck', trip('tractor', { digger: 'excavator' })],
    ];
    for (const [type, t] of rungs) {
      const price = tier(type).price;
      const minutes = minutesToSave(price, money, t);
      steps.push({ type, price, minutes: Math.round(minutes), perTrip: Math.round(t.money), tripMin: +(t.seconds / 60).toFixed(1) });
      money = Math.max(0, money - price);
    }
    console.table(steps);
    for (const s of steps) {
      expect(s.minutes, s.type).toBeGreaterThanOrEqual(5);
      expect(s.minutes, s.type).toBeLessThanOrEqual(40);
    }
  });
});

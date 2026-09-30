// Builds the state for a brand-new game.
import { startTick } from '../core/index.js';
import { createMarketState, recordPriceHistory } from '../economy/index.js';
import { createSitesState } from '../quarry/index.js';
import { createMachine } from '../machinery/index.js';
import { createObjectivesState } from '../progression/index.js';
import { createToolsState } from '../handtools/index.js';

export function createNewState(data, seed) {
  const state = {
    seed,
    rngState: seed >>> 0,
    time: { tick: startTick(data) },
    money: data.economy.startMoney,
    fuel: { priceMult: 1 },
    stats: { totalEarned: 0, tonnesDug: 0, tonnesSold: 0, fuelSpent: 0 },
    market: createMarketState(data),
    currentSiteId: data.game.startSite,
    sites: createSitesState(data),
    buildings: {},
    machines: [],
    nextMachineId: 1,
    counters: {},
    player: { selectedMachineId: null },
    tools: createToolsState(), // your shovel and wheelbarrow
    depot: { tickets: {} }, // weighbridge tickets: vehicles weighed in and not yet unloaded
    unlocks: {},
    flags: {},
    objectives: createObjectivesState(),
    mentor: { seen: {} }, // one-off tips already sent
  };
  for (const { type, tier } of data.game.startingMachines) {
    createMachine(state, data, type, tier, state.currentSiteId);
  }
  state.player.selectedMachineId = state.machines[0]?.id ?? null;
  // Seed the price chart with a starting point.
  recordPriceHistory({ state, data });
  return state;
}

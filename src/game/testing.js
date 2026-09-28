// Test helper: a new game that already owns the rusty starter machines
// (a real new game starts with none and buys them).
import { createGame } from './index.js';
import { createMachine } from '../machinery/index.js';

export function createTestGame(seed = 1) {
  const game = createGame({ seed });
  for (const type of ['excavator', 'truck']) createMachine(game.state, game.data, type, 'rusty', game.state.currentSiteId);
  game.state.player.selectedMachineId = game.state.machines[0].id;
  game.state.money = 30;
  return game;
}

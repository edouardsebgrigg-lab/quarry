// Test helper: a new game that already owns a rusty excavator and tipper truck as well as
// the pickup every game starts with (a real new game buys them).
import { createGame } from './index.js';
import { createMachine } from '../machinery/index.js';

export function createTestGame(seed = 1) {
  const game = createGame({ seed });
  for (const type of ['excavator', 'truck']) createMachine(game.state, game.data, type, 'rusty', game.state.currentSiteId);
  game.state.player.selectedMachineId = game.state.machines.find((m) => m.type === 'excavator').id;
  game.state.money = 30;
  return game;
}

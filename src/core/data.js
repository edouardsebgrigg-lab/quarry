// Loads every balance file from data/ into one object.
import game from '../../data/game.json';
import economy from '../../data/economy.json';
import materials from '../../data/materials.json';
import market from '../../data/market.json';
import machines from '../../data/machines.json';
import mods from '../../data/mods.json';
import sites from '../../data/sites.json';
import objectives from '../../data/objectives.json';
import ground from '../../data/ground.json';
import tools from '../../data/tools.json';

export function loadData() {
  // Deep copy so tests can tweak numbers without affecting each other.
  return structuredClone({ game, economy, materials, market, machines, mods, sites, objectives, ground, tools });
}

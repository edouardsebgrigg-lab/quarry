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
import depot from '../../data/depot.json';
import works from '../../data/works.json';
import contracts from '../../data/contracts.json';
import weather from '../../data/weather.json';
import buildings from '../../data/buildings.json';
import milestones from '../../data/milestones.json';
import happenings from '../../data/happenings.json';

export function loadData() {
  // Deep copy so tests can tweak numbers without affecting each other.
  return structuredClone({ game, economy, materials, market, machines, mods, sites, objectives, ground, tools, depot, works, contracts, weather, buildings, milestones, happenings });
}

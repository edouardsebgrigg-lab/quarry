// Reject unrelated or broken files before replacing a slot or a running company.
import { createGame } from './index.js';

export function validateSavedGame(data,state) {
  const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
  const bad=()=>{throw new Error('The file does not contain a usable Quarry company');};
  if(!object(state)||!Number.isFinite(state.money)||!Number.isFinite(state.seed))bad();
  for(const k of ['time','stats','market','sites','counters','player','flags','unlocks','objectives','depot','tools'])if(!object(state[k]))bad();
  if(!Number.isInteger(state.time.tick)||state.time.tick<0||!data.sites[state.currentSiteId]||!Array.isArray(state.machines))bad();
  if(!Number.isInteger(state.objectives.index)||state.objectives.index<0)bad();
  const ids=new Set();
  const load=values=>{
    if(!object(values))bad();
    for(const [id,t] of Object.entries(values))if(!data.materials[id]||!Number.isFinite(t)||t<0)bad();
  };
  for(const m of state.machines) {
    if(!object(m)||typeof m.id!=='string'||ids.has(m.id)||!data.machines.types[m.type]?.tiers[m.tier]
      ||!Number.isFinite(m.condition)||!Array.isArray(m.mods))bad();
    ids.add(m.id);load(m.load);
  }
  load(state.tools.shovel?.load);load(state.tools.barrow?.load);
  if(!object(state.market.products))bad();
  // Terrain decompression, fleet migration and the game's legacy defaults run on a copy.
  // A broken packed chunk must not displace a working company.
  createGame({data,state:structuredClone(state)});
}

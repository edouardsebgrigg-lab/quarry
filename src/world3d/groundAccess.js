// Read all visible plots, but alter only owned ground. Grid-indexed rendering still
// receives each original grid separately; world-facing coordinate queries route here.
import { groundAt, availableGrounds } from '../quarry/land.js';

export function createGroundAccess(ctx) {
  const read=(x,z)=>groundAt(ctx,x,z,{ownedOnly:false});
  const own=(x,z)=>groundAt(ctx,x,z);
  return {
    ...ctx.ground,
    at:read,
    inside:(x,z)=>!!read(x,z),
    workable:(x,z)=>!!own(x,z)?.workable(x,z),
    heightAt:(x,z)=>read(x,z)?.heightAt(x,z)??0,
    surfaceAt:(x,z)=>read(x,z)?.surfaceAt(x,z),
    materialResponseAt:(x,z,opts)=>read(x,z)?.materialResponseAt(x,z,opts),
    digResistanceAt:(x,z)=>own(x,z)?.digResistanceAt(x,z)??Infinity,
    inspectAt:(x,z)=>read(x,z)?.inspectAt(x,z),
    applyTraffic:p=>own(p.x,p.z)?.applyTraffic(p),
    setMoisture:value=>availableGrounds(ctx).forEach(g=>g.setMoisture(value)),
  };
}

import { PICKUP, TRACTOR } from './truckPhysics.js';

export function scaleProfile(profile, factor) {
  const shape = structuredClone(profile.shape);
  for (const key of ['halfLength','halfHeight','halfWidth','wheelRadius','driveRadius','suspensionRest']) if (shape[key] !== undefined) shape[key] *= factor;
  for (const key of ['wheelX','wheelZ','wheelRadii']) if (shape[key]) shape[key] = shape[key].map(v => v * factor);
  shape.wheelY = Array.isArray(shape.wheelY) ? shape.wheelY.map(v => v * factor) : shape.wheelY * factor;
  const tuning = { ...profile.tuning };
  for (const key of ['wheelbase','track','rideHeight','colliderY']) if (tuning[key] !== undefined) tuning[key] *= factor;
  for (const key of ['massCentre','cargoCentre']) if (tuning[key]) tuning[key] = Object.fromEntries(Object.entries(tuning[key]).map(([k,v])=>[k,v*factor]));
  return { ...profile, shape, tuning };
}
export function fleetProfile(type, stats) {
  if (type === 'tractor') return { ...scaleProfile(TRACTOR, stats.modelScale ?? 1), driveWheels: stats.driveWheels ?? 2 };
  if (type === 'pickup') return PICKUP;
  if (!['quad','buggy','fourByFour','serviceVan'].includes(type)) return null;
  const quad = type === 'quad', buggy = type === 'buggy';
  const p = scaleProfile(PICKUP, quad ? .4 : buggy ? .57 : type === 'serviceVan' ? 1.06 : 1);
  p.driveWheels = type === 'serviceVan' ? 2 : 4;
  p.tuning.rideHeight = quad ? .53 : buggy ? .67 : .86;
  if(quad) Object.assign(p.shape,{halfLength:1.05,halfWidth:.48,halfHeight:.18,wheelRadius:.23,wheelX:[.67,.67,-.67,-.67],wheelZ:[-.43,.43,-.43,.43],wheelY:-.12,suspensionRest:.18});
  if(buggy) Object.assign(p.shape,{halfLength:1.6,halfWidth:.72,wheelRadius:.32,wheelX:[1,1,-1,-1],wheelZ:[-.63,.63,-.63,.63],wheelY:-.1,suspensionRest:.25});
  if(quad||buggy){p.tuning.wheelbase=quad?1.34:2;p.tuning.track=quad?.86:1.26;}
  p.tuning.colliderY = quad ? .08 : .16;
  p.tuning.maxSteer = quad ? .8 : .68;
  p.tuning.cargoCentre = { x: -p.shape.halfLength*.5, y: .18 };
  return p;
}

// What the ground is like under a tyre: grip (a friction coefficient) and rolling resistance,
// from the mix of surfaces there and how wet the ground is. Balance numbers are in
// data/handling.json (surfaces); the field's dug materials answer for themselves (ground.js).
import handling from '../../data/handling.json';

const TABLE = handling.surfaces;
const KINDS = ['grass', 'dirt', 'gravel', 'rock'];
const mix = (a, b, t) => a + (b - a) * t;

// One surface, `wet` 0 (dry) .. 1 (soaked).
export function surfaceGrip(kind, wet = 0, table = TABLE) {
  const s = table[kind];
  const w = Math.max(0, Math.min(1, wet));
  return { grip: mix(s.grip, s.wetGrip ?? s.grip, w), roll: mix(s.roll, s.wetRoll ?? s.roll, w), name: kind };
}

// A blend of the countryside's surfaces ({ grass, dirt, gravel, rock } shares), named after the
// biggest share.
export function blendedGrip(shares, wet = 0, table = TABLE) {
  let grip = 0, roll = 0, total = 0, name = 'dirt', best = 0;
  for (const k of KINDS) {
    const share = shares[k] ?? 0;
    if (share <= 0) continue;
    const s = surfaceGrip(k, wet, table);
    grip += s.grip * share;
    roll += s.roll * share;
    total += share;
    if (share > best) {
      best = share;
      name = k;
    }
  }
  if (total <= 0) return surfaceGrip('dirt', wet, table);
  return { grip: grip / total, roll: roll / total, name };
}

// A tyre wading through `depth` metres of standing water on `surface` (from surfaceGrip or
// blendedGrip): extra drag by depth, a little less grip, named 'water' (`under` is the ground).
// Shallower than a few centimetres it's just wet ground and `surface` comes back unchanged.
export function wading(surface, depth, table = handling.wading) {
  if (!(depth >= table.minDepth)) return surface;
  return {
    grip: surface.grip * (1 - table.gripLoss),
    roll: surface.roll + Math.min(table.maxDrag, depth * table.dragPerMetre),
    name: 'water',
    under: surface.name,
    depth,
  };
}

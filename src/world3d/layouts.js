// Level design for each site in metres (x = east, z = south, y = up).
// Zone ids must match data/sites.json. Game balance numbers stay in data/.

export const LAYOUTS = {
  gravelPit: {
    // Area covered by the diggable terrain (heightfield), 1 sample per metre.
    terrain: { x0: -80, x1: 96, z0: -60, z1: 60 },
    zones: {
      A: { x0: -54, x1: -32, z0: -27, z1: -5 },
      B: { x0: -22, x1: 0, z0: -27, z1: -5 },
      C: { x0: -54, x1: -32, z0: 5, z1: 27 },
      D: { x0: -22, x1: 0, z0: 5, z1: 27 },
    },
    benchInset: 1.6, // how far each deeper step is set in from the one above
    facePile: { x: -27, z: 0 },
    road: [
      { x0: -2, x1: 42, z0: -4, z1: 4 }, // haul road from the pits to the yard
      { x0: 34, x1: 38, z0: -58, z1: -4 }, // track in from the gate
    ],
    // Gap in the north bank where the track meets the public road outside.
    entrance: { x0: 32, x1: 40 },
    publicRoad: { z: -72, width: 7 },
    yard: { x0: 42, x1: 78, z0: -20, z1: 20 },
    tipBay: { x0: 46, x1: 56, z0: 4, z1: 14 },
    stockpiles: { x: 66, z0: -12, spacing: 12 }, // one cone per product
    cabin: { x: 20, z: -22, yaw: 0 },
    // You arrive in your old pickup, parked by the office.
    pickup: { x: 30, z: -14.5, yaw: Math.PI - 0.2 },
    playerSpawn: { x: 27, z: -17, yaw: 1.3 },
    // Where machines park: the first of each type starts in the pit.
    parking: {
      excavator: [{ x: -11, z: -2.2, yaw: Math.PI / 2 }, { x: -43, z: -2.2, yaw: Math.PI / 2 }],
      truck: [{ x: -12.5, z: 2.6, yaw: Math.PI }, { x: 30, z: 12, yaw: Math.PI }],
      spare: { x: 8, z: -40, stepX: -8 },
    },
  },
};

export function zoneAt(layout, x, z) {
  for (const [id, r] of Object.entries(layout.zones)) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  }
  return null;
}

export function inRect(r, x, z, margin = 0) {
  return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
}

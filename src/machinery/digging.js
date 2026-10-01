// Shared physical-operation rules. A loaded bucket is not necessarily a full bucket.
export function bucketFill(ground, stats, load) {
  const volume = ground.looseVolume(load);
  const capacity = Math.max(0.001, stats.bucketVolume);
  return { volume, capacity, fraction: Math.min(1, volume / capacity), full: capacity - volume < 0.002, loaded: volume > 1e-6 };
}

// Teeth should pull into the face with a curled cutting edge, not harvest material by
// slewing sideways or raising an open bucket. Return an efficiency for the ground solver.
export function cuttingAttack(from, to, yaw, phi) {
  if (!from || !to || phi > -0.45) return 0;
  const dx = to.x - from.x, dz = to.z - from.z;
  const inward = -(dx * Math.cos(yaw) - dz * Math.sin(yaw));
  const down = Math.max(0, from.y - to.y);
  const travel = Math.hypot(dx, dz, to.y - from.y);
  if (travel < 1e-5) return 0;
  return Math.max(0, Math.min(1, (Math.max(0, inward) + down * 0.65) / travel));
}

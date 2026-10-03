// A pedal worked by a key. A held key is a pedal pressed all the way, so it goes down at
// `rate` (a full pedal per 1/rate seconds), as a foot does; letting go lifts it at once, and
// pressing the other pedal moves the foot straight across.
export function pedalStep(current, want, dt, rate = 4) {
  if (want === 0 || Math.sign(want) !== Math.sign(current)) current = 0;
  if (Math.abs(want) <= Math.abs(current)) return want;
  return Math.sign(want) * Math.min(Math.abs(want), Math.abs(current) + Math.max(0, dt) * rate);
}

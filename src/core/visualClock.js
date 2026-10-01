// Daylight has its own saved clock, advanced by active real frame time, independent of
// the economic ticker/speed. Starting old saves at morning avoids an unexpected dark load.
const wrap = (n, span) => ((n % span) + span) % span;
export const visualDaySeconds = data => data.game.visualDayLengthSeconds ?? 1200;
export function visualClock(state, data) {
  state.time.visualSeconds ??= data.game.startHour / 24 * visualDaySeconds(data);
  return state.time.visualSeconds;
}
export function advanceVisualClock(state, data, dt) {
  const seconds = visualClock(state, data);
  if (!Number.isFinite(dt) || dt <= 0) return;
  state.time.visualSeconds = wrap(seconds + dt, visualDaySeconds(data));
}
export function visualHour(state, data) {
  return wrap(visualClock(state, data), visualDaySeconds(data)) / visualDaySeconds(data) * 24;
}
// Smooth daylight through both horizons; all night has a small lighting floor in the world.
export function solarState(hour) {
  const angle = (wrap(hour, 24) - 6) / 24 * Math.PI * 2;
  const elevation = Math.sin(angle);
  const t = Math.max(0, Math.min(1, (elevation + .12) / .30));
  const daylight = t * t * (3 - 2 * t);
  return {
    direction: { x: -Math.cos(angle), y: .72 * elevation, z: .55 * elevation },
    daylight,
    warmth: daylight * Math.max(0, 1 - Math.max(0, elevation) / .5),
    night: 1 - daylight,
  };
}

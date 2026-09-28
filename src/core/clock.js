// Game time. Time is counted in whole ticks to avoid rounding drift.
// One game day = data.game.dayLengthSeconds of 1x play.

export function ticksPerHour(data) {
  return Math.round((data.game.dayLengthSeconds * data.game.ticksPerSecond) / 24);
}

export function ticksPerDay(data) {
  return ticksPerHour(data) * 24;
}

export function tickSeconds(data) {
  return 1 / data.game.ticksPerSecond;
}

export function startTick(data) {
  return data.game.startHour * ticksPerHour(data);
}

// Advances one tick and emits hourPassed / dayStarted when crossing boundaries.
export function advanceClock(ctx) {
  const { state, data, events } = ctx;
  state.time.tick += 1;
  const tick = state.time.tick;
  if (tick % ticksPerHour(data) === 0) {
    const date = getDate(state, data);
    if (tick % ticksPerDay(data) === 0) events.emit('dayStarted', { day: date.day });
    events.emit('hourPassed', { day: date.day, hour: date.hour });
  }
}

export function getDate(state, data) {
  const tph = ticksPerHour(data);
  const tick = state.time.tick;
  return {
    day: Math.floor(tick / (tph * 24)) + 1,
    hour: Math.floor(tick / tph) % 24,
    minute: Math.floor(((tick % tph) / tph) * 60),
  };
}

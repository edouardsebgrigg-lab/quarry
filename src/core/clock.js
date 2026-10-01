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

// Store the rate with the calendar, so balance changes never move a saved business
// back to day one or shift wages/deadlines. Saves before this field used 1,200 ticks/day.
export function restoreClock(state, data) {
  const rate = ticksPerDay(data);
  const oldRate = state.time.ticksPerDay ?? data.game.legacyTicksPerDay ?? rate;
  if (oldRate !== rate && oldRate > 0) {
    state.time.tick = Math.round(state.time.tick * rate / oldRate);
  }
  state.time.ticksPerDay = rate;
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

// The weather: each day is sunny, cloudy, showery or wet, and tomorrow's is known a day ahead
// (the forecast on the laptop). A day's weather comes on at a random hour in the morning so it
// doesn't flip at midnight. Rain soaks the ground (wet ground has less grip: data/handling.json
// surfaces) and makes the 3D world rainy.
// Days follow on from each other (a wet spell tends to last), from data/weather.json.
import { createRng, getDate } from '../core/index.js';

export function weatherState(ctx) {
  ctx.state.weather ??= {
    today: ctx.data.weather.first, tomorrow: ctx.data.weather.first, current: ctx.data.weather.first,
    changeHour: 9, rngState: ((ctx.state.seed ?? 1) * 40503 + 7) >>> 0,
  };
  return ctx.state.weather;
}

function roll(ctx, from) {
  const w = weatherState(ctx);
  const rng = createRng(() => w); // (its own random numbers: the weather doesn't change other luck)
  const table = ctx.data.weather.next[from];
  let r = rng.next();
  for (const [kind, p] of Object.entries(table)) {
    r -= p;
    if (r <= 0) return kind;
  }
  return from;
}

// What the weather is doing right now: { kind, name, grip, cloud, rain }.
export function currentWeather(ctx) {
  const w = weatherState(ctx);
  return { kind: w.current, ...ctx.data.weather.kinds[w.current] };
}

export function forecast(ctx) {
  const w = weatherState(ctx);
  const k = ctx.data.weather.kinds;
  return { today: { kind: w.today, ...k[w.today] }, tomorrow: { kind: w.tomorrow, ...k[w.tomorrow] } };
}

export function weatherOnEvent(ctx, type) {
  const w = weatherState(ctx);
  if (type === 'dayStarted') {
    w.today = w.tomorrow;
    w.tomorrow = roll(ctx, w.today);
    const [lo, hi] = ctx.data.weather.changeHours;
    const rng = createRng(() => w);
    w.changeHour = Math.floor(lo + rng.next() * (hi - lo));
    ctx.events.emit('forecast', forecast(ctx));
  } else if (type === 'hourPassed') {
    const { hour } = getDate(ctx.state, ctx.data);
    if (hour === w.changeHour && w.current !== w.today) {
      w.current = w.today;
      ctx.events.emit('weatherChanged', currentWeather(ctx));
    }
  }
}

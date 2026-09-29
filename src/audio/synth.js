// Sound synthesis: every sound in the game is built here from simple physics-inspired
// recipes (no recordings), as plain Float32Arrays, so it can be tested without a browser.
// Each function takes the sample rate `sr` first.
//
// Diesel engines: a train of combustion pulses (one per cylinder firing) shaped by the
// exhaust pipe's resonances, plus the sharp "clatter" of the injectors and a mechanical
// rumble. Loops are generated over two periods and the second kept, so filters are already
// settled and the loop joins without a click.

// ---------------------------------------------------------------- helpers

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RBJ cookbook biquad coefficients.
function biquad(type, f, q, sr, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;
  switch (type) {
    case 'lowpass':
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'bandpass': // constant 0 dB peak gain
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'peak':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    default:
      throw new Error(`unknown filter ${type}`);
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function filter(buf, type, f, q = 0.707, sr = 44100, gainDb = 0) {
  const c = biquad(type, f, q, sr, gainDb);
  const out = new Float32Array(buf.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i];
    const y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}

function mix(...parts) {
  const out = new Float32Array(parts[0][0].length);
  for (const [buf, g] of parts) for (let i = 0; i < out.length; i++) out[i] += buf[i] * g;
  return out;
}

export function peak(buf) {
  let p = 0;
  for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
  return p;
}

function normalize(buf, target = 0.9) {
  const p = peak(buf) || 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= target / p;
  return buf;
}

function white(n, r) {
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = r() * 2 - 1;
  return b;
}

function brown(n, r) {
  const b = new Float32Array(n);
  let v = 0;
  for (let i = 0; i < n; i++) {
    v = (v + (r() * 2 - 1) * 0.02) * 0.998;
    b[i] = v;
  }
  return b;
}

// Filtered noise that repeats exactly every n samples (for loops): white noise is tiled
// over two periods, filtered, and the settled second period kept.
function periodicNoise(n, r, type, f, q = 0.7, sr = 44100) {
  const w = white(n, r);
  const two = new Float32Array(2 * n);
  two.set(w, 0);
  two.set(w, n);
  return filter(two, type, f, q, sr).slice(n);
}

// Make a buffer loop smoothly: the tail is cross-faded into the head.
export function loopify(buf, fade) {
  const n = buf.length - fade;
  const out = buf.slice(0, n);
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    out[i] = out[i] * Math.sqrt(t) + buf[n + i] * Math.sqrt(1 - t);
  }
  return out;
}

function envelope(buf, sr, attack, decay, hold = 0) {
  const a = attack * sr;
  const h = hold * sr;
  for (let i = 0; i < buf.length; i++) {
    let g;
    if (i < a) g = i / a;
    else if (i < a + h) g = 1;
    else g = Math.exp(-(i - a - h) / (decay * sr));
    buf[i] *= g;
  }
  return buf;
}

// Resonant "modal" strike: a sum of decaying sines (metal, stone).
function modal(n, sr, modes, r, strike = 1) {
  const out = new Float32Array(n);
  for (const [f, decay, amp] of modes) {
    const ph = r() * Math.PI * 2;
    const k = (2 * Math.PI * f) / sr;
    for (let i = 0; i < n; i++) out[i] += Math.sin(k * i + ph) * Math.exp(-i / (decay * sr)) * amp * strike;
  }
  return out;
}

// ---------------------------------------------------------------- engines

// Engine characters: bore scales the resonances (bigger engines sound deeper).
export const ENGINES = {
  truckOld: { cylinders: 4, bore: 1.0, clatter: 1.2, rough: 0.09, seed: 11 },
  truckTurbo: { cylinders: 6, bore: 1.15, clatter: 0.7, rough: 0.04, seed: 23 },
  excavator: { cylinders: 4, bore: 0.9, clatter: 1.0, rough: 0.06, seed: 37 },
  car: { cylinders: 4, bore: 0.6, clatter: 0.15, rough: 0.02, seed: 51 },
};

// One seamless loop of a running diesel at `rpm`, under `load` (0 = coasting, 1 = flat out).
export function dieselLoop(sr, { rpm = 1000, load = 0.5, cylinders = 4, bore = 1, clatter = 1, rough = 0.06, seed = 1 }) {
  const cycles = 6; // four-stroke cycles (2 revolutions each) in the loop
  const period = (cycles * 2 * 60) / rpm;
  const n = Math.round(period * sr);
  const N = 2 * n;
  const r = rng(seed * 7919 + Math.round(rpm) + Math.round(load * 10));
  const events = cycles * cylinders;
  const cylGain = Array.from({ length: cylinders }, () => 1 - rough * 2 * r());
  const jitter = Array.from({ length: events }, () => (r() - 0.5) * rough);
  const amps = Array.from({ length: events }, () => 1 - rough * 1.5 * r());
  const burstLen = Math.round(0.003 * sr);
  const bursts = Array.from({ length: events }, () => white(burstLen, r));
  const pulses = new Float32Array(N);
  const clat = new Float32Array(N);
  const step = n / events;
  const rise = Math.max(1, Math.round(0.0007 * sr));
  const tau = (0.0035 + 0.003 * bore) * sr * (1 - 0.3 * load);
  for (let rep = 0; rep < 2; rep++) {
    for (let k = 0; k < events; k++) {
      const t0 = rep * n + Math.round((k + jitter[k]) * step);
      const a = amps[k] * cylGain[k % cylinders] * (0.55 + 0.45 * load);
      const len = Math.round(tau * 6);
      for (let i = 0; i < len; i++) {
        const idx = (((t0 + i) % N) + N) % N;
        pulses[idx] += a * (i < rise ? i / rise : Math.exp(-(i - rise) / tau));
      }
      const ca = clatter * (0.6 + 0.4 * (1 - load)) * (0.8 + 0.4 * amps[k]);
      const off = Math.round(0.0012 * sr);
      for (let i = 0; i < burstLen; i++) {
        const idx = (((t0 + off + i) % N) + N) % N;
        clat[idx] += bursts[k][i] * ca * Math.exp(-i / (burstLen * 0.3));
      }
    }
  }
  // Exhaust: the pulses ring the pipe and silencer.
  const b = bore;
  const dc = filter(pulses, 'highpass', 25, 0.7, sr);
  const body = mix(
    [filter(dc, 'lowpass', 900 / Math.sqrt(b) + load * 500, 0.8, sr), 0.55],
    [filter(dc, 'bandpass', 78 / b, 1.3, sr), 1.1 + load * 0.6],
    [filter(dc, 'bandpass', 190 / b, 2.4, sr), 0.6],
    [filter(dc, 'bandpass', 470 / b, 3.5, sr), 0.25 + load * 0.15],
  );
  // Injector/valve clatter: the diesel "tick".
  const tick = filter(filter(clat, 'bandpass', 2300 / Math.sqrt(b), 1.4, sr), 'highpass', 800, 0.7, sr);
  // Mechanical rumble, breathing with the firing.
  const env = filter(pulses, 'lowpass', 40, 0.7, sr);
  const rumbleLoop = periodicNoise(n, r, 'lowpass', 320, 0.7, sr);
  const rumble = new Float32Array(N);
  for (let i = 0; i < N; i++) rumble[i] = rumbleLoop[i % n] * (0.5 + env[i] * 2);
  const all = mix([body, 1], [tick, 0.35], [normalize(rumble, 0.3), 1]);
  return normalize(all.slice(n), 0.85 * (0.7 + 0.3 * load));
}

// Starter motor turning the engine over: a whirring motor that labours on each compression.
export function starter(sr, seconds = 1.2, seed = 3) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const comp = 0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * t); // compressions ~7 per second
    const f = 150 + 30 * Math.min(1, t * 3) - 25 * comp;
    ph += f / sr;
    const saw = 2 * (ph % 1) - 1;
    out[i] = saw * (0.6 + 0.4 * comp) + (r() * 2 - 1) * 0.25 * comp;
  }
  const shaped = mix(
    [filter(out, 'bandpass', 420, 1.2, sr), 1],
    [filter(out, 'bandpass', 1300, 3, sr), 0.4],
    [filter(out, 'lowpass', 160, 0.7, sr), 0.6],
  );
  return normalize(envelope(shaped, sr, 0.03, 0.25, seconds - 0.25), 0.7);
}

// ---------------------------------------------------------------- ground and machinery

// Tyres rolling on loose gravel (loop). Played faster when driving faster.
export function gravelRoll(sr, seconds = 2, seed = 5) {
  const n = Math.round(seconds * sr);
  const fade = Math.round(0.1 * sr);
  const r = rng(seed);
  const grains = new Float32Array(n + fade);
  const rate = 700; // stones popping per second
  for (let i = 0; i < n + fade; i++) {
    if (r() < rate / sr) {
      const a = (0.2 + r()) * (r() < 0.1 ? 2.5 : 1);
      const len = Math.round((0.0006 + r() * 0.002) * sr);
      for (let k = 0; k < len && i + k < n + fade; k++) grains[i + k] += (r() * 2 - 1) * a * Math.exp(-k / (len * 0.3));
    }
  }
  const crunch = filter(filter(grains, 'bandpass', 2200, 0.8, sr), 'highpass', 500, 0.7, sr);
  const rumble = filter(brown(n + fade, r), 'lowpass', 180, 0.7, sr);
  return normalize(loopify(mix([crunch, 1], [normalize(rumble, 0.5), 1]), fade), 0.8);
}

// Tyres on tarmac: a smooth road roar (loop).
export function roadRoll(sr, seconds = 2, seed = 6) {
  const n = Math.round(seconds * sr);
  const fade = Math.round(0.1 * sr);
  const r = rng(seed);
  const noise = white(n + fade, r);
  const roar = mix([filter(noise, 'bandpass', 420, 0.6, sr), 1], [filter(brown(n + fade, r), 'lowpass', 120, 0.7, sr), 6]);
  return normalize(loopify(roar, fade), 0.7);
}

// Steel tracks: shoes clanking round the sprockets at 1 m/s (loop; play faster to go faster).
export function trackClank(sr, seconds = 2.24, seed = 7) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const out = new Float32Array(n);
  const pitch = 0.28; // metres per shoe
  const perSecond = (1 / pitch) * 2; // both tracks
  const hits = Math.round(perSecond * seconds);
  const clank = (a) => modal(Math.round(0.09 * sr), sr, [[820, 0.025, 1], [1530, 0.018, 0.7], [2610, 0.012, 0.5], [340, 0.04, 0.6]], r, a);
  for (let h = 0; h < hits; h++) {
    const t0 = (Math.round((h / hits) * n + (r() - 0.5) * 0.01 * sr) + n) % n;
    const c = clank(0.5 + r() * 0.6);
    for (let i = 0; i < c.length; i++) out[(t0 + i) % n] += c[i];
    if (r() < 0.5) { // loose rattle
      const t1 = (t0 + Math.round(r() * 0.1 * sr)) % n;
      const rr = clank(0.2);
      for (let i = 0; i < rr.length; i++) out[(t1 + i) % n] += rr[i];
    }
  }
  const grind = periodicNoise(n, r, 'lowpass', 250, 0.7, sr);
  return normalize(mix([out, 1], [normalize(grind, 0.25), 1]), 0.8);
}

// Bucket teeth grinding through gravel (loop).
export function scrape(sr, seconds = 1.6, seed = 8) {
  const n = Math.round(seconds * sr);
  const fade = Math.round(0.12 * sr);
  const r = rng(seed);
  const g = new Float32Array(n + fade);
  for (let i = 0; i < n + fade; i++) {
    if (r() < 1400 / sr) {
      const a = 0.3 + r();
      const len = Math.round((0.001 + r() * 0.004) * sr);
      for (let k = 0; k < len && i + k < g.length; k++) g[i + k] += (r() * 2 - 1) * a * Math.exp(-k / (len * 0.35));
    }
  }
  const grind = filter(brown(n + fade, r), 'bandpass', 160, 0.9, sr);
  const scr = filter(white(n + fade, r), 'bandpass', 1100, 2.5, sr);
  return normalize(loopify(mix([filter(g, 'bandpass', 1400, 0.7, sr), 1], [normalize(grind, 0.6), 1], [normalize(scr, 0.15), 1]), fade), 0.8);
}

// Gravel and stones pouring (out of a bucket or off a tipping bed).
export function rockPour(sr, seconds = 1.6, { heavy = 1, seed = 9 } = {}) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const density = 1500 * Math.sin(Math.PI * Math.min(1, t * 1.3)) + 50;
    if (r() < density / sr) {
      const big = r() < 0.08 * heavy;
      const len = Math.round((big ? 0.03 : 0.0015 + r() * 0.004) * sr);
      const a = (big ? 2.2 : 0.4 + r()) * (1 - t * 0.5);
      for (let k = 0; k < len && i + k < n; k++) {
        const env = Math.exp(-k / (len * 0.3));
        out[i + k] += (big ? Math.sin(k * 0.035 * (0.8 + r() * 0.4)) + (r() - 0.5) * 0.6 : r() * 2 - 1) * a * env;
      }
    }
  }
  const slide = filter(brown(n, r), 'lowpass', 400, 0.7, sr);
  for (let i = 0; i < n; i++) slide[i] *= Math.sin(Math.PI * Math.min(1, (i / n) * 1.2));
  const body = mix([filter(out, 'highpass', 120, 0.7, sr), 1], [normalize(slide, 0.5 * heavy), 1]);
  return normalize(envelope(body, sr, 0.02, seconds * 0.25, seconds * 0.55), 0.9);
}

// A steel truck bed booming as rock lands in it.
export function metalBoom(sr, seconds = 1.4, seed = 10) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const ring = modal(n, sr, [[92, 0.5, 1], [181, 0.35, 0.8], [264, 0.3, 0.6], [417, 0.2, 0.45], [633, 0.12, 0.35], [1210, 0.05, 0.3]], r);
  const hit = envelope(filter(white(n, r), 'lowpass', 2500, 0.7, sr), sr, 0.001, 0.02);
  return normalize(mix([ring, 1], [hit, 1.2]), 0.9);
}

// Heavy thud (suspension bottoming, bed landing, stones hitting the ground).
export function thud(sr, seconds = 0.35, seed = 12) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const low = new Float32Array(n);
  for (let i = 0; i < n; i++) low[i] = Math.sin(2 * Math.PI * (55 + 40 * Math.exp(-i / (0.02 * sr))) * (i / sr)) * Math.exp(-i / (0.08 * sr));
  const knock = envelope(filter(white(n, r), 'lowpass', 1200, 0.7, sr), sr, 0.001, 0.015);
  return normalize(mix([low, 1], [knock, 0.6]), 0.9);
}

// Gear change: a short metallic clunk.
export function clunk(sr, seed = 13) {
  const n = Math.round(0.25 * sr);
  const r = rng(seed);
  const m = modal(n, sr, [[340, 0.05, 1], [790, 0.03, 0.6], [1480, 0.02, 0.35]], r);
  return normalize(mix([m, 1], [thud(sr, 0.25, seed), 0.7]), 0.8);
}

// Air brakes releasing ("pssht").
export function airHiss(sr, seconds = 0.9, seed = 14) {
  const n = Math.round(seconds * sr);
  const r = rng(seed);
  const hiss = mix([filter(white(n, r), 'highpass', 2500, 0.7, sr), 1], [filter(white(n, r), 'bandpass', 5200, 1.5, sr), 0.8]);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    hiss[i] *= (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / (seconds * 0.28))) * (1 + 0.15 * Math.sin(t * 120));
  }
  return normalize(hiss, 0.7);
}

// Reverse alarm (loop): 0.45 s beep, 0.45 s quiet.
export function beeper(sr) {
  const n = Math.round(0.9 * sr);
  const out = new Float32Array(n);
  const on = Math.round(0.45 * sr);
  const f = 1180;
  for (let i = 0; i < on; i++) {
    const t = i / sr;
    const env = Math.min(1, i / (0.008 * sr), (on - i) / (0.008 * sr));
    out[i] = (Math.sin(2 * Math.PI * f * t) + Math.sin(6 * Math.PI * f * t) / 3 + Math.sin(10 * Math.PI * f * t) / 5) * env;
  }
  return normalize(out, 0.6);
}

// Hydraulic oil rushing through valves (loop, filtered live by how hard the rams work).
export function hydraulicHiss(sr, seconds = 1.5, seed = 15) {
  const n = Math.round(seconds * sr);
  const fade = Math.round(0.1 * sr);
  const r = rng(seed);
  const s = mix([filter(white(n + fade, r), 'bandpass', 2600, 0.9, sr), 1], [filter(white(n + fade, r), 'bandpass', 900, 1.5, sr), 0.5]);
  return normalize(loopify(s, fade), 0.7);
}

// Wind over open country (loop).
export function wind(sr, seconds = 8, seed = 16) {
  const n = Math.round(seconds * sr);
  const fade = Math.round(0.8 * sr);
  const r = rng(seed);
  const b = filter(brown(n + fade, r), 'lowpass', 500, 0.7, sr);
  const gust = new Float32Array(n + fade);
  for (let i = 0; i < gust.length; i++) {
    const t = i / sr;
    gust[i] = b[i] * (0.6 + 0.25 * Math.sin(t * 0.9) + 0.15 * Math.sin(t * 2.3 + 1));
  }
  const whistle = filter(white(n + fade, r), 'bandpass', 900, 6, sr);
  return normalize(loopify(mix([gust, 1], [normalize(whistle, 0.03), 1]), fade), 0.7);
}

// One footstep on gravel or grass.
export function footstep(sr, { surface = 'gravel', seed = 17 } = {}) {
  const n = Math.round(0.25 * sr);
  const r = rng(seed);
  const g = new Float32Array(n);
  const hard = surface === 'gravel' || surface === 'rock' || surface === 'dirt';
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const density = (hard ? 4000 : 1500) * Math.exp(-t / 0.05);
    if (r() < density / sr) {
      const len = Math.round((0.0005 + r() * 0.002) * sr);
      const a = 0.4 + r();
      for (let k = 0; k < len && i + k < n; k++) g[i + k] += (r() * 2 - 1) * a * Math.exp(-k / (len * 0.3));
    }
  }
  const crunch = filter(g, hard ? 'bandpass' : 'lowpass', hard ? 2000 : 1400, 0.8, sr);
  const heel = thud(sr, 0.25, seed);
  return normalize(mix([crunch, 1], [heel, hard ? 0.35 : 0.5]), 0.8);
}

// A bird's call: a few quick whistled notes (skylark-ish twittering).
export function birdCall(sr, seed = 18) {
  const r = rng(seed);
  const notes = 3 + Math.floor(r() * 7);
  const parts = [];
  let total = 0;
  for (let k = 0; k < notes; k++) {
    const dur = 0.04 + r() * 0.1;
    const gap = 0.02 + r() * 0.08;
    const f0 = 2600 + r() * 2800;
    const f1 = f0 * (0.7 + r() * 0.6);
    parts.push({ start: total, dur, f0, f1, trem: 20 + r() * 60 });
    total += dur + gap;
  }
  const n = Math.round((total + 0.05) * sr);
  const out = new Float32Array(n);
  for (const p of parts) {
    let ph = 0;
    const s = Math.round(p.start * sr);
    const len = Math.round(p.dur * sr);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const f = p.f0 + (p.f1 - p.f0) * t;
      ph += (2 * Math.PI * f) / sr;
      const env = Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.sin((2 * Math.PI * p.trem * i) / sr));
      out[s + i] += Math.sin(ph) * env;
    }
  }
  return normalize(out, 0.5);
}

// Cash register style "ching" for a sale, and a small chime for a goal.
export function coin(sr) {
  const n = Math.round(0.6 * sr);
  const out = new Float32Array(n);
  for (const [f, d, a, t0] of [[1318, 0.18, 1, 0], [1760, 0.3, 0.8, 0.07], [3520, 0.08, 0.2, 0.07]]) {
    const s = Math.round(t0 * sr);
    for (let i = s; i < n; i++) out[i] += Math.sin((2 * Math.PI * f * (i - s)) / sr) * Math.exp(-(i - s) / (d * sr)) * a;
  }
  return normalize(out, 0.5);
}

export function chime(sr) {
  const n = Math.round(1.1 * sr);
  const out = new Float32Array(n);
  [[659, 0], [880, 0.1], [1319, 0.2]].forEach(([f, t0]) => {
    const s = Math.round(t0 * sr);
    for (let i = s; i < n; i++) {
      const k = i - s;
      out[i] += (Math.sin((2 * Math.PI * f * k) / sr) + 0.3 * Math.sin((4 * Math.PI * f * k) / sr)) * Math.exp(-k / (0.35 * sr));
    }
  });
  return normalize(out, 0.45);
}

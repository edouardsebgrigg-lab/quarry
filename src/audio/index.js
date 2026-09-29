// The game's sound system (Web Audio). Sounds are synthesised once (synth.js) when audio
// starts, then played through a small mixer: engines, effects, ambience and UI buses into a
// gentle compressor. Positional sounds use HRTF panning and distance fall-off, and get
// duller with distance, the way air absorbs high frequencies.
//
// Nothing here knows about the game or three.js: callers pass plain positions {x, y, z}.
// Until the browser allows audio (after the first click), every call is a harmless no-op.
import * as S from './synth.js';

const ENGINE_RPMS = [800, 1400, 2200];
const ENGINE_LOADS = [0.1, 1];

export function createAudio({ volume = 0.8 } = {}) {
  let ctx = null;
  let bank = null;
  let master = null;
  const buses = {};
  const listenerPos = { x: 0, y: 0, z: 0 };
  let muted = false;
  let vol = volume;
  let meter = null;
  const meterBuf = new Float32Array(2048);

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.25;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : vol;
    meter = ctx.createAnalyser();
    meter.fftSize = 2048;
    master.connect(comp).connect(ctx.destination);
    comp.connect(meter);
    for (const [name, g] of Object.entries({ engines: 0.9, effects: 0.8, ambient: 0.55, ui: 0.5 })) {
      buses[name] = ctx.createGain();
      buses[name].gain.value = g;
      buses[name].connect(master);
    }
    bank = buildBank(ctx);
  }

  function buildBank(c) {
    const sr = c.sampleRate;
    const toBuffer = (data) => {
      const b = c.createBuffer(1, data.length, sr);
      b.copyToChannel(data, 0);
      return b;
    };
    const b = { engines: {}, oneShots: {}, loops: {} };
    for (const [kind, eng] of Object.entries(S.ENGINES)) {
      b.engines[kind] = ENGINE_RPMS.map((rpm) => ENGINE_LOADS.map((load) => toBuffer(S.dieselLoop(sr, { ...eng, rpm, load }))));
    }
    Object.assign(b.loops, {
      gravel: toBuffer(S.gravelRoll(sr)),
      road: toBuffer(S.roadRoll(sr)),
      tracks: toBuffer(S.trackClank(sr)),
      scrape: toBuffer(S.scrape(sr)),
      hydraulic: toBuffer(S.hydraulicHiss(sr)),
      wind: toBuffer(S.wind(sr)),
      beeper: toBuffer(S.beeper(sr)),
    });
    Object.assign(b.oneShots, {
      starter: [toBuffer(S.starter(sr))],
      pour: [1, 2, 3].map((k) => toBuffer(S.rockPour(sr, 1.6, { seed: 30 + k }))),
      pourLong: [toBuffer(S.rockPour(sr, 3.2, { heavy: 1.6, seed: 40 }))],
      boom: [toBuffer(S.metalBoom(sr))],
      thud: [1, 2].map((k) => toBuffer(S.thud(sr, 0.35, 50 + k))),
      clunk: [toBuffer(S.clunk(sr))],
      hiss: [toBuffer(S.airHiss(sr))],
      shovel: [1, 2, 3].map((k) => toBuffer(S.shovelBite(sr, 90 + k))),
      soil: [1, 2, 3].map((k) => toBuffer(S.soilPour(sr, 0.6, 95 + k))),
      soilLong: [toBuffer(S.soilPour(sr, 1.6, 99))],
      stepGravel: [1, 2, 3, 4].map((k) => toBuffer(S.footstep(sr, { surface: 'gravel', seed: 60 + k }))),
      stepGrass: [1, 2, 3].map((k) => toBuffer(S.footstep(sr, { surface: 'grass', seed: 70 + k }))),
      bird: [1, 2, 3, 4, 5, 6].map((k) => toBuffer(S.birdCall(sr, 80 + k))),
      coin: [toBuffer(S.coin(sr))],
      chime: [toBuffer(S.chime(sr))],
    });
    return b;
  }

  const ready = () => !!(ctx && bank && ctx.state === 'running');
  const now = () => ctx.currentTime;
  const smooth = (param, value, tc = 0.05) => param.setTargetAtTime(value, now(), tc);

  // A panner that follows a world position; `null` position = in your head (not positional).
  function makePanner(dest, hrtf = true) {
    const p = ctx.createPanner();
    p.panningModel = hrtf ? 'HRTF' : 'equalpower'; // full 3D for engines; cheaper for the rest
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.rolloffFactor = 1.1;
    p.maxDistance = 600;
    p.connect(dest);
    return p;
  }
  function placePanner(p, pos) {
    const at = pos ?? listenerPos;
    if (p.positionX) {
      p.positionX.setTargetAtTime(at.x, now(), 0.02);
      p.positionY.setTargetAtTime(at.y, now(), 0.02);
      p.positionZ.setTargetAtTime(at.z + (pos ? 0 : 0.01), now(), 0.02);
    } else p.setPosition(at.x, at.y, at.z);
  }
  const distTo = (pos) => (pos ? Math.hypot(pos.x - listenerPos.x, pos.y - listenerPos.y, pos.z - listenerPos.z) : 0);
  // Air absorbs treble with distance.
  const airCutoff = (d, base = 16000) => Math.max(900, base / (1 + d / 60));

  // ---- continuous voices

  // A looping sound with gain, pitch (rate), tone (lowpass) and position controls.
  function loopVoice(name, bus = 'effects') {
    if (!ready()) return null;
    const src = ctx.createBufferSource();
    src.buffer = bank.loops[name];
    src.loop = true;
    src.loopStart = Math.random() * src.buffer.duration * 0.5;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 12000;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = makePanner(buses[bus], false);
    src.connect(tone).connect(g).connect(pan);
    src.start(now(), src.loopStart);
    return {
      set({ gain = 0, rate = 1, cutoff = 16000, pos = null }) {
        smooth(g.gain, gain, 0.06);
        smooth(src.playbackRate, Math.max(0.05, rate), 0.06);
        smooth(tone.frequency, Math.min(cutoff, airCutoff(distTo(pos))), 0.08);
        placePanner(pan, pos);
      },
      stop() {
        smooth(g.gain, 0, 0.05);
        setTimeout(() => { try { src.stop(); } catch { /* already stopped */ } pan.disconnect(); }, 400);
      },
    };
  }

  // A diesel engine: six loops (three speeds x coasting/pulling) cross-faded by rpm and
  // load and pitched to the exact rpm, through a tone filter (duller from inside the cab).
  function engineVoice(kind = 'truckOld', bus = 'engines') {
    if (!ready()) return null;
    const out = ctx.createGain();
    out.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.8;
    const body = ctx.createBiquadFilter(); // cab boom: extra low end from inside
    body.type = 'lowshelf';
    body.frequency.value = 180;
    const pan = makePanner(buses[bus]);
    tone.connect(body).connect(out).connect(pan);
    const voices = bank.engines[kind].map((row) => row.map((buffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g).connect(tone);
      src.start(now(), Math.random() * buffer.duration);
      return { src, g };
    }));
    let turbo = null;
    if (kind === 'truckTurbo') { // turbocharger whistle
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const tg = ctx.createGain();
      tg.gain.value = 0;
      osc.connect(tg).connect(tone);
      osc.start();
      turbo = { osc, tg, spool: 0 };
    }
    return {
      // rpm, load 0..1, level 0..1 (fades for start/stop), inside = you're in this cab.
      set({ rpm, load = 0.3, level = 1, inside = false, pos = null }) {
        const r = Math.max(200, rpm);
        // Cross-fade the rpm bands (equal power) and the coasting/pulling layers.
        let i = 0;
        while (i < ENGINE_RPMS.length - 2 && r > ENGINE_RPMS[i + 1]) i += 1;
        const t = Math.min(1, Math.max(0, (r - ENGINE_RPMS[i]) / (ENGINE_RPMS[i + 1] - ENGINE_RPMS[i])));
        const l = Math.min(1, Math.max(0, load));
        voices.forEach((row, ri) => {
          const wr = ri === i ? Math.cos((t * Math.PI) / 2) : ri === i + 1 ? Math.sin((t * Math.PI) / 2) : 0;
          row.forEach(({ src, g }, li) => {
            const wl = li === 0 ? Math.cos((l * Math.PI) / 2) : Math.sin((l * Math.PI) / 2);
            smooth(g.gain, wr * wl, 0.04);
            smooth(src.playbackRate, Math.min(3, Math.max(0.2, r / ENGINE_RPMS[ri])), 0.03);
          });
        });
        const d = distTo(pos);
        smooth(tone.frequency, inside ? 650 + l * 900 + r * 0.25 : airCutoff(d, 3500 + l * 4000 + r), 0.05);
        smooth(body.gain, inside ? 6 : 0, 0.1);
        smooth(out.gain, level * (inside ? 0.75 : 1) * (0.55 + 0.45 * l), 0.05);
        if (turbo) {
          turbo.spool += ((l * r) / 2500 - turbo.spool) * 0.08;
          smooth(turbo.osc.frequency, 1400 + turbo.spool * 3600, 0.08);
          smooth(turbo.tg.gain, turbo.spool * 0.035 * level, 0.08);
        }
        placePanner(pan, inside ? null : pos);
      },
      stop() {
        smooth(out.gain, 0, 0.05);
        setTimeout(() => {
          for (const row of voices) for (const { src } of row) { try { src.stop(); } catch { /* done */ } }
          turbo?.osc.stop();
          pan.disconnect();
        }, 400);
      },
    };
  }

  // Hydraulic pump whine: the pump's piston ripple (a buzz) through a resonant filter.
  function whineVoice(bus = 'effects') {
    if (!ready()) return null;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = makePanner(buses[bus], false);
    osc.connect(bp).connect(g).connect(pan);
    osc.start();
    return {
      set({ freq, gain, pos = null }) {
        smooth(osc.frequency, freq, 0.05);
        smooth(bp.frequency, freq * 2.2, 0.05);
        smooth(g.gain, gain, 0.08);
        placePanner(pan, pos);
      },
      stop() {
        smooth(g.gain, 0, 0.05);
        setTimeout(() => { osc.stop(); pan.disconnect(); }, 400);
      },
    };
  }

  // ---- one-shots
  function play(name, { pos = null, gain = 1, rate = 1, bus = 'effects', delay = 0 } = {}) {
    if (!ready()) return;
    const list = bank.oneShots[name];
    if (!list) return;
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = airCutoff(distTo(pos));
    const pan = makePanner(buses[bus]);
    placePanner(pan, pos);
    src.connect(tone).connect(g).connect(pan);
    src.start(now() + delay);
    src.onended = () => pan.disconnect();
  }

  return {
    // Call from a click or key press: browsers only allow sound after the player interacts.
    resume() {
      init();
      if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    },
    ready,
    setVolume(v) {
      vol = v;
      if (master) smooth(master.gain, muted ? 0 : vol, 0.05);
    },
    // Quiet everything (e.g. while a menu is open) without losing the mix.
    setMuted(m) {
      muted = m;
      if (master) smooth(master.gain, muted ? 0 : vol, 0.1);
    },
    setBusGain(name, g) {
      if (buses[name]) smooth(buses[name].gain, g, 0.2);
    },
    // Where you are and which way you face.
    setListener(pos, forward, up) {
      Object.assign(listenerPos, pos);
      if (!ctx) return;
      const l = ctx.listener;
      if (l.positionX) {
        l.positionX.setTargetAtTime(pos.x, now(), 0.02);
        l.positionY.setTargetAtTime(pos.y, now(), 0.02);
        l.positionZ.setTargetAtTime(pos.z, now(), 0.02);
        l.forwardX.setTargetAtTime(forward.x, now(), 0.02);
        l.forwardY.setTargetAtTime(forward.y, now(), 0.02);
        l.forwardZ.setTargetAtTime(forward.z, now(), 0.02);
        l.upX.setTargetAtTime(up.x, now(), 0.02);
        l.upY.setTargetAtTime(up.y, now(), 0.02);
        l.upZ.setTargetAtTime(up.z, now(), 0.02);
      } else {
        l.setPosition(pos.x, pos.y, pos.z);
        l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
      }
    },
    // Output loudness right now (RMS, 0..1): for tests and debugging.
    level() {
      if (!meter) return 0;
      meter.getFloatTimeDomainData(meterBuf);
      let sum = 0;
      for (const v of meterBuf) sum += v * v;
      return Math.sqrt(sum / meterBuf.length);
    },
    engineVoice,
    loopVoice,
    whineVoice,
    play,
    destroy() {
      ctx?.close();
      ctx = null;
    },
  };
}

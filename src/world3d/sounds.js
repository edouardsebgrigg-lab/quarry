// Turns what the machines and the player are doing into sound: engines by rpm and load,
// tyres on gravel or tarmac, air brakes, the reverse alarm, hydraulics, tracks, digging and
// pouring rock, footsteps, and the countryside (wind, birds, the odd car on the road).
// Reads machine `feel()` data each frame and drives voices in src/audio.
import * as THREE from 'three';

const ENGINE_KIND = {
  truck: { rusty: 'truckOld', used: 'truckTurbo' },
  pickup: { rusty: 'pickupOld' },
  excavator: { rusty: 'excavator', used: 'excavator' },
  miniDigger: { rusty: 'miniDiesel', used: 'miniDiesel' },
  dumper: { rusty: 'miniDiesel', used: 'miniDiesel' },
  tractor: { rusty: 'tractorOld', used: 'tractorOld' },
};
const v3 = (p) => ({ x: p.x, y: p.y, z: p.z });

// `carRoute` (optional) is a list of points ({ x, z }) along a public road that passing cars follow.
export function createWorldSounds({ audio, carRoute = null, groundSurface }) {
  const machines = new Map(); // machineId -> voices and memory
  const fwd = new THREE.Vector3();
  const up = new THREE.Vector3();
  let wind = null;
  let birdT = 3;
  let car = null;
  let carT = 20 + Math.random() * 30;
  let stepDist = 0;
  let lastFeet = null;
  let t = 0;

  function voicesFor(v, tier) {
    let m = machines.get(v.machineId);
    if (m) return m;
    const kind = ENGINE_KIND[v.type][tier] ?? 'truckOld';
    const road = !!v.road;
    m = {
      engine: audio.engineVoice(kind),
      level: 0, // engine loudness envelope 0..1 (start/stop)
      rpmScale: 1, // run-down when stopping
      extra: road
        ? {
          gravel: audio.loopVoice('gravel'),
          road: audio.loopVoice('road'),
          beeper: v.type === 'truck' ? audio.loopVoice('beeper') : null,
          ram: v.type === 'truck' || v.type === 'tractor' ? audio.whineVoice() : null,
        }
        : { tracks: audio.loopVoice('tracks'), hyd: audio.loopVoice('hydraulic'), scrape: audio.loopVoice('scrape'), pump: audio.whineVoice() },
      shifted: 0,
      braking: false,
      bumpCool: 0,
      tipPoured: false,
      bedWasUp: false,
      phase: '',
      job: null,
      shovelT: 0,
    };
    machines.set(v.machineId, m);
    return m;
  }

  function engineLife(m, v, dt, events) {
    const pos = v3(v.exhaustWorld());
    for (const e of events) {
      if (e === 'cranking') audio.play('starter', { pos, gain: 0.8 });
      if (e === 'stall') audio.play('clunk', { pos, gain: 0.6 });
    }
    const f = v.feel();
    const on = f.engine === 'running' || f.engine === 'idleOut';
    const target = on ? 1 : 0;
    // Catching: a quick swell; stopping: a slower run-down, with the revs falling away.
    m.level += (target - m.level) * Math.min(1, dt * (target > m.level ? 8 : 2.2));
    m.rpmScale += ((on ? 1 : 0.35) - m.rpmScale) * Math.min(1, dt * (on ? 6 : 1.8));
    return pos;
  }

  function truck(v, dt, inside, job) {
    const m = voicesFor(v, v.tier);
    const f = v.feel();
    const pos = engineLife(m, v, dt, v.takeEngineEvents());
    const rpm = (f.engine === 'running' || f.engine === 'idleOut' ? f.rpm : 700) * m.rpmScale;
    m.engine?.set({ rpm: f.misfire ? rpm * 0.93 : rpm, load: f.shifting ? 0.05 : f.load, level: m.level * (f.misfire ? 0.6 : 1), inside, pos });
    // Gear changes: a clunk from the gearbox (and a turbo sigh).
    if (f.shifted !== m.shifted) {
      if (f.shifted > m.shifted) {
        audio.play('clunk', { pos: inside ? null : pos, gain: inside ? 0.25 : 0.12, rate: 0.9 + Math.random() * 0.2 });
        if (v.tier !== 'rusty') audio.play('hiss', { pos, gain: 0.08, rate: 1.8 });
      }
      m.shifted = f.shifted;
    }
    // Tyres: crunching gravel or tarmac roar, faster and louder with speed.
    const speed = Math.abs(f.speed);
    const body = v3(v.position());
    const paved = f.surface === 'asphalt';
    const roll = Math.min(1, speed / 12);
    const muffle = inside ? 0.55 : 1;
    m.extra.gravel?.set({ gain: (paved ? 0 : roll * 0.55 + f.slip * 0.3) * muffle, rate: 0.55 + speed / 14, pos: body, cutoff: inside ? 2500 : 16000 });
    m.extra.road?.set({ gain: (paved ? roll * 0.45 : roll * 0.08) * muffle, rate: 0.6 + speed / 20, pos: body, cutoff: inside ? 1500 : 16000 });
    // Air brakes let go with a "pssht" when you stop.
    if (m.braking && !f.braking && speed < 0.8) audio.play('hiss', { pos: body, gain: inside ? 0.35 : 0.5 });
    m.braking = f.braking;
    // Reverse alarm.
    m.extra.beeper?.set({ gain: f.reversing && m.level > 0.5 ? 0.35 : 0, pos: v3(v.model.root.localToWorld(new THREE.Vector3(-3.2, 0.3, 0))) });
    // Bumps: the suspension thumps (and the load rattles).
    m.bumpCool -= dt;
    if (f.bump > 1.6 && m.bumpCool <= 0) {
      m.bumpCool = 0.3;
      const k = Math.min(1, (f.bump - 1.6) / 3);
      audio.play('thud', { pos: inside ? null : body, gain: 0.25 + k * 0.5, rate: 0.8 + Math.random() * 0.3 });
      if (v.phys && job?.type !== 'tip') audio.play('clunk', { pos: body, gain: 0.1 * k, rate: 1.4 });
    }
    // Tipping: the ram whines up, the load slides out, the bed comes down with a bang.
    const bedUp = f.bedAngle > 0.05;
    m.extra.ram?.set({ freq: 95 + f.bedAngle * 30, gain: f.bedSpeed > 0.01 ? 0.12 : (bedUp && f.bedSpeed < -0.01 ? 0.05 : 0), pos: body });
    if (job?.type === 'tip' && f.bedAngle > 0.35 && !m.tipPoured) {
      m.tipPoured = true;
      audio.play('pourLong', { pos: v3(v.unload().point), gain: 1 });
    }
    if (m.bedWasUp && !bedUp) {
      audio.play('boom', { pos: body, gain: 0.6, rate: 0.9 });
      m.tipPoured = false;
    }
    m.bedWasUp = bedUp;
    // A pickup's load is shovelled off by hand: a bite and a thrown shovelful now and then.
    if (v.type === 'pickup' && job?.type === 'tip' && f.tailgate > 1.2) {
      m.shovelT -= dt;
      if (m.shovelT <= 0) {
        m.shovelT = 0.9 + Math.random() * 0.4;
        const at = v3(v.tailgateWorld());
        audio.play('shovel', { pos: at, gain: 0.7, rate: 0.95 + Math.random() * 0.1 });
        audio.play('soil', { pos: at, gain: 0.55, rate: 1.05 + Math.random() * 0.15, delay: 0.45 });
      }
    }
    // The tailgate dropping and slamming shut.
    if (v.type === 'pickup' && (m.gateWasOpen ?? false) !== f.tailgate > 0.7) {
      audio.play('clunk', { pos: v3(v.tailgateWorld()), gain: 0.5, rate: f.tailgate > 0.7 ? 0.8 : 1.1 });
      m.gateWasOpen = f.tailgate > 0.7;
    }
    m.job = job?.type ?? null;
  }

  function excavator(v, dt, inside, trucks) {
    const m = voicesFor(v, v.tier);
    const f = v.feel();
    const pos = engineLife(m, v, dt, v.takeEngineEvents());
    // Working revs, bogging a little under load; drops to auto-idle after a few seconds.
    const on = f.running;
    const rpm = (on ? (f.autoIdle ? 950 : 1700 - f.work * 170 - (f.digging ? 90 : 0)) : 800) * m.rpmScale;
    m.engine?.set({ rpm, load: on ? 0.2 + f.work * 0.8 : 0, level: m.level, inside, pos });
    const housePos = v3(v.position().add(new THREE.Vector3(0, 1.5, 0)));
    // Hydraulics: pump whine and oil rushing through the valves.
    m.extra.pump?.set({ freq: (rpm / 60) * 9, gain: on ? 0.015 + f.work * 0.07 : 0, pos: housePos });
    m.extra.hyd?.set({ gain: on ? f.work * 0.28 : 0, rate: 0.8 + f.work * 0.4, pos: housePos, cutoff: inside ? 4000 : 16000 });
    // Tracks clanking round.
    m.extra.tracks?.set({ gain: Math.min(1, f.travel / 1.2) * 0.8, rate: 0.35 + f.travel * 0.9, pos: v3(v.position()) });
    // Teeth grinding through gravel.
    const teeth = v3(v.teethWorld ? v.teethWorld() : v.position());
    m.extra.scrape?.set({ gain: f.digging ? 0.7 : 0, rate: 0.9 + Math.random() * 0.05, pos: teeth });
    // The dumper's skip: the ram whines, the load slides out of the front, the skip drops back.
    if (v.type === 'dumper') {
      const up = f.bedAngle > 0.05;
      m.extra.pump?.set({ freq: 110 + f.bedAngle * 30, gain: f.bedSpeed > 0.01 ? 0.1 : (up && f.bedSpeed < -0.01 ? 0.04 : 0), pos: v3(v.position()) });
      if (up && f.bedAngle > 0.4 && !m.tipPoured) {
        m.tipPoured = true;
        audio.play('pourLong', { pos: v3(v.unload().point), gain: 0.8 });
      }
      if (m.bedWasUp && !up) {
        audio.play('boom', { pos: v3(v.position()), gain: 0.4, rate: 1.1 });
        m.tipPoured = false;
      }
      m.bedWasUp = up;
    }
    if (f.phase !== m.phase) {
      if (f.phase === 'bite') audio.play('thud', { pos: teeth, gain: 0.6, rate: 0.7 });
      if (f.phase === 'dump') {
        audio.play('pour', { pos: teeth, gain: 1 });
        const intoTruck = trucks.some((tr) => tr.isOverBed(new THREE.Vector3(teeth.x, teeth.y, teeth.z), 1.5));
        if (intoTruck) audio.play('boom', { pos: teeth, gain: 0.8, delay: 0.12 });
      }
      m.phase = f.phase;
    }
  }

  function ambience(dt, listener, inCab) {
    if (!wind) wind = audio.loopVoice('wind', 'ambient');
    const gust = 0.75 + 0.25 * Math.sin(t * 0.13) * Math.sin(t * 0.37 + 1);
    wind?.set({ gain: (inCab ? 0.1 : 0.32) * gust, rate: 0.9 + 0.1 * gust, cutoff: inCab ? 700 : 16000 });
    // Birds singing somewhere around you.
    birdT -= dt;
    if (birdT <= 0) {
      birdT = 2 + Math.random() * 7;
      const a = Math.random() * Math.PI * 2;
      const d = 25 + Math.random() * 60;
      audio.play('bird', {
        pos: { x: listener.x + Math.cos(a) * d, y: listener.y + 4 + Math.random() * 8, z: listener.z + Math.sin(a) * d },
        gain: inCab ? 0.12 : 0.35, rate: 0.9 + Math.random() * 0.25, bus: 'ambient',
      });
    }
    // Now and then a car goes along the lane: it follows the road (keeping to its side) and is
    // only heard while it's within a few hundred metres of you.
    if (!carRoute || carRoute.length < 2) return;
    carT -= dt;
    if (!car && carT <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      // Start about 450 m along the road from the nearest point to you.
      let near = 0;
      carRoute.forEach((p, i) => {
        if (Math.hypot(p.x - listener.x, p.z - listener.z) < Math.hypot(carRoute[near].x - listener.x, carRoute[near].z - listener.z)) near = i;
      });
      const i0 = Math.max(0, Math.min(carRoute.length - 1, near - dir * 225));
      car = {
        s: i0, dir, speed: 16 + Math.random() * 10, engine: audio.engineVoice('car', 'ambient'), tyres: audio.loopVoice('road', 'ambient'),
      };
    }
    if (car) {
      car.s += (car.dir * car.speed * dt) / 2; // route points are 2 m apart
      const i = Math.max(0, Math.min(carRoute.length - 2, Math.floor(car.s)));
      const t = Math.min(1, Math.max(0, car.s - i));
      const a = carRoute[i];
      const b = carRoute[i + 1];
      const side = car.dir * 1.8;
      const pos = { x: a.x + (b.x - a.x) * t - a.dz * side, y: (a.y ?? 0) + 0.6, z: a.z + (b.z - a.z) * t + a.dx * side };
      // Doppler: higher pitch coming toward you, lower going away.
      const vel = new THREE.Vector3(a.dx * car.dir * car.speed, 0, a.dz * car.dir * car.speed);
      const toL = new THREE.Vector3(listener.x - pos.x, 0, listener.z - pos.z);
      const radial = vel.dot(toL) / Math.max(1, toL.length());
      const doppler = 343 / (343 - radial);
      car.engine?.set({ rpm: 2300 * doppler, load: 0.4, level: 0.7, pos });
      car.tyres?.set({ gain: 0.5, rate: 1.1 * doppler, pos });
      const far = Math.hypot(pos.x - listener.x, pos.z - listener.z) > 520;
      // Gone once it's driven past you and out of earshot (or off the end of the road).
      if (car.s <= 0 || car.s >= carRoute.length - 1 || (far && car.passed)) {
        car.engine?.stop();
        car.tyres?.stop();
        car = null;
        carT = 35 + Math.random() * 80;
      } else if (!far) car.passed = true;
    }
  }

  function footsteps(dt, player) {
    if (!player) {
      lastFeet = null;
      return;
    }
    const feet = player.feet();
    if (lastFeet) {
      const d = Math.hypot(feet.x - lastFeet.x, feet.z - lastFeet.z);
      if (d < 1) stepDist += d; // ignore teleports
      const stride = player.input?.sprint ? 1.05 : 0.78;
      if (stepDist > stride) {
        stepDist = 0;
        const s = groundSurface(feet.x, feet.z);
        const soft = s.name === 'grass';
        audio.play(soft ? 'stepGrass' : 'stepGravel', {
          gain: (player.input?.sprint ? 0.42 : 0.3) * (soft ? 0.8 : 1), rate: 0.9 + Math.random() * 0.2,
        });
      }
    }
    lastFeet = { x: feet.x, z: feet.z };
  }

  return {
    update(dt, { camera, vehicles, current, player, jobOf, tierOf }) {
      if (!audio.ready()) return;
      t += dt;
      camera.getWorldDirection(fwd);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const L = v3(camera.position);
      audio.setListener(L, fwd, up);
      const list = [...vehicles.values()];
      const trucks = list.filter((x) => x.carrier);
      for (const v of list) {
        v.tier = tierOf(v.machineId);
        const inside = v === current;
        if (v.road) truck(v, dt, inside, jobOf(v.machineId));
        else excavator(v, dt, inside, trucks);
      }
      // Machines that were sold or removed.
      for (const [id, m] of machines) {
        if (!vehicles.has(id)) {
          m.engine?.stop();
          for (const x of Object.values(m.extra)) x?.stop();
          machines.delete(id);
        }
      }
      ambience(dt, L, !!current);
      footsteps(dt, current ? null : player);
    },
    // UI sounds.
    play: (name, opts) => audio.play(name, { bus: 'ui', ...opts }),
    destroy() {
      for (const m of machines.values()) {
        m.engine?.stop();
        for (const x of Object.values(m.extra)) x?.stop();
      }
      machines.clear();
      wind?.stop();
      car?.engine?.stop();
      car?.tyres?.stop();
    },
  };
}

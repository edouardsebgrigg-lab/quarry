// The 3D world. Reads the game state, draws it, and turns walking/driving/digging into
// calls to the same game actions the rest of the game uses.
import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { createRenderer, createEnvironment } from './environment.js';
import { createTerrain } from './terrain.js';
import { createPiles } from './piles.js';
import { createParticles } from './particles.js';
import { createPlayer } from './player.js';
import { createTruck } from './truck.js';
import { createExcavator } from './excavator.js';
import { createMouse } from './mouse.js';
import { preloadModels } from './glbModels.js';
import { preloadGround } from './groundMaterial.js';
import { preloadVegetation, createVegetation, createTrees } from './vegetation.js';
import { preloadEntrance, addEntrance } from './entrance.js';
import { createWorldSounds } from './sounds.js';
import { createGroundView } from './groundChunks.js';
import { LAYOUTS, zoneAt, inRect } from './layouts.js';
import { keyLabel } from '../input/index.js';
import { getSiteData, getZoneInfo, pileTotal } from '../quarry/index.js';
import {
  getStats, machinesAt, machineName, getMachine, JOBS, jobProgress,
} from '../machinery/index.js';

const MOUSE_SCALE = 0.0022;
const ENTER_DISTANCE = 2.8;

// Driver's head in the cab: springs against acceleration (pushed back when pulling away,
// forward when braking, sideways in corners) plus vibration from the engine and the ground.
function createHeadSway() {
  const off = new THREE.Vector3();
  const vel = new THREE.Vector3();
  const lastPos = new THREE.Vector3();
  const lastVel = new THREE.Vector3();
  const accel = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  const out = { offset: new THREE.Vector3(), pitch: 0, roll: 0 };
  let primed = false;
  let t = 0;
  return {
    reset() {
      primed = false;
    },
    update(dt, v, cabQ) {
      t += dt;
      const p = v.seatWorld();
      if (!primed || dt <= 0) {
        lastPos.copy(p);
        lastVel.set(0, 0, 0);
        off.set(0, 0, 0);
        vel.set(0, 0, 0);
        primed = true;
      }
      const velNow = p.clone().sub(lastPos).divideScalar(Math.max(dt, 1e-3));
      accel.copy(velNow).sub(lastVel).divideScalar(Math.max(dt, 1e-3));
      lastPos.copy(p);
      lastVel.lerp(velNow, 0.5);
      // Into the cab's own frame (x forward, y up, z right), gravity-free, clamped.
      inv.copy(cabQ).invert();
      const a = accel.applyQuaternion(inv).clampLength(0, 12);
      const target = a.multiplyScalar(-0.009);
      const k = 60;
      const c = 2 * Math.sqrt(k) * 0.55;
      vel.addScaledVector(target.sub(off).multiplyScalar(k), dt).addScaledVector(vel, -c * dt);
      off.addScaledVector(vel, dt).clampLength(0, 0.14);
      const f = v.feel?.() ?? {};
      const running = f.engine === 'running' || f.engine === 'idleOut' || f.running;
      const rpm = f.rpm ?? (running ? 1400 + (f.work ?? 0) * 500 : 0);
      const rough = { gravel: 1, dirt: 0.8, grass: 0.9, rock: 1.2, asphalt: 0.15 }[f.surface] ?? 0.6;
      const engineShake = running ? 0.0012 + (f.load ?? f.work ?? 0) * 0.0018 : 0;
      const roadShake = Math.min(1, Math.abs(v.speed()) / 10) * rough * 0.005 + Math.min(0.02, (f.bump ?? 0) * 0.004);
      const digShake = f.digging ? 0.006 : 0;
      const w = (rpm / 60) * 2 * Math.PI * 0.5;
      const n = (a1, a2) => Math.sin(t * a1 + a2) * 0.6 + Math.sin(t * a1 * 1.73 + a2 * 2.1) * 0.4;
      out.offset.set(
        n(w * 0.9, 0.3) * engineShake + n(23, 1.1) * roadShake,
        n(w, 0) * engineShake * 1.4 + n(17, 0.5) * (roadShake + digShake) * 1.5,
        n(w * 1.1, 2.1) * engineShake + n(29, 2.7) * roadShake,
      ).add(off).applyQuaternion(cabQ);
      out.pitch = -off.x * 0.35 + n(19, 3.3) * (roadShake + digShake) * 0.25;
      out.roll = -off.z * 0.4 + n(13, 0.9) * roadShake * 0.25;
      return out;
    },
  };
}

export async function createWorld3D({ container, game, settings, audio = null, notify, onPointerLockLost, onUseOffice }) {
  const { data } = game;
  const siteId = game.state.currentSiteId;
  const layout = LAYOUTS[siteId];
  const siteData = getSiteData(data, siteId);

  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  container.append(canvas);
  const { renderer, q } = createRenderer(canvas, settings.graphics);
  const [physics] = await Promise.all([createPhysics(), preloadModels(), preloadGround(renderer), preloadVegetation(renderer), preloadEntrance(renderer)]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 3000);
  camera.rotation.order = 'YXZ';
  const env = createEnvironment(scene, renderer, q, layout.terrain);

  const zoneDepths = () => Object.fromEntries(siteData.zones.map((z) => [z.id, getZoneInfo(game.ctx, siteId, z.id).depth]));
  const terrain = createTerrain({
    scene, physics, layout, siteData, materials: data.materials, getDepths: zoneDepths, ground: game.ctx.ground,
  });
  // The diggable plot: its own chunked mesh and colliders, following the ground as it changes.
  const groundView = game.ctx.ground ? createGroundView({ scene, physics, ground: game.ctx.ground }) : null;
  // The face pile sits where rock was first dumped (saved with the game).
  const facePilePos = { ...(game.state.positions?.facePile ?? layout.facePile) };
  const piles = createPiles({ scene, layout, game, facePilePos });
  const particles = createParticles(scene);
  addEntrance({ scene, physics, layout });
  const cab = layout.cabin;
  const gate = layout.entrance;
  const noGrowth = [
    ...(terrain.plot ? [[terrain.plot, 0.5]] : []), // plants would float once you dig
    [{ x0: cab.x - 18, x1: cab.x - 5, z0: cab.z - 7, z1: cab.z + 2 }, 0], // container and junk
    [{ x0: gate.x0, x1: gate.x1, z0: layout.terrain.z0 - 12, z1: layout.terrain.z0 }, 0], // driveway
    [{ x0: -1e4, x1: 1e4, z0: layout.publicRoad.z - 4.5, z1: layout.publicRoad.z + 4.5 }, 0], // road
    [{ x0: layout.pickup.x, x1: layout.pickup.x, z0: layout.pickup.z, z1: layout.pickup.z }, 3],
    ...Object.values(layout.zones).map((r) => [r, 0.8]),
    [{ x0: cab.x - 7, x1: cab.x + 3, z0: cab.z - 3, z1: cab.z + 3.5 }, 0],
    ...Object.values(layout.parking).flat().filter((p) => p.z !== undefined).map((p) => [{ x0: p.x, x1: p.x, z0: p.z, z1: p.z }, 4]),
  ];
  const vegetation = createVegetation({
    scene,
    quality: settings.graphics,
    area: { x0: layout.terrain.x0 - 40, x1: layout.terrain.x1 + 40, z0: layout.terrain.z0 - 40, z1: layout.terrain.z1 + 40 },
    surfaceAt: (x, z) => terrain.surfaceAt(x, z),
    blocked: (x, z) => noGrowth.some(([r, m]) => inRect(r, x, z, m)),
  });
  const T = layout.terrain;
  const trees = createTrees({
    scene,
    quality: settings.graphics,
    keepClear: (x, z) => inRect(T, x, z, 12) || Math.abs(z - layout.publicRoad.z) < 9,
    groundHeight: (x, z) => env.groundHeight(x, z),
  });

  // Target marker on the ground where the excavator bucket will dig/dump.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2b632, transparent: true, opacity: 0.8, depthTest: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  const saved = game.state.positions ?? {};
  const spawn = saved.player ?? layout.playerSpawn;
  const player = createPlayer({ physics, spawn: { ...spawn, y: terrain.heightAt(spawn.x, spawn.z) } });
  player.look.yaw = spawn.yaw ?? 0;

  // ---- machines ----
  const vehicles = new Map();
  const parkingUsed = { excavator: 0, truck: 0, spare: 0 };

  function parkingSpot(type) {
    const list = layout.parking[type];
    if (parkingUsed[type] < list.length) return list[parkingUsed[type]++];
    const s = layout.parking.spare;
    return { x: s.x + s.stepX * parkingUsed.spare++, z: s.z, yaw: Math.PI / 2 };
  }

  // What the ground is like under a wheel or track: grip (friction) and rolling resistance.
  const SURFACES = {
    grass: { grip: 0.62, roll: 0.05 },
    dirt: { grip: 0.8, roll: 0.035 },
    gravel: { grip: 0.72, roll: 0.03 },
    rock: { grip: 0.9, roll: 0.02 },
  };
  const ASPHALT = { grip: 1.0, roll: 0.012, name: 'asphalt' };
  function groundSurface(x, z) {
    const road = layout.publicRoad;
    if (road && Math.abs(z - road.z) < road.width / 2 && !inRect(layout.terrain, x, z)) return ASPHALT;
    const s = terrain.surfaceAt(x, z);
    const w = { grass: s.grass, dirt: s.dirt, gravel: s.gravel, rock: s.rock };
    let grip = 0;
    let roll = 0;
    let name = 'dirt';
    let best = 0;
    for (const [k, share] of Object.entries(w)) {
      grip += SURFACES[k].grip * share;
      roll += SURFACES[k].roll * share;
      if (share > best) {
        best = share;
        name = k;
      }
    }
    return { grip, roll, name };
  }

  const sounds = audio ? createWorldSounds({ audio, layout, groundSurface }) : null;

  function addVehicle(machine) {
    const spot = saved.machines?.[machine.id] ?? parkingSpot(machine.type);
    const stats = () => getStats(data, getMachine(game.ctx, machine.id) ?? machine);
    const live = () => getMachine(game.ctx, machine.id);
    const args = { physics, scene, terrain, machine, spawn: spot, stats, live, surfaceAt: groundSurface };
    const v = machine.type === 'truck' ? createTruck(args) : createExcavator(args);
    vehicles.set(machine.id, v);
  }

  for (const m of machinesAt(game.ctx, siteId)) addVehicle(m);

  // ---- modes: on foot, or in a machine ----
  let mode = { kind: 'foot' };
  let camMode = 'cab';
  const look = { yaw: 0, pitch: -0.15 }; // camera offsets while in a machine
  let chasePos = null;

  const mouse = createMouse(canvas, {
    onLockChange: (locked) => { if (!locked) onPointerLockLost?.(); },
  });

  const current = () => (mode.kind === 'foot' ? null : mode.v);
  const currentMachine = () => (current() ? getMachine(game.ctx, current().machineId) : null);

  function nearestVehicle(maxDist) {
    const feet = player.feet();
    let best = null;
    let bestD = Infinity;
    for (const v of vehicles.values()) {
      const d = v.position().setY(feet.y).distanceTo(feet) - v.radius;
      if (d < maxDist && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  // The office laptop (opens the shop) is by the office door.
  const officeDoor = { x: layout.cabin.x + 0.5, z: layout.cabin.z + 2.6 };
  function nearOffice() {
    const f = player.feet();
    return Math.hypot(f.x - officeDoor.x, f.z - officeDoor.z) < 3;
  }

  function enter(v) {
    mode = { kind: v.type, v };
    player.setEnabled(false);
    game.actions.selectMachine(v.machineId);
    look.yaw = 0;
    look.pitch = v.type === 'excavator' ? -0.3 : -0.08;
    chasePos = null;
    if (v.type === 'excavator') v.state.targetHouseYaw = v.state.houseYaw;
  }

  function exit() {
    const v = current();
    if (!v) return;
    if (Math.abs(v.speed()) > 3) {
      notify('Slow down before getting out');
      return;
    }
    if (v.type === 'truck') {
      v.control.throttle = 0;
      v.control.steer = 0;
      v.control.handbrake = true;
    }
    // Step out on the driver's side (left, which is -Z in the machine's frame).
    const yaw = v.type === 'excavator' ? v.houseWorldYaw() : v.yaw();
    const p = v.position();
    const out = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-(v.radius * 0.7 + 1));
    const x = p.x + out.x;
    const z = p.z + out.z;
    player.teleport(x, Math.max(terrain.heightAt(x, z), 0) + 0.1, z);
    player.setEnabled(true);
    player.look.yaw = yaw - Math.PI / 2;
    player.look.pitch = 0;
    mode = { kind: 'foot' };
  }

  function bedColor(load) {
    if (pileTotal(load) <= 0) return null;
    const c = new THREE.Color(0, 0, 0);
    const total = pileTotal(load);
    for (const [id, t] of Object.entries(load)) c.add(new THREE.Color(data.materials[id]?.color ?? '#999').multiplyScalar(t / total));
    return c;
  }

  // ---- single-press actions (from hotkeys) ----
  function handleAction(action) {
    const v = current();
    const m = currentMachine();
    const report = (r) => { if (r && !r.ok) notify(r.reason, 'warn'); };
    switch (action) {
      case 'interact': {
        if (v) exit();
        else {
          const near = nearestVehicle(ENTER_DISTANCE);
          if (near) enter(near);
          else if (nearOffice()) onUseOffice?.();
        }
        return true;
      }
      case 'camera':
        if (v) camMode = camMode === 'cab' ? 'chase' : 'cab';
        return true;
      case 'tip':
        if (v?.type !== 'truck') return true;
        if (!inRect(layout.tipBay, v.position().x, v.position().z, 1.5)) notify('Drive into the yellow tipping bay at the yard first', 'warn');
        else if (Math.abs(v.speed()) > 1.5) notify('Stop the truck before tipping', 'warn');
        else report(game.actions.tip(m.id));
        return true;
      case 'loadPile': {
        if (v?.type !== 'truck') return true;
        const fp = facePilePos;
        if (Math.hypot(v.position().x - fp.x, v.position().z - fp.z) > 9) notify('Park next to the face pile to load from it', 'warn');
        else if (Math.abs(v.speed()) > 1) notify('Stop the truck first', 'warn');
        else report(game.actions.loadFromPile(m.id));
        return true;
      }
      case 'repair': {
        if (!v) {
          const near = nearestVehicle(4);
          if (!near) {
            notify('Walk up to a machine to service it', 'warn');
            return true;
          }
          game.actions.selectMachine(near.machineId);
        }
        report(game.actions.serviceOrRepair());
        return true;
      }
      case 'recover':
        if (v?.type === 'truck') v.recover();
        return true;
      default:
        return false;
    }
  }

  // ---- per-frame control ----
  function controlFoot(keys, d, sens) {
    player.look.yaw -= d.x * sens;
    player.look.pitch = THREE.MathUtils.clamp(player.look.pitch - d.y * sens, -1.5, 1.5);
    player.input.forward = (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
    player.input.right = (keys('right') ? 1 : 0) - (keys('left') ? 1 : 0);
    player.input.sprint = keys('sprint');
    player.input.jump = keys('jump');
  }

  function controlTruck(v, m, keys, d, sens) {
    look.yaw = THREE.MathUtils.clamp(look.yaw - d.x * sens, -2.3, 2.3);
    look.pitch = THREE.MathUtils.clamp(look.pitch - d.y * sens, -1.2, 0.8);
    const busy = !!m.job;
    v.control.throttle = m.broken || busy ? 0 : (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
    v.control.steer = (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0);
    v.control.handbrake = keys('jump') || m.broken || busy;
  }

  let digHintShown = false;
  function controlExcavator(v, m, keys, d, sens, clicked, dt) {
    look.pitch = THREE.MathUtils.clamp(look.pitch - d.y * sens, -1.2, 0.6);
    const working = !!m.job || v.busy();
    if (!m.broken && !working) {
      v.swingBy(-d.x * sens);
      const move = (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
      const turn = (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0);
      v.drive(dt, move, turn);
    } else v.drive(dt, 0, 0);
    if (m.broken || working) return;

    const target = v.bucketTarget();
    const full = pileTotal(m.load) > 0.01;
    if (!full && mouse.isDown()) {
      const zoneId = zoneAt(layout, target.x, target.z);
      if (zoneId) {
        const r = game.actions.scoop(m.id, zoneId);
        if (!r.ok && clicked) notify(r.reason, 'warn');
      } else if (clicked && !digHintShown) {
        notify('Swing the bucket over a digging zone (the pit) to dig', 'warn');
        digHintShown = true;
      }
    } else if (full && clicked) {
      const truck = [...vehicles.values()].find((t) => t.type === 'truck' && t.isOverBed(target));      const site = game.state.sites[siteId];
      if (!truck && pileTotal(site.facePile) < 0.05 && !zoneAt(layout, target.x, target.z)) {
        facePilePos.x = target.x;
        facePilePos.z = target.z;
      }
      const r = game.actions.dumpBucket(m.id, truck?.machineId ?? null);
      if (r.ok) {
        v.startDump(truck ? truck.bedWorld().y : null);
        const at = truck ? truck.bedWorld() : target.setY(terrain.heightAt(target.x, target.z));
        particles.spawn(at, { count: 12, spread: 1.5, life: 1.8 });
      } else notify(r.reason, 'warn');
    }
  }

  // ---- game events -> effects ----
  const offs = [
    game.events.on('rockDug', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.type === 'excavator') {
        const t = v.bucketTarget();
        t.y = terrain.heightAt(t.x, t.z);
        particles.spawn(t, { count: 8, spread: 1.2, life: 1.5, up: 0.6 });
      }
    }),
    game.events.on('rockHauled', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.type === 'truck') particles.spawn(v.position().setY(0.5), { count: 25, spread: 4, life: 3, size: 2 });
    }),
    game.events.on('machineBought', (e) => {
      const m = getMachine(game.ctx, e.machineId);
      if (m && m.siteId === siteId) addVehicle(m);
    }),
    game.events.on('machineSold', (e) => {
      const v = vehicles.get(e.machineId);
      if (!v) return;
      if (current() === v) exit();
      v.destroy();
      vehicles.delete(e.machineId);
    }),
  ];

  // ---- camera ----
  const tmpQ = new THREE.Quaternion();
  const lookQ = new THREE.Quaternion();
  const lookE = new THREE.Euler();
  const head = createHeadSway();

  function placeCamera(dt) {
    const v = current();
    for (const veh of vehicles.values()) veh.model.setFirstPerson(veh === v && camMode === 'cab');
    if (!v) {
      camera.position.copy(player.eye());
      camera.rotation.set(player.look.pitch, player.look.yaw, 0);
      return;
    }
    const baseYaw = v.type === 'excavator' ? v.houseWorldYaw() : v.yaw();
    if (camMode === 'cab') {
      // The seat moves with the cab (pitch and roll too); your head sways against the
      // machine's acceleration and picks up engine and ground vibration.
      const cabQ = v.type === 'excavator' ? v.model.house.getWorldQuaternion(tmpQ) : tmpQ.copy(v.quaternion());
      const sway = head.update(dt, v, cabQ);
      camera.position.copy(v.seatWorld()).add(sway.offset);
      lookQ.setFromEuler(lookE.set(look.pitch + sway.pitch, -Math.PI / 2 + look.yaw, sway.roll, 'YXZ'));
      camera.quaternion.copy(cabQ).multiply(lookQ);
      return;
    }
    head.reset();
    // Chase camera behind the machine, orbiting with the mouse.
    const yaw = baseYaw + look.yaw;
    const p = v.position();
    const desired = new THREE.Vector3(p.x - Math.cos(yaw) * 12, p.y + 5.5 - look.pitch * 6, p.z + Math.sin(yaw) * 12);
    chasePos = chasePos ? chasePos.lerp(desired, Math.min(1, dt * 5)) : desired;
    camera.position.copy(chasePos);
    camera.lookAt(p.x, p.y + 1.8, p.z);
  }

  const resizeObserver = new ResizeObserver(() => {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  });
  resizeObserver.observe(container);

  // ---- exhaust smoke and dust
  const fx = new Map();
  const smokeClean = new THREE.Color(0x8e8c88);
  const smokeDirty = new THREE.Color(0x151413);
  const smokeCol = new THREE.Color();
  const DUSTY = { gravel: 1, dirt: 1.2, grass: 0.25, rock: 0.6, asphalt: 0 };
  function vehicleEffects(dt, veh) {
    const f = veh.feel();
    const mm = getMachine(game.ctx, veh.machineId);
    let st = fx.get(veh.machineId);
    if (!st) fx.set(veh.machineId, st = { smoke: 0, dust: 0, prev: f.engine, side: 1 });
    const running = f.engine === 'running' || f.engine === 'idleOut';
    const worn = mm?.tier === 'rusty' ? 1 : 0.45;
    // A thick black cough when a cold diesel catches.
    if (f.engine === 'running' && st.prev === 'cranking') {
      particles.spawn(veh.exhaustWorld(), { count: 7, spread: 0.3, up: 1.8, life: 2.6, size: 0.9, color: 0x1c1b1a, opacity: 0.55 * worn + 0.15 });
    }
    st.prev = f.engine;
    if (running) {
      const load = f.load ?? f.work ?? 0;
      st.smoke += dt * (2.5 + (f.rpm ?? 1500) / 500 + load * 7);
      smokeCol.copy(smokeClean).lerp(smokeDirty, Math.min(1, load * worn * 1.3 + (f.misfire ? 0.6 : 0)));
      while (st.smoke > 1) {
        st.smoke -= 1;
        particles.spawn(veh.exhaustWorld(), {
          count: 1, spread: 0.12, up: 1.5 + load, life: 1.4 + load * 1.2, size: 0.3 + load * 0.45,
          color: smokeCol.getHex(), opacity: 0.1 + load * (0.18 + 0.3 * worn),
        });
      }
    }
    if (veh.type === 'truck') {
      const speed = Math.abs(f.speed);
      const dusty = DUSTY[f.surface] ?? 0.8;
      st.dust += dt * dusty * (Math.max(0, speed - 1.5) * 1.3 + f.slip * 10);
      while (st.dust > 1) {
        st.dust -= 1;
        st.side = -st.side;
        const at = veh.model.root.localToWorld(new THREE.Vector3(-2.0 - Math.random() * 0.6, -1.2, st.side * 1.05));
        particles.spawn(at, {
          count: 1, spread: 0.5, up: 0.45, life: 2.4, size: 1.1 + speed * 0.09,
          color: 0xb7a07c, opacity: Math.min(0.4, 0.14 + speed * 0.012) * Math.min(1, dusty),
        });
      }
    } else {
      st.dust += dt * ((f.digging ? 9 : 0) + f.travel * 5);
      while (st.dust > 1) {
        st.dust -= 1;
        const at = f.digging ? veh.teethWorld() : veh.model.root.localToWorld(new THREE.Vector3(-2 * Math.sign(veh.speed() || 1), 0.2, (Math.random() - 0.5) * 2.6));
        particles.spawn(at, { count: 1, spread: 0.6, up: f.digging ? 0.8 : 0.3, life: 2, size: 1, color: 0xb7a07c, opacity: 0.28 });
      }
    }
  }

  function update(dt, { paused, keyboard }) {
    const keys = (a) => !paused && keyboard.isHeld(a);
    const d = mouse.takeDelta();
    const clicked = mouse.takePressed();
    const sens = MOUSE_SCALE * (settings.mouseSensitivity ?? 1);
    const dy = settings.invertY ? -d.y : d.y;
    const delta = paused ? { x: 0, y: 0 } : { x: d.x, y: dy };

    const v = current();
    const m = currentMachine();
    if (!v) controlFoot(keys, delta, sens);
    else if (v.type === 'truck') controlTruck(v, m, keys, delta, sens);
    else controlExcavator(v, m, keys, delta, sens, clicked && !paused, paused ? 0 : dt);

    if (!paused) physics.step(dt);
    terrain.update(dt);
    groundView?.update();
    piles.update();

    // Sync machines with their game state.
    for (const veh of vehicles.values()) {
      const mm = getMachine(game.ctx, veh.machineId);
      if (!mm) continue;
      if (veh.type === 'truck') {
        const cap = getStats(data, mm).capacity;
        const tonnes = pileTotal(mm.load);
        veh.setCargo(tonnes);
        veh.update(dt, { job: mm.job, fill: tonnes / cap, color: bedColor(mm.load), occupied: veh === v });
        if (veh !== v) {
          veh.control.throttle = 0;
          veh.control.handbrake = true;
        }
      } else {
        if (veh !== v) veh.drive(dt, 0, 0);
        veh.update(dt, { job: mm.job, bucketFull: pileTotal(mm.load) > 0.01, bucketColor: bedColor(mm.load), occupied: veh === v });
      }
    }

    if (!paused) for (const veh of vehicles.values()) vehicleEffects(dt, veh);

    // Bucket target marker.
    if (v?.type === 'excavator' && !m.job) {
      const t = v.bucketTarget();
      const truck = [...vehicles.values()].find((tr) => tr.type === 'truck' && tr.isOverBed(t));
      const full = pileTotal(m.load) > 0.01;
      const zone = zoneAt(layout, t.x, t.z);
      marker.visible = true;
      marker.position.set(t.x, (truck ? truck.bedWorld().y : terrain.heightAt(t.x, t.z)) + 0.08, t.z);
      marker.material.color.set(full ? (truck ? 0x4fc3f7 : 0xf2b632) : (zone ? 0x7ee07e : 0x888888));
    } else marker.visible = false;

    particles.update(dt);
    vegetation.update(dt);
    trees.update(dt);
    placeCamera(dt);
    sounds?.update(dt, {
      camera,
      vehicles,
      current: v,
      player: paused ? null : player,
      jobOf: (id) => getMachine(game.ctx, id)?.job ?? null,
      tierOf: (id) => getMachine(game.ctx, id)?.tier ?? 'rusty',
    });
    env.follow(v ? v.position() : player.feet());
    renderer.render(scene, camera);
  }

  // What the HUD should show right now.
  // What the HUD should show right now. `prompt` is { key, text } (key may be null),
  // `job` is { label, progress } while the machine you're in is working.
  function hudInfo() {
    const v = current();
    const m = currentMachine();
    const key = (action) => keyLabel(settings.bindings[action]);
    let prompt = null;
    let job = null;
    if (!v) {
      const near = nearestVehicle(ENTER_DISTANCE);
      if (near) {
        const nm = getMachine(game.ctx, near.machineId);
        prompt = nm.broken
          ? { key: key('repair'), text: `Repair ${machineName(data, nm)}` }
          : { key: key('interact'), text: `Get in ${machineName(data, nm)}` };
      } else if (nearOffice()) {
        prompt = { key: key('interact'), text: 'Use the office laptop (buy machines)' };
      }
    } else if (m.broken) {
      prompt = { key: key('repair'), text: 'Broken down — repair' };
    } else if (m.job) {
      job = { label: JOBS[m.job.type].label, progress: jobProgress(m.job) };
    } else if (v.type === 'excavator') {
      const t = v.bucketTarget();
      const full = pileTotal(m.load) > 0.01;
      const truck = [...vehicles.values()].find((tr) => tr.type === 'truck' && tr.isOverBed(t));
      const zone = zoneAt(layout, t.x, t.z);
      if (!full) prompt = zone ? { key: 'Hold LMB', text: `Dig zone ${zone}` } : { key: null, text: 'Swing the bucket over the pit to dig' };
      else if (truck) prompt = { key: 'LMB', text: `Dump into ${machineName(data, getMachine(game.ctx, truck.machineId))}` };
      else prompt = { key: 'LMB', text: 'Dump on the face pile' };
    } else if (v.type === 'truck') {
      const p = v.position();
      const loaded = pileTotal(m.load) > 0.05;
      const fp = facePilePos;
      if (loaded && inRect(layout.tipBay, p.x, p.z, 1.5)) prompt = { key: key('tip'), text: 'Tip the load' };
      else if (Math.hypot(p.x - fp.x, p.z - fp.z) < 9) prompt = { key: key('loadPile'), text: 'Load from the face pile' };
      else if (loaded) prompt = { key: null, text: 'Drive to the yellow tipping bay at the yard' };
    }

    let machine = null;
    if (m) {
      const stats = getStats(data, m);
      machine = {
        name: machineName(data, m),
        tier: m.tier,
        type: m.type,
        condition: m.condition,
        broken: m.broken,
        load: pileTotal(m.load),
        capacity: m.type === 'truck' ? stats.capacity : stats.bucket,
        speedKmh: Math.abs(v.speed()) * 3.6,
        camera: camMode,
      };
      const f = v.feel();
      machine.engine = f.engine; // off / cranking / running / idleOut / stopping / stall
      if (v.type === 'truck') {
        machine.rpm = f.rpm;
        machine.gear = f.shifting ? '–' : f.gear < 0 ? 'R' : String(f.gear);
      }
    }
    return { prompt, job, machine, mode: mode.kind, locked: mouse.locked() };
  }

  // Remember where everything is, so saves put machines back in place.
  function writePositions(state) {
    const machines = {};
    for (const [id, v] of vehicles) machines[id] = v.placement();
    const feet = current() ? current().position() : player.feet();
    state.positions = {
      facePile: { ...facePilePos },
      machines,
      player: { x: feet.x + 3, z: feet.z, yaw: current() ? 0 : player.look.yaw },
    };
  }

  // For automated play tests and the dev console.
  const debug = {
    teleportPlayer(x, z, yaw = player.look.yaw) {
      if (current()) exit();
      player.teleport(x, terrain.heightAt(x, z) + 0.1, z);
      player.look.yaw = yaw;
    },
    placeVehicle(id, x, z, yaw = 0) {
      const v = vehicles.get(id);
      if (v?.type === 'truck') v.phys.reset(x, terrain.heightAt(x, z), z, yaw);
      if (v?.type === 'excavator') Object.assign(v.state, { x, z, yaw });
    },
    swing(delta) {
      if (current()?.type === 'excavator') current().swingBy(delta);
    },
    setFootPitch(pitch) {
      player.look.pitch = pitch;
    },
    setHouseYaw(yaw) {
      const v = current();
      if (v?.type === 'excavator') Object.assign(v.state, { houseYaw: yaw, targetHouseYaw: yaw });
    },
    mode: () => mode.kind,
    scene,
    look: () => ({ ...look, foot: { ...player.look } }),
    vehicle: (id) => vehicles.get(id),
    // Ground testing: dig a bowl or drop material at a spot.
    digAt: (x, z, depth = 0.5, radius = 1) => game.actions.digGround({ x, z, radius, bottomY: terrain.heightAt(x, z) - depth }),
    dumpAt: (x, z, tonnes = { gravel: 2 }, radius = 0.8) => game.actions.dumpGround({ x, z, tonnes, radius }),
    // Machine camera angle (for screenshots): yaw offset and pitch.
    setLook(yaw, pitch = look.pitch) {
      look.yaw = yaw;
      look.pitch = pitch;
    },
  };

  return {
    debug,
    update,
    handleAction,
    hudInfo,
    writePositions,
    lockMouse: () => mouse.lock(),
    unlockMouse: () => mouse.unlock(),
    isMouseLocked: () => mouse.locked(),
    destroy() {
      offs.forEach((off) => off());
      resizeObserver.disconnect();
      mouse.destroy();
      sounds?.destroy();
      groundView?.dispose();
      for (const v of vehicles.values()) v.destroy();
      player.destroy();
      terrain.dispose();
      renderer.dispose();
      physics.destroy();
      canvas.remove();
    },
  };
}

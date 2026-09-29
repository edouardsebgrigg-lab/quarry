// The 3D world: the countryside map with your field, the village and the depot. Reads the
// game state, draws it, and turns walking, driving and digging into calls to the same game
// actions the rest of the game uses.
import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { createRenderer, createEnvironment } from './environment.js';
import { createCountryside, planWorld, preloadCountryside } from './countryside.js';
import { buildPlaces } from './places.js';
import { createParticles } from './particles.js';
import { createPlayer } from './player.js';
import { createTruck } from './truck.js';
import { createExcavator } from './excavator.js';
import { createMouse } from './mouse.js';
import { preloadModels } from './glbModels.js';
import { preloadGround } from './groundMaterial.js';
import { preloadVegetation, createVegetation, createTrees } from './vegetation.js';
import { createWorldSounds } from './sounds.js';
import { createGroundView } from './groundChunks.js';
import { createHandTools } from './handTools.js';
import { createHeadSway } from './headSway.js';
import { MAP, inRect } from './map.js';
import { keyLabel } from '../input/index.js';
import { pileTotal } from '../quarry/index.js';
import {
  getStats, machinesAt, machineName, getMachine, JOBS, jobProgress,
} from '../machinery/index.js';
import { hasTicket, quoteDelivery } from '../economy/index.js';

const MOUSE_SCALE = 0.0022;
const ENTER_DISTANCE = 2.8;
const BARROW_GRAB = 1.5; // how close to the wheelbarrow's handles you must be to take it
const WEIGH_TIME = 1.2; // seconds a loaded vehicle must stand on the weighbridge

// What each plot material counts as, for grip and plants.
const PLOT_SURFACE = {
  topsoil: { grass: 0, dirt: 1, gravel: 0, rock: 0 },
  clay: { grass: 0, dirt: 1, gravel: 0, rock: 0 },
  sand: { grass: 0, dirt: 0.6, gravel: 0.4, rock: 0 },
  gravel: { grass: 0, dirt: 0, gravel: 1, rock: 0 },
  rock: { grass: 0, dirt: 0, gravel: 0, rock: 1 },
};

export async function createWorld3D({ container, game, settings, audio = null, notify, onPointerLockLost, onUseOffice }) {
  const { data } = game;
  const siteId = game.state.currentSiteId;
  const home = MAP.home;
  const ground = game.ctx.ground;

  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  container.append(canvas);
  const { renderer, q } = createRenderer(canvas, settings.graphics);
  const [physics] = await Promise.all([createPhysics(), preloadModels(), preloadGround(renderer), preloadVegetation(renderer), preloadCountryside(renderer)]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 5000);
  camera.rotation.order = 'YXZ';

  // ---- the land
  const plan = planWorld(MAP);
  const land = createCountryside({ scene, physics, ground, plan });
  const half = MAP.half;
  const env = createEnvironment(scene, renderer, q, { x0: -half, x1: half, z0: -half, z1: half }, { outsideY: 28, hillDistance: [1300, 2200] });
  // Your field: its own chunked mesh and colliders, following the ground as it changes.
  const groundView = ground ? createGroundView({ scene, physics, ground }) : null;
  const heightAt = (x, z) => land.heightAt(x, z);
  const onPlot = (x, z) => ground && ground.inside(x, z);
  // Height and surface mix anywhere (your field uses the real ground's top material).
  function surfaceAt(x, z) {
    if (onPlot(x, z)) {
      const mat = ground.surfaceAt(x, z);
      const i = Math.floor((x - ground.x0) / ground.cellSize);
      const j = Math.floor((z - ground.z0) / ground.cellSize);
      const grass = mat === 'topsoil' && !ground.cellDisturbed(i, j) ? 1 : 0;
      return { height: ground.heightAt(x, z), ...(grass ? { grass: 1, dirt: 0, gravel: 0, rock: 0 } : PLOT_SURFACE[mat]), plot: true };
    }
    return land.surfaceAt(x, z);
  }
  const terrain = { heightAt, surfaceAt };

  const bayNames = Object.fromEntries(Object.entries(data.depot.bays).map(([id, b]) => [id, b.name]));
  const places = buildPlaces({ scene, physics, plan, heightAt, materials: data.materials, bayNames });
  const particles = createParticles(scene);

  // ---- plants: grass around you, trees along hedges, roads and in copses
  const houseRects = [...plan.houses, plan.pub].map((h) => ({ x0: h.x - 8, x1: h.x + 8, z0: h.z - 8, z1: h.z + 8 }));
  const noGrowth = [
    [home.plot, 0.5], [home.yard, 1], [MAP.depot.yard, 1], [MAP.dealer.yard, 1],
    [{ x0: home.driveway.x0, x1: home.driveway.x1, z0: home.yard.z0 - 14, z1: home.yard.z0 }, 1],
    [{ x0: MAP.depot.driveway.x0, x1: MAP.depot.driveway.x1, z0: MAP.depot.yard.z1, z1: MAP.depot.yard.z1 + 10 }, 1],
    ...houseRects.map((r) => [r, 0]),
  ];
  const vegetation = createVegetation({
    scene,
    quality: settings.graphics,
    surfaceAt,
    blocked: (x, z) => noGrowth.some(([r, m]) => inRect(r, x, z, m)),
  });
  const trees = createTrees({
    scene,
    quality: settings.graphics,
    plan: treePlan(plan),
    keepClear: (x, z) => land.onRoad(x, z, 2.5) || noGrowth.some(([r, m]) => inRect(r, x, z, m + 3)),
    groundHeight: heightAt,
  });

  const saved = game.state.positions ?? {};
  const spawn = saved.player ?? home.playerSpawn;
  const player = createPlayer({ physics, spawn: { ...spawn, y: heightAt(spawn.x, spawn.z) } });
  player.look.yaw = spawn.yaw ?? 0;

  // ---- machines ----
  const vehicles = new Map();
  const parkingUsed = { excavator: 0, truck: 0, spare: 0 };
  function parkingSpot(type) {
    if (type === 'pickup') return home.pickup;
    const list = home.parking[type] ?? [];
    if ((parkingUsed[type] ?? 0) < list.length) return list[parkingUsed[type]++];
    const s = home.parking.spare;
    return { x: s.x + s.stepX * parkingUsed.spare++, z: s.z, yaw: -Math.PI / 2 };
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
    if (!onPlot(x, z) && land.onRoad(x, z)) return ASPHALT;
    const s = surfaceAt(x, z);
    let grip = 0;
    let roll = 0;
    let name = 'dirt';
    let best = 0;
    for (const k of ['grass', 'dirt', 'gravel', 'rock']) {
      const share = s[k] ?? 0;
      grip += SURFACES[k].grip * share;
      roll += SURFACES[k].roll * share;
      if (share > best) {
        best = share;
        name = k;
      }
    }
    return { grip: grip || 0.7, roll: roll || 0.035, name };
  }

  const sounds = audio ? createWorldSounds({ audio, carRoute: laneRoute(plan, heightAt), groundSurface }) : null;

  // Site machines (not road-legal) stay on your land.
  let blockedNoteT = 0;
  const onYourLand = (x, z) => inRect(home.boundary, x, z);
  function addVehicle(machine) {
    const spot = saved.machines?.[machine.id] ?? parkingSpot(machine.type);
    const stats = () => getStats(data, getMachine(game.ctx, machine.id) ?? machine);
    const live = () => getMachine(game.ctx, machine.id);
    const args = { physics, scene, terrain, machine, spawn: spot, stats, live, surfaceAt: groundSurface };
    const v = machine.type === 'excavator'
      ? createExcavator({
        ...args,
        allowedAt: onYourLand,
        onBlocked: () => {
          if (blockedNoteT > 0) return;
          blockedNoteT = 4;
          notify('Site machines aren\'t road-legal: the excavator stays on your land', 'warn');
        },
      })
      : createTruck(args);
    vehicles.set(machine.id, v);
  }
  for (const m of machinesAt(game.ctx, siteId)) addVehicle(m);

  // Your shovel and wheelbarrow (the shovel is drawn in front of the camera).
  scene.add(camera);
  const hands = createHandTools({
    scene, camera, physics, terrain, game, home, player, particles, vehicles, audio, notify, saved: saved.barrow ?? null,
  });

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
  const vehicleDistance = (veh) => veh.position().setY(player.feet().y).distanceTo(player.feet()) - veh.radius;

  function nearestVehicle(maxDist) {
    let best = null;
    let bestD = Infinity;
    for (const v of vehicles.values()) {
      const d = vehicleDistance(v);
      if (d < maxDist && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  // Doors that open the shop: the laptop in your office, and Ashby Plant's front desk.
  function nearDoor() {
    const f = player.feet();
    for (const [door, what] of [[places.officeDoor, 'office'], [places.dealerDoor, 'dealer']]) {
      if (Math.hypot(f.x - door.x, f.z - door.z) < 3) return what;
    }
    return null;
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
    if (v.road) {
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
    player.teleport(x, heightAt(x, z) + 0.1, z);
    player.setEnabled(true);
    player.look.yaw = yaw - Math.PI / 2;
    player.look.pitch = 0;
    mode = { kind: 'foot' };
  }

  function bedColor(load) {
    if (pileTotal(load) <= 0) return null;
    const c = new THREE.Color(0, 0, 0);
    const total = pileTotal(load);
    for (const [id, t] of Object.entries(load)) {
      c.add(new THREE.Color(data.ground.materials[id]?.color ?? data.materials[id]?.color ?? '#999').multiplyScalar(t / total));
    }
    return c;
  }

  // Where a road vehicle would unload: a depot bay (if its tail is in one) or the ground just
  // behind it. Returns { bay } or { x, z } (or { reason }).
  function unloadSpot(v) {
    const tail = v.tailgateWorld();
    const bay = places.bayAt(tail.x, tail.z);
    if (bay) return { bay: bay.id, name: bay.name };
    const back = new THREE.Vector3(-Math.cos(v.yaw()), 0, Math.sin(v.yaw()));
    const x = tail.x + back.x * 1.2;
    const z = tail.z + back.z * 1.2;
    if (ground?.workable(x, z)) return { x, z };
    return { reason: 'Unload on your field, or in a bay at Ashby Aggregates' };
  }

  // ---- single-press actions (from hotkeys) ----
  function handleAction(action) {
    const v = current();
    const m = currentMachine();
    const report = (r) => { if (r && !r.ok) notify(r.reason, 'warn'); };
    switch (action) {
      case 'interact': {
        if (v) exit();
        else if (hands.holding()) hands.letGo();
        else {
          const near = nearestVehicle(ENTER_DISTANCE);
          const barrowD = hands.grabDistance();
          if (barrowD < BARROW_GRAB && (!near || barrowD < vehicleDistance(near))) hands.grab();
          else if (near) enter(near);
          else if (nearDoor()) onUseOffice?.();
        }
        return true;
      }
      case 'camera':
        if (v) camMode = camMode === 'cab' ? 'chase' : 'cab';
        return true;
      case 'tip': {
        if (!v && hands.holding()) {
          hands.tip();
          return true;
        }
        if (!v?.road) return true;
        if (Math.abs(v.speed()) > 1.5) {
          notify('Stop before unloading', 'warn');
          return true;
        }
        const spot = unloadSpot(v);
        if (spot.reason) notify(spot.reason, 'warn');
        else report(game.actions.tip(m.id, spot.bay ? { bay: spot.bay } : { x: spot.x, z: spot.z }));
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
        if (v?.road) v.recover();
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

  // What the excavator's bucket is over: a vehicle's bed, or the ground.
  const bedUnder = (t) => [...vehicles.values()].find((tr) => tr.road && tr.isOverBed(t)) ?? null;

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
      if (ground?.workable(target.x, target.z)) {
        const r = game.actions.scoop(m.id, { x: target.x, z: target.z });
        if (!r.ok && clicked) notify(r.reason, 'warn');
      } else if (clicked && !digHintShown) {
        notify('Swing the bucket over your field to dig', 'warn');
        digHintShown = true;
      }
    } else if (full && clicked) {
      const bed = bedUnder(target);
      const r = bed
        ? game.actions.dumpBucket(m.id, { machineId: bed.machineId })
        : game.actions.dumpBucket(m.id, { x: target.x, z: target.z });
      if (r.ok) {
        v.startDump(bed ? bed.bedWorld().y : null);
        const at = bed ? bed.bedWorld() : target.setY(heightAt(target.x, target.z));
        particles.spawn(at, { count: 12, spread: 1.5, life: 1.8 });
      } else notify(r.reason, 'warn');
    }
  }

  // ---- the weighbridge: a loaded road vehicle standing on it is weighed in
  const weigh = new Map(); // machineId -> seconds on the bridge
  function updateWeighbridge(dt) {
    let busy = false;
    for (const v of vehicles.values()) {
      if (!v.road) continue;
      const m = getMachine(game.ctx, v.machineId);
      const p = v.position();
      const on = places.onWeighbridge(p.x, p.z);
      if (!on || !m || pileTotal(m.load) < data.depot.minLoad || hasTicket(game.ctx, m.id) || Math.abs(v.speed()) > 0.4) {
        weigh.delete(v.machineId);
        continue;
      }
      busy = true;
      const t = (weigh.get(v.machineId) ?? 0) + dt;
      weigh.set(v.machineId, t);
      if (t >= WEIGH_TIME) {
        weigh.delete(v.machineId);
        const r = game.actions.weighIn(m.id);
        if (r.ok) {
          const mix = Object.entries(m.load).sort((a, b) => b[1] - a[1])
            .map(([id, tt]) => `${data.materials[id]?.name.toLowerCase() ?? id} ${Math.round((tt / r.tonnes) * 100)}%`).join(', ');
          notify(`Weighed in: ${r.tonnes.toFixed(2)} t (${mix}). Unload in the right bay (T).`, 'good');
          sounds?.play('chime', { gain: 0.4 });
        }
      }
    }
    places.setLight(!busy);
  }

  // ---- game events -> effects ----
  const offs = [
    game.events.on('rockDug', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.type === 'excavator') {
        const t = v.bucketTarget();
        t.y = heightAt(t.x, t.z);
        particles.spawn(t, { count: 8, spread: 1.2, life: 1.5, up: 0.6 });
      }
    }),
    game.events.on('rockHauled', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.road) particles.spawn(v.tailgateWorld(), { count: 20, spread: 2.5, life: 2.6, size: 1.6 });
    }),
    game.events.on('productSold', (e) => places.delivered(e.bayId, e.tonnes)),
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

  // Target marker on the ground where the excavator bucket will dig/dump.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 32),
    new THREE.MeshBasicMaterial({ color: 0xf2b632, transparent: true, opacity: 0.8, depthTest: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

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
    const dist = v.type === 'pickup' ? 8.5 : 12;
    const desired = new THREE.Vector3(p.x - Math.cos(yaw) * dist, p.y + dist * 0.45 - look.pitch * 6, p.z + Math.sin(yaw) * dist);
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1.2);
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
    const petrol = veh.type === 'pickup' ? 0.35 : 1; // a petrol engine smokes far less
    // A thick black cough when a cold diesel catches.
    if (f.engine === 'running' && st.prev === 'cranking') {
      particles.spawn(veh.exhaustWorld(), { count: 7, spread: 0.3, up: 1.8, life: 2.6, size: 0.9, color: 0x1c1b1a, opacity: (0.55 * worn + 0.15) * petrol });
    }
    st.prev = f.engine;
    if (running) {
      const load = f.load ?? f.work ?? 0;
      st.smoke += dt * (2.5 + (f.rpm ?? 1500) / 500 + load * 7) * petrol;
      smokeCol.copy(smokeClean).lerp(smokeDirty, Math.min(1, load * worn * 1.3 * petrol + (f.misfire ? 0.6 : 0)));
      while (st.smoke > 1) {
        st.smoke -= 1;
        particles.spawn(veh.exhaustWorld(), {
          count: 1, spread: 0.12, up: 1.5 + load, life: 1.4 + load * 1.2, size: 0.3 + load * 0.45,
          color: smokeCol.getHex(), opacity: (0.1 + load * (0.18 + 0.3 * worn)) * petrol,
        });
      }
    }
    if (veh.road) {
      const speed = Math.abs(f.speed);
      const dusty = DUSTY[f.surface] ?? 0.8;
      st.dust += dt * dusty * (Math.max(0, speed - 1.5) * 1.3 + f.slip * 10);
      while (st.dust > 1) {
        st.dust -= 1;
        st.side = -st.side;
        const at = veh.tailgateWorld().add(new THREE.Vector3(0, -0.5, st.side * 0.8));
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
    blockedNoteT = Math.max(0, blockedNoteT - dt);

    const v = current();
    const m = currentMachine();
    if (!v && hands.holding()) hands.controlHeld(paused ? 0 : dt, keys, delta, sens);
    else if (!v) controlFoot(keys, delta, sens);
    else if (v.road) controlTruck(v, m, keys, delta, sens);
    else controlExcavator(v, m, keys, delta, sens, clicked && !paused, paused ? 0 : dt);

    if (!paused) physics.step(dt);
    groundView?.update();
    hands.update(paused ? 0 : dt, { onFoot: !v, clicked: clicked && !paused, paused });
    if (!paused) updateWeighbridge(dt);

    // Sync machines with their game state.
    for (const veh of vehicles.values()) {
      const mm = getMachine(game.ctx, veh.machineId);
      if (!mm) continue;
      if (veh.road) {
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
      const bed = bedUnder(t);
      const full = pileTotal(m.load) > 0.01;
      const diggable = ground?.workable(t.x, t.z);
      marker.visible = true;
      marker.position.set(t.x, (bed ? bed.bedWorld().y : heightAt(t.x, t.z)) + 0.08, t.z);
      marker.material.color.set(full ? (bed ? 0x4fc3f7 : (diggable ? 0xf2b632 : 0x888888)) : (diggable ? 0x7ee07e : 0x888888));
    } else marker.visible = false;

    particles.update(dt);
    const here = v ? v.position() : player.feet();
    vegetation.update(dt, here);
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
    env.follow(here);
    renderer.render(scene, camera);
  }

  // What the HUD should show right now. `prompt` is { key, text } (key may be null) or a list
  // of them; `job` is { label, progress } while the machine you're in is working.
  function hudInfo() {
    const v = current();
    const m = currentMachine();
    const key = (action) => keyLabel(settings.bindings[action]);
    let prompt = null;
    let job = null;
    let tool = null;
    if (!v) {
      const h = hands.hud(key);
      tool = h.dash;
      let use = null;
      if (!hands.holding()) {
        const near = nearestVehicle(ENTER_DISTANCE);
        const barrowD = hands.grabDistance();
        const door = nearDoor();
        if (barrowD < BARROW_GRAB && (!near || barrowD < vehicleDistance(near))) {
          use = { key: key('interact'), text: 'Take the wheelbarrow' };
        } else if (near) {
          const nm = getMachine(game.ctx, near.machineId);
          use = nm.broken
            ? { key: key('repair'), text: `Repair ${machineName(data, nm)}` }
            : { key: key('interact'), text: `Get in ${machineName(data, nm)}` };
        } else if (door === 'office') {
          use = { key: key('interact'), text: 'Use the office laptop (buy machines)' };
        } else if (door === 'dealer') {
          use = { key: key('interact'), text: 'Ashby Plant: buy machines and upgrades' };
        }
      }
      const list = [...h.prompts, use].filter(Boolean);
      prompt = list.length ? list : null;
    } else if (m.broken) {
      prompt = { key: key('repair'), text: 'Broken down — repair' };
    } else if (m.job) {
      const label = m.job.type === 'tip' && v.type === 'pickup' ? 'Shovelling off' : JOBS[m.job.type].label;
      job = { label, progress: jobProgress(m.job) };
    } else if (v.type === 'excavator') {
      const t = v.bucketTarget();
      const full = pileTotal(m.load) > 0.01;
      const bed = bedUnder(t);
      const diggable = ground?.workable(t.x, t.z);
      if (!full) {
        prompt = diggable
          ? { key: 'Hold LMB', text: `Dig ${(data.ground.materials[ground.surfaceAt(t.x, t.z)]?.name ?? '').toLowerCase()}` }
          : { key: null, text: 'Swing the bucket over your field to dig' };
      } else if (bed) prompt = { key: 'LMB', text: `Dump into ${machineName(data, getMachine(game.ctx, bed.machineId))}` };
      else if (diggable) prompt = { key: 'LMB', text: 'Dump here' };
      else prompt = { key: null, text: 'Swing over your field or a truck to dump' };
    } else if (v.road) {
      const loaded = pileTotal(m.load) >= data.depot.minLoad;
      const p = v.position();
      if (loaded) {
        const spot = unloadSpot(v);
        if (spot.bay) {
          if (!hasTicket(game.ctx, m.id)) prompt = { key: null, text: 'Weigh in on the weighbridge first' };
          else {
            const qd = quoteDelivery(game.ctx, spot.bay, m.load);
            prompt = { key: key('tip'), text: `Unload in the ${spot.name} bay: ${qd.grade}, $${qd.perTonne.toFixed(2)}/t` };
          }
        } else if (places.onWeighbridge(p.x, p.z)) {
          prompt = { key: null, text: hasTicket(game.ctx, m.id) ? 'Weighed in: drive on to the bays' : 'Stop here to weigh in…' };
        } else if (spot.x !== undefined) {
          prompt = { key: key('tip'), text: v.type === 'pickup' ? 'Shovel it off here' : 'Tip here' };
        } else if (inRect(MAP.depot.yard, p.x, p.z, 10)) {
          prompt = { key: null, text: hasTicket(game.ctx, m.id) ? 'Back up into the right bay to unload' : 'Weigh in on the weighbridge at the gate' };
        } else {
          prompt = { key: null, text: `Take it to ${MAP.depot.name} to sell (Tab: map)` };
        }
      }
    }

    let machine = null;
    if (m) {
      const stats = getStats(data, m);
      machine = {
        name: machineName(data, m),
        tier: m.tier,
        type: m.type,
        road: !!v.road,
        condition: m.condition,
        broken: m.broken,
        load: pileTotal(m.load),
        capacity: m.type === 'excavator' ? stats.bucketVolume * 1.6 : stats.capacity,
        speedKmh: Math.abs(v.speed()) * 3.6,
        camera: camMode,
        ticket: hasTicket(game.ctx, m.id),
      };
      const f = v.feel();
      machine.engine = f.engine; // off / cranking / running / idleOut / stopping / stall
      if (v.road) {
        machine.rpm = f.rpm;
        machine.maxRpm = v.type === 'pickup' ? 4600 : 2600;
        machine.gear = f.shifting ? '–' : f.gear < 0 ? 'R' : String(f.gear);
      }
    }
    return { prompt, job, machine: machine ?? tool, mode: hands.holding() ? 'barrow' : mode.kind, locked: mouse.locked() };
  }

  // Remember where everything is, so saves put machines back in place.
  function writePositions(state) {
    const machines = {};
    for (const [id, veh] of vehicles) machines[id] = veh.placement();
    const feet = current() ? current().position() : player.feet();
    state.positions = {
      barrow: hands.placement(),
      machines,
      player: { x: feet.x + 3, z: feet.z, yaw: current() ? 0 : player.look.yaw },
    };
  }

  // Where things are, for the map screen.
  function mapInfo() {
    const v = current();
    const p = v ? v.position() : player.feet();
    const yaw = v ? (v.type === 'excavator' ? v.houseWorldYaw() : v.yaw()) : player.look.yaw + Math.PI / 2;
    return {
      you: { x: p.x, z: p.z, yaw },
      vehicles: [...vehicles.values()].map((veh) => {
        const q2 = veh.position();
        return { id: veh.machineId, type: veh.type, x: q2.x, z: q2.z, yaw: veh.yaw(), current: veh === v };
      }),
      barrow: hands.placement(),
    };
  }

  // For automated play tests and the dev console.
  const debug = {
    hands,
    places,
    land,
    teleportPlayer(x, z, yaw = player.look.yaw) {
      if (current()) exit();
      hands.letGo();
      player.teleport(x, heightAt(x, z) + 0.1, z);
      player.look.yaw = yaw;
    },
    placeVehicle(id, x, z, yaw = 0) {
      const veh = vehicles.get(id);
      if (veh?.road) veh.phys.reset(x, heightAt(x, z), z, yaw);
      if (veh?.type === 'excavator') Object.assign(veh.state, { x, z, yaw });
    },
    enterVehicle(id) {
      const veh = vehicles.get(id);
      if (veh) enter(veh);
    },
    exitVehicle: () => exit(),
    swing(dl) {
      if (current()?.type === 'excavator') current().swingBy(dl);
    },
    setFootPitch(pitch) {
      player.look.pitch = pitch;
    },
    setHouseYaw(yaw) {
      const veh = current();
      if (veh?.type === 'excavator') Object.assign(veh.state, { houseYaw: yaw, targetHouseYaw: yaw });
    },
    // Hand tools: press the mouse button (dig / tip the shovel), or E / T with the barrow.
    useShovel: () => hands.useShovel(),
    takeBarrow: () => hands.grab(),
    letGoBarrow: () => hands.letGo(),
    tipBarrow: () => hands.tip(),
    mode: () => mode.kind,
    scene,
    camera,
    look: () => ({ ...look, foot: { ...player.look } }),
    vehicle: (id) => vehicles.get(id),
    // Ground testing: dig a bowl or drop material at a spot.
    digAt: (x, z, depth = 0.5, radius = 1) => game.actions.digGround({ x, z, radius, bottomY: heightAt(x, z) - depth }),
    dumpAt: (x, z, tonnes = { gravel: 2 }, radius = 0.8) => game.actions.dumpGround({ x, z, tonnes, radius }),
    // Machine camera angle (for screenshots): yaw offset and pitch.
    setLook(yaw, pitch = look.pitch) {
      look.yaw = yaw;
      look.pitch = pitch;
    },
    setCamMode: (c) => { camMode = c; },
  };

  return {
    debug,
    update,
    handleAction,
    hudInfo,
    mapInfo,
    writePositions,
    plan,
    heightGrid: () => land.heightGrid(),
    lockMouse: () => mouse.lock(),
    unlockMouse: () => mouse.unlock(),
    isMouseLocked: () => mouse.locked(),
    destroy() {
      offs.forEach((off) => off());
      resizeObserver.disconnect();
      mouse.destroy();
      sounds?.destroy();
      groundView?.dispose();
      hands.destroy();
      for (const veh of vehicles.values()) veh.destroy();
      player.destroy();
      land.dispose();
      renderer.dispose();
      physics.destroy();
      canvas.remove();
    },
  };
}

// Hedges, copses and rows of trees for the map: the map's own hedges, plus hedgerows along both
// sides of the roads (with gaps at gateways, junctions and through the village).
function treePlan(plan) {
  const { map } = plan;
  const gaps = [
    ...plan.roads.flatMap((r) => [r.samples[0], r.samples[r.samples.length - 1]]).map((p) => [p.x, p.z, 26]),
    [(map.home.driveway.x0 + map.home.driveway.x1) / 2, map.home.yard.z0 - 10, 14],
    [(map.depot.driveway.x0 + map.depot.driveway.x1) / 2, map.depot.yard.z1 + 4, 16],
    [map.dealer.yard.x0 - 6, (map.dealer.driveway.z0 + map.dealer.driveway.z1) / 2, 14],
  ];
  const village = { x0: 520, x1: 720, z0: -620, z1: -370 };
  const hedges = [...map.hedges];
  for (const road of plan.roads) {
    for (const side of [-1, 1]) {
      let line = [];
      const flush = () => {
        if (line.length > 1) hedges.push(line);
        line = [];
      };
      for (let i = 0; i < road.samples.length; i += 3) {
        const p = road.samples[i];
        const off = road.hw + 3.2;
        const x = p.x - p.dz * off * side;
        const z = p.z + p.dx * off * side;
        const inGap = gaps.some(([gx, gz, r]) => Math.hypot(gx - x, gz - z) < r) || inRect(village, x, z)
          || Math.abs(x) > map.half - 30 || Math.abs(z) > map.half - 30;
        if (inGap) flush();
        else line.push([x, z]);
      }
      flush();
    }
  }
  // Trees in the village gardens: one behind most houses.
  const singles = [...plan.houses, plan.pub].filter((h, i) => i % 3 !== 1).map((h) => [h.x - Math.sin(h.yaw) * 12, h.z - Math.cos(h.yaw) * 12, 0]);
  return {
    hedges,
    copses: map.copses,
    rows: map.poplars.length === 2 ? [[map.poplars[0], map.poplars[1]]] : [],
    singles,
    lone: { count: 60, half: map.half - 60 },
  };
}

// Points along Mill Lane (2 m apart, with heights) for passing cars to follow.
function laneRoute(plan, heightAt) {
  return plan.byId.millLane.samples.map((p) => ({ ...p, y: heightAt(p.x, p.z) }));
}

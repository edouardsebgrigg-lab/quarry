// The 3D world: the countryside map with your field, the village and the depot. Reads the
// game state, draws it, and turns walking, driving and digging into calls to the same game
// actions the rest of the game uses.
import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { createRenderer, createEnvironment, createFrameRenderer } from './environment.js';
import { createCountryside, planWorld, preloadCountryside } from './countryside.js';
import { ownsBuilding } from '../buildings/index.js';
import { buildPlaces } from './places.js';
import { buildFarms, farmClearRect, farmTrees, farmTrack } from './farms.js';
import { createParticles } from './particles.js';
import { createPlayer } from './player.js';
import { createTruck } from './truck.js';
import { createExcavator, POUR_ANGLE } from './excavator.js';
import { createDumper } from './dumper.js';
import { createMouse } from './mouse.js';
import { preloadModels } from './glbModels.js';
import { preloadGround } from './groundMaterial.js';
import { preloadVegetation, createVegetation, createTrees } from './vegetation.js';
import { createWorldSounds } from './sounds.js';
import { createGroundView } from './groundChunks.js';
import { createHandTools } from './handTools.js';
import { createPlanner } from './planner.js';
import { createThumbnails } from './thumbnails.js';
import { createRain } from './rain.js';
import { groundWeather } from './groundMaterial.js';
import { currentWeather } from '../weather/index.js';
import { createHeadSway } from './headSway.js';
import { MAP, inRect } from './map.js';
import { createGuideBeacon } from './guideBeacon.js';
import { currentObjective } from '../progression/index.js';
import { contractsState } from '../contracts/index.js';
import { barrowFill } from '../handtools/index.js';
import { keyLabel } from '../input/index.js';
import { pileTotal } from '../quarry/index.js';
import {
  getStats, machinesAt, machineName, getMachine, JOBS, jobProgress, isDigger, bucketRadius, typeName, machinePrice,
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

export async function createWorld3D({ container, game, settings, audio = null, notify, onPointerLockLost, onUseOffice, onLoadProgress }) {
  const { data } = game;
  const siteId = game.state.currentSiteId;
  const home = MAP.home;
  const ground = game.ctx.ground;

  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  container.append(canvas);
  const { renderer, q } = createRenderer(canvas, settings.graphics);
  const [physics] = await Promise.all([createPhysics(), preloadModels({ onProgress: onLoadProgress }), preloadGround(renderer), preloadVegetation(renderer), preloadCountryside(renderer)]);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 5000);
  camera.rotation.order = 'YXZ';
  const frameRenderer = createFrameRenderer(renderer, scene, camera, q);

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
  for (const id of Object.keys(data.buildings)) places.setBuilding(id, ownsBuilding(game.ctx, id, siteId));
  buildFarms({ scene, physics, plan, heightAt });
  const particles = createParticles(scene);
  const rain = createRain(scene);
  let weatherGrip = 1; // (rain makes everything slippery)
  let rainFelt = 0;
  let weatherSettle = false;

  // ---- plants: grass around you, trees along hedges, roads and in copses
  const houseRects = [...plan.houses, plan.pub].map((h) => ({ x0: h.x - 8, x1: h.x + 8, z0: h.z - 8, z1: h.z + 8 }));
  const noGrowth = [
    [home.plot, 0.5], [home.yard, 1], [MAP.depot.yard, 1], [MAP.dealer.yard, 1],
    [{ x0: home.driveway.x0, x1: home.driveway.x1, z0: home.yard.z0 - 14, z1: home.yard.z0 }, 1],
    [{ x0: MAP.depot.driveway.x0, x1: MAP.depot.driveway.x1, z0: MAP.depot.yard.z1, z1: MAP.depot.yard.z1 + 10 }, 1],
    ...houseRects.map((r) => [r, 0]),
    ...plan.farms.map((f) => [farmClearRect(f), 0]),
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
  const parkingUsed = { spare: 0 };
  function parkingSpot(type) {
    if (type === 'pickup') return home.pickup;
    const list = home.parking[type] ?? [];
    const used = parkingUsed[type] ?? 0;
    if (used < list.length) {
      parkingUsed[type] = used + 1;
      return list[used];
    }
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
    if (!onPlot(x, z) && land.onRoad(x, z)) return weatherGrip < 1 ? { ...ASPHALT, grip: ASPHALT.grip * (0.5 + 0.5 * weatherGrip) } : ASPHALT;
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
    return { grip: (grip || 0.7) * weatherGrip, roll: roll || 0.035, name };
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
    // Site machines aren't road-legal: they stay on your land.
    const site = {
      allowedAt: onYourLand,
      onBlocked: () => {
        if (blockedNoteT > 0) return;
        blockedNoteT = 4;
        notify(`Site machines aren't road-legal: the ${typeName(data, machine.type).toLowerCase()} stays on your land`, 'warn');
      },
    };
    let v;
    if (isDigger(data, machine.type)) v = createExcavator({ ...args, ...site, canDigAt: (x, z) => ground?.workable(x, z) });
    else if (machine.type === 'dumper') v = createDumper({ ...args, ...site });
    else v = createTruck(args);
    vehicles.set(machine.id, v);
  }
  for (const m of machinesAt(game.ctx, siteId)) addVehicle(m);

  // Your shovel and wheelbarrow (the shovel is drawn in front of the camera).
  scene.add(camera);
  const hands = createHandTools({
    scene, camera, physics, terrain, game, home, player, particles, vehicles, audio, notify, saved: saved.barrow ?? null,
  });

  // ---- earthworks planner (on foot): plan a haul road, ramp or level area on your land
  const machineObstacles = () => {
    const list = [];
    for (const veh of vehicles.values()) {
      const p = veh.position();
      list.push({ x: p.x, z: p.z, r: veh.radius, label: machineName(data, getMachine(game.ctx, veh.machineId)) });
    }
    const b = hands.state;
    list.push({ x: b.x, z: b.z, r: 1.2, label: 'The wheelbarrow' });
    return list;
  };
  const planner = ground ? createPlanner({ scene, camera, game, heightAt, notify, obstacles: machineObstacles }) : null;

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
    look.pitch = v.digger ? -0.3 : -0.08;
    chasePos = null;
    if (v.digger) v.state.targetHouseYaw = v.state.houseYaw;
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
    const yaw = v.digger ? v.houseWorldYaw() : v.yaw();
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
    const u = v.unload();
    const bay = v.road ? places.bayAt(u.point.x, u.point.z) : null;
    if (bay) return { bay: bay.id, name: bay.name };
    const x = u.point.x + u.out.x * (v.road ? 1.2 : 1.4);
    const z = u.point.z + u.out.z * (v.road ? 1.2 : 1.4);
    if (ground?.workable(x, z)) return { x, z };
    return { reason: v.road ? 'Unload on your field, or in a bay at Ashby Aggregates' : 'Tip on your own field' };
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
      case 'works':
        if (!mouse.locked()) return true; // (only while you're playing)
        if (!planner) notify('There is no land of yours to build on here', 'warn');
        else if (v) notify('Get out of the machine to plan roads and ramps', 'warn');
        else if (hands.holding()) notify('Let go of the wheelbarrow first', 'warn');
        else if (planner.active) planner.cycleMode();
        else planner.toggle();
        return true;
      case 'camera':
        if (v) camMode = camMode === 'cab' ? 'chase' : 'cab';
        return true;
      case 'tip': {
        if (!v && hands.holding()) {
          hands.tip();
          return true;
        }
        if (!v?.carrier) return true;
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

  // What a digger's bucket is over: a carrier's bed, or the ground.
  const bedUnder = (t) => [...vehicles.values()].find((tr) => tr.carrier && tr.isOverBed(t)) ?? null;

  // Tracked machines with no physics vehicle (the dumper): W/S drive, A/D turn on the spot.
  function controlDumper(v, m, keys, d, sens, dt) {
    look.yaw = THREE.MathUtils.clamp(look.yaw - d.x * sens, -2.3, 2.3);
    look.pitch = THREE.MathUtils.clamp(look.pitch - d.y * sens, -1.2, 0.8);
    const idle = m.broken || !!m.job;
    v.drive(dt, idle ? 0 : (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0), idle ? 0 : (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0));
  }

  // Direct digger control. Mouse left/right swings; mouse forward/back works the stick; the
  // wheel raises and lowers the boom; the left button curls the bucket in and the right button
  // opens it (the arrow keys do boom and bucket too); W A S D drive the tracks. The teeth cut the
  // ground where they really are, as much as fits in the bucket, and the load runs out
  // where the tilted bucket really is: into a bed under it, or onto your ground as a heap.
  const directState = new Map(); // machineId -> { cutT, pourT, pour, cutting, note }
  let testInput = null; // automated play tests stand in for the mouse and keys
  let testKeys = new Set();
  function controlDirect(v, m, keys, d, sens, dt) {
    const st = directState.get(m.id) ?? { cutT: 0, pourT: 0, pour: 0, cutting: false, note: 0 };
    directState.set(m.id, st);
    look.pitch = -0.35;
    st.note = Math.max(0, st.note - dt);
    if (m.broken || m.job) {
      v.drive(dt, 0, 0);
      v.directInput({});
      v.directReport({});
      return;
    }
    v.swingBy(-d.x * sens);
    v.drive(dt, (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0), (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0));
    const wheel = mouse.takeWheel();
    v.directInput(testInput ?? {
      boom: (keys('boomUp') ? 1 : 0) - (keys('boomDown') ? 1 : 0),
      bucket: (mouse.isRightDown() || keys('bucketDump') ? 1 : 0) - (mouse.isDown() || keys('bucketCurl') ? 1 : 0),
      stickDelta: -d.y * sens * 1.2,
      boomDelta: THREE.MathUtils.clamp(-wheel / 100, -3, 3) * 0.1,
    });

    const s = v.directState();
    const stats = getStats(data, m);
    const full = pileTotal(m.load) > 0.01;
    const tp = new THREE.Vector3(s.teeth.x, s.teeth.y, s.teeth.z);
    // Teeth in the ground, moving: cut a little bowl, as much as still fits.
    st.cutT -= dt;
    if (!s.under) st.stuck = false;
    if (s.under && !full && s.moving) {
      if (st.cutT <= 0) {
        st.cutT = 0.07;
        const r = game.actions.bucketCut(m.id, { x: s.teeth.x, z: s.teeth.z, bottomY: s.teeth.y, radius: bucketRadius(stats) });
        st.cutting = r.ok && r.tonnes > 0;
        st.stuck = r.ok && r.tonnes === 0 && !r.full; // rock, or the edge of your land
        if (st.cutting) particles.spawn(tp, { count: 1, spread: 0.4, life: 1.2, up: 0.5 });
        if (!r.ok && st.note <= 0) {
          notify(r.reason, 'warn');
          st.note = 4;
        }
      }
    } else if (!s.under || !s.moving) st.cutting = false;
    // Bucket tilted open with a load in it: the load runs out (faster the further it's tipped).
    let pouring = 0;
    if (full && s.phi > POUR_ANGLE && !s.under) { // (in the ground, the earth holds it in)
      pouring = THREE.MathUtils.clamp((s.phi - POUR_ANGLE) / 0.9, 0, 1);
      st.pour += 1 - Math.exp(-2.2 * pouring * dt);
      st.pourT -= dt;
      if (st.pourT <= 0) {
        st.pourT = 0.1;
        const bed = bedUnder(tp);
        const spot = bed ? { machineId: bed.machineId } : ground?.workable(s.teeth.x, s.teeth.z) ? { x: s.teeth.x, z: s.teeth.z, radius: 0.5 } : null;
        if (spot) {
          const r = game.actions.dumpBucket(m.id, spot, Math.min(1, st.pour));
          if (r.ok) {
            st.pour = 0;
            particles.spawn(bed ? bed.bedWorld() : tp, { count: 3, spread: 0.8, life: 1.4 });
          } else if (st.note <= 0) {
            notify(r.reason, 'warn');
            st.note = 4;
          }
        } else if (st.note <= 0) {
          notify('Tip the bucket over your field or a truck', 'warn');
          st.note = 4;
        }
      }
    } else st.pour = 0;
    v.directReport({ cutting: st.cutting, pouring, stuck: st.stuck });
  }

  let digHintShown = false;
  function controlExcavator(v, m, keys, d, sens, clicked, dt) {
    const direct = settings.diggerControls === 'direct';
    v.setDirect(direct);
    if (direct) {
      controlDirect(v, m, keys, d, sens, dt);
      return;
    }
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
    game.events.on('worksBuilt', e => {
      const feet = player.feet();
      if (mode.kind === 'foot' && e.touchesChangedCell(feet)) {
        player.teleport(feet.x, heightAt(feet.x, feet.z) + 0.1, feet.z);
      }
    }),
    game.events.on('buildingBought', e => {
      if (e.siteId === siteId) places.setBuilding(e.buildingId, true);
    }),
    game.events.on('rockDug', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.digger && !e.direct) {
        const t = v.bucketTarget();
        t.y = heightAt(t.x, t.z);
        particles.spawn(t, { count: 8, spread: 1.2, life: 1.5, up: 0.6 });
      }
    }),
    game.events.on('rockHauled', (e) => {
      const v = vehicles.get(e.machineId);
      if (v?.carrier) particles.spawn(v.unload().point, { count: 20, spread: 2.5, life: 2.6, size: 1.6 });
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

  // ---- guidance: where the current goal wants you to go (a beam in the world, an arrow on the
  // HUD, a ring on the map). Worked out from what you're doing, so it points at the next thing.
  const beacon = createGuideBeacon(scene);
  const vehicleOf = (type) => [...vehicles.values()].find((x) => x.type === type) ?? null;
  const dominant = (load) => Object.entries(load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const onField = (p) => !!ground && ground.inside(p.x, p.z);
  function guideTarget() {
    const o = currentObjective(game.ctx);
    if (!o?.guide) return null;
    const v = current();
    const me = v ? v.position() : player.feet();
    const at = (x, z, label, near = 4) => ({ x, z, label, near });
    const onMachine = (veh, label) => (veh ? at(veh.position().x, veh.position().z, label, veh.radius + 1.5) : null);
    const wb = MAP.depot.weighbridge;
    const field = () => (onField(me) ? null : at(140, 14, 'Your field', 3));
    const barrow = () => { const b = hands.placement(); return at(b.x, b.z, 'The wheelbarrow', 2.5); };
    const office = (label) => {
      const d = places.officeDoor;
      const dl = places.dealerDoor;
      const near = Math.hypot(dl.x - me.x, dl.z - me.z) < Math.hypot(d.x - me.x, d.z - me.z) ? dl : d;
      return at(near.x, near.z, label, 3);
    };
    // A loaded road vehicle: the weighbridge, then the bay for what's on it.
    const depotFor = (veh) => {
      const m = getMachine(game.ctx, veh.machineId);
      if (!hasTicket(game.ctx, m.id)) return at((wb.x0 + wb.x1) / 2, (wb.z0 + wb.z1) / 2, 'Weighbridge', 6);
      const bayId = dominant(m.load);
      const bay = MAP.depot.bays.find((b) => b.id === bayId) ?? MAP.depot.bays.find((b) => b.id === data.depot.mixedProduct);
      return at((bay.x0 + bay.x1) / 2, (MAP.depot.bayZ.z0 + MAP.depot.bayZ.z1) / 2, `${data.depot.bays[bay.id].name} bay`, 5);
    };
    const affordable = (type) => game.state.money >= machinePrice(game.ctx, type, 'rusty');
    const loadedRoad = () => (v?.road && pileTotal(currentMachine().load) >= data.depot.minLoad ? v : null);
    switch (o.id) {
      case 'firstShovel': return field();
      case 'fillBarrow': return hands.holding() ? null : barrow();
      case 'loadPickup': {
        const pickup = vehicleOf('pickup');
        if (hands.holding() && barrowFill(game.ctx) > 0.3) return onMachine(pickup, 'Tip it into the pickup');
        return barrowFill(game.ctx) > 0.5 ? barrow() : (onField(me) ? barrow() : field());
      }
      case 'weighIn':
      case 'firstSale': {
        const road = loadedRoad();
        return road ? depotFor(road) : onMachine(vehicleOf('pickup'), 'Your pickup');
      }
      case 'firstMod': return office('Buy the springs (office laptop, or B)');
      case 'buyMiniDigger': return affordable('miniDigger') ? office('Buy the mini digger') : null;
      case 'buyTractor': return affordable('tractor') ? office('Buy the tractor') : null;
      case 'buyExcavator': return affordable('excavator') ? office('Buy the excavator') : null;
      case 'buyTruck': return affordable('truck') ? office('Buy the truck') : null;
      case 'usedMachine': return null;
      case 'buildWorks': return v ? null : field();
      case 'firstJob': return contractsState(game.ctx).active.length ? null : office('Take a job (office laptop: Jobs board)');
      case 'yardBuilding': return office('Yard buildings (office laptop: Plant dealer)');
      case 'goodName': return contractsState(game.ctx).active.length ? null : office('Take another job (office laptop)');
      case 'usedFleet': return office('Buy a Used machine');
      case 'firstScoop': return v?.type === 'miniDigger' ? field() : onMachine(vehicleOf('miniDigger'), 'Your mini digger');
      case 'sellTrailer':
      case 'sell': {
        const type = o.id === 'sell' ? 'truck' : 'tractor';
        const veh = vehicleOf(type);
        const m = veh && getMachine(game.ctx, veh.machineId);
        if (!m) return null;
        const full = pileTotal(m.load) >= (o.target ?? getStats(data, m).capacity * 0.5);
        if (!full) return v === veh ? field() : onMachine(veh, `Load the ${typeName(data, type).toLowerCase()}`);
        return v === veh ? depotFor(veh) : onMachine(veh, `Your ${typeName(data, type).toLowerCase()}`);
      }
      default: return null;
    }
  }
  let guide = null; // { x, y, z, label, near, dist } this frame
  const camFwd = new THREE.Vector3();
  function updateGuide(dt) {
    const g = guideTarget();
    const eye = camera.position;
    if (g) {
      const d = Math.hypot(g.x - eye.x, g.z - eye.z);
      guide = d > g.near ? { ...g, y: heightAt(g.x, g.z), dist: d } : null;
    } else guide = null;
    beacon.update(dt, guide, eye);
  }

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
    const baseYaw = v.digger ? v.houseWorldYaw() : v.yaw();
    if (camMode === 'cab') {
      // The seat moves with the cab (pitch and roll too); your head sways against the
      // machine's acceleration and picks up engine and ground vibration.
      const cabQ = v.digger ? v.model.house.getWorldQuaternion(tmpQ) : tmpQ.copy(v.quaternion());
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
    // Far enough to see the whole machine (and the tractor's trailer), close enough to read it.
    const dist = v.type === 'tractor' ? 10 : THREE.MathUtils.clamp(v.radius * 3.1, 5, 12);
    const desired = new THREE.Vector3(p.x - Math.cos(yaw) * dist, p.y + dist * 0.45 - look.pitch * 6, p.z + Math.sin(yaw) * dist);
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1.2);
    chasePos = chasePos ? chasePos.lerp(desired, Math.min(1, dt * 5)) : desired;
    camera.position.copy(chasePos);
    camera.lookAt(p.x, p.y + Math.min(1.8, v.radius * 0.6), p.z);
  }

  const resizeObserver = new ResizeObserver(() => {
    const r = container.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    frameRenderer.setSize(r.width, r.height);
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
    const petrol = (veh.type === 'pickup' ? 0.35 : 1) * Math.min(1, veh.radius / 2.6); // a petrol engine smokes far less; small engines make small clouds
    const puff = Math.min(1, veh.radius / 2.6);
    // A thick black cough when a cold diesel catches.
    if (f.engine === 'running' && st.prev === 'cranking') {
      particles.spawn(veh.exhaustWorld(), { count: 7, spread: 0.3 * puff, up: 1.8 * puff, life: 2.6, size: 0.9 * puff, color: 0x1c1b1a, opacity: (0.55 * worn + 0.15) * petrol });
    }
    st.prev = f.engine;
    if (running) {
      const load = f.load ?? f.work ?? 0;
      st.smoke += dt * (2.5 + (f.rpm ?? 1500) / 500 + load * 7) * petrol;
      smokeCol.copy(smokeClean).lerp(smokeDirty, Math.min(1, load * worn * 1.3 * petrol + (f.misfire ? 0.6 : 0)));
      while (st.smoke > 1) {
        st.smoke -= 1;
        particles.spawn(veh.exhaustWorld(), {
          count: 1, spread: 0.12 * puff, up: (1.5 + load) * puff, life: 1.4 + load * 1.2, size: (0.3 + load * 0.45) * puff,
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
        const r = veh.radius;
        const at = f.digging ? veh.teethWorld() : veh.model.root.localToWorld(new THREE.Vector3(-0.75 * r * Math.sign(veh.speed() || 1), 0.2, (Math.random() - 0.5) * r));
        particles.spawn(at, { count: 1, spread: 0.6, up: f.digging ? 0.8 : 0.3, life: 2, size: 1, color: 0xb7a07c, opacity: 0.28 });
      }
    }
  }

  function update(dt, { paused, keyboard }) {
    const keys = (a) => !paused && (testKeys.has(a) || keyboard.isHeld(a));
    const d = mouse.takeDelta();
    const clicked = mouse.takePressed();
    const rightPressed = mouse.takeRightPressed();
    const planning = !!planner?.active;
    const wheelNotch = planning ? mouse.takeWheel() : 0;
    const sens = MOUSE_SCALE * (settings.mouseSensitivity ?? 1);
    const dy = settings.invertY ? -d.y : d.y;
    const delta = paused ? { x: 0, y: 0 } : { x: d.x, y: dy };
    blockedNoteT = Math.max(0, blockedNoteT - dt);

    const v = current();
    const m = currentMachine();
    if (!v && hands.holding()) hands.controlHeld(paused ? 0 : dt, keys, delta, sens);
    else if (!v) controlFoot(keys, delta, sens);
    else if (v.road) controlTruck(v, m, keys, delta, sens);
    else if (v.digger) controlExcavator(v, m, keys, delta, sens, clicked && !paused, paused ? 0 : dt);
    else controlDumper(v, m, keys, delta, sens, paused ? 0 : dt);

    if (!paused) physics.step(dt);
    groundView?.update();
    if (planning && (v || hands.holding())) planner.cancel();
    // (while planning, the shovel is put away and the clicks belong to the planner)
    hands.update(paused ? 0 : dt, { onFoot: !v && !planner?.active, clicked: clicked && !paused && !planner?.active, paused });
    planner?.update(paused ? 0 : dt, { clicked: clicked && !paused, rightPressed: rightPressed && !paused, wheel: paused ? 0 : wheelNotch });
    if (!paused) updateWeighbridge(dt);

    // Sync machines with their game state.
    for (const veh of vehicles.values()) {
      const mm = getMachine(game.ctx, veh.machineId);
      if (!mm) continue;
      if (veh.carrier) {
        const cap = getStats(data, mm).capacity;
        const tonnes = pileTotal(mm.load);
        veh.setCargo(tonnes);
        veh.update(dt, { job: mm.job, fill: tonnes / cap, color: bedColor(mm.load), occupied: veh === v });
        if (veh !== v) {
          if (veh.road) {
            veh.control.throttle = 0;
            veh.control.handbrake = true;
          } else veh.drive(dt, 0, 0);
        }
      } else {
        if (veh !== v) {
          veh.drive(dt, 0, 0);
          veh.directInput({});
        }
        veh.update(dt, { job: mm.job, bucketFull: pileTotal(mm.load) > 0.01, bucketColor: bedColor(mm.load), occupied: veh === v });
      }
    }

    if (!paused) for (const veh of vehicles.values()) vehicleEffects(dt, veh);

    // Bucket target marker (in Direct control: a ring on the ground under the teeth).
    if (v?.digger && !m.job && v.isDirect()) {
      const s = v.directState();
      marker.visible = true;
      marker.position.set(s.teeth.x, s.ground + 0.08, s.teeth.z);
      marker.material.color.set(pileTotal(m.load) > 0.01 ? 0xf2b632 : 0x7ee07e);
    } else if (v?.digger && !m.job) {
      const t = v.bucketTarget();
      const bed = bedUnder(t);
      const full = pileTotal(m.load) > 0.01;
      const diggable = ground?.workable(t.x, t.z);
      marker.visible = true;
      marker.position.set(t.x, (bed ? bed.bedWorld().y : heightAt(t.x, t.z)) + 0.08, t.z);
      marker.material.color.set(full ? (bed ? 0x4fc3f7 : (diggable ? 0xf2b632 : 0x888888)) : (diggable ? 0x7ee07e : 0x888888));
    } else marker.visible = false;

    particles.update(dt);
    // The weather: sky, light and fog ease toward it; rain falls around you and wets the ground.
    const w = currentWeather(game.ctx);
    const settle = weatherSettle; // (debug: jump straight to the weather, for screenshots)
    weatherSettle = false;
    const felt = env.weather(paused ? 0 : settle ? 10 : dt, w);
    weatherGrip = w.grip;
    groundWeather.wet.value += ((felt.rain > 0.05 ? Math.min(1, felt.rain * 1.3) : 0) - groundWeather.wet.value) * (settle ? 1 : Math.min(1, dt * (felt.rain > 0.05 ? 0.08 : 0.02)));
    rain.update(paused ? 0 : dt, camera, felt.rain);
    rainFelt = paused ? 0 : felt.rain;
    const here = v ? v.position() : player.feet();
    vegetation.update(dt, here);
    trees.update(dt);
    placeCamera(dt);
    sounds?.update(dt, {
      rain: rainFelt,
      camera,
      vehicles,
      current: v,
      player: paused ? null : player,
      jobOf: (id) => getMachine(game.ctx, id)?.job ?? null,
      tierOf: (id) => getMachine(game.ctx, id)?.tier ?? 'rusty',
    });
    updateGuide(dt);
    env.follow(here);
    frameRenderer.render();
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
    const works = planner?.hud(key) ?? null;
    if (works) prompt = works.prompts;
    else if (!v) {
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
    } else if (v.digger && v.isDirect()) {
      const s = v.directState();
      if (pileTotal(m.load) > 0.01) {
        prompt = s.phi > POUR_ANGLE && !s.under ? { key: null, text: 'Emptying the bucket…' }
          : { key: 'RMB', text: 'Tilt the bucket over a truck or your field to empty it' };
      } else prompt = s.under ? { key: 'LMB', text: 'Curl the bucket in to fill it' }
        : { key: 'Wheel', text: 'Lower the boom, push the stick out, then curl the bucket in' };
    } else if (v.digger) {
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
    } else if (v.type === 'dumper' && pileTotal(m.load) >= data.depot.minLoad) {
      const spot = unloadSpot(v);
      prompt = spot.reason ? { key: null, text: spot.reason } : { key: key('tip'), text: 'Tip the skip here' };
    }

    let machine = null;
    if (m) {
      const stats = getStats(data, m);
      machine = {
        name: machineName(data, m),
        tier: m.tier,
        type: m.type,
        road: !!v.road,
        carrier: !!v.carrier,
        condition: m.condition,
        broken: m.broken,
        load: pileTotal(m.load),
        capacity: v.digger ? stats.bucketVolume * 1.6 : stats.capacity,
        direct: !!v.digger && v.isDirect(),
        speedKmh: Math.abs(v.speed()) * 3.6,
        camera: camMode,
        ticket: hasTicket(game.ctx, m.id),
      };
      const f = v.feel();
      machine.engine = f.engine; // off / cranking / running / idleOut / stopping / stall
      if (v.road) {
        machine.rpm = f.rpm;
        machine.maxRpm = { pickup: 4600, tractor: 2500 }[v.type] ?? 2600;
        machine.gear = f.shifting ? '–' : f.gear < 0 ? 'R' : String(f.gear);
      }
    }
    // Where the goal wants you: label, distance and bearing (radians, + = to your right).
    let guideInfo = null;
    if (guide) {
      camera.getWorldDirection(camFwd);
      const rel = Math.atan2(guide.x - camera.position.x, guide.z - camera.position.z) - Math.atan2(camFwd.x, camFwd.z);
      guideInfo = { label: guide.label, dist: guide.dist, bearing: -Math.atan2(Math.sin(rel), Math.cos(rel)) };
    }
    // Which set of control hints applies.
    const hintMode = works ? 'plan' : hands.holding() ? 'barrow' : !v ? 'foot' : v.digger ? (v.isDirect() ? 'digger-direct' : 'digger') : v.type;
    return { prompt, job, machine: machine ?? tool, mode: hintMode, locked: mouse.locked(), guide: guideInfo, works: works?.card ?? null };
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
    const yaw = v ? (v.digger ? v.houseWorldYaw() : v.yaw()) : player.look.yaw + Math.PI / 2;
    return {
      you: { x: p.x, z: p.z, yaw },
      vehicles: [...vehicles.values()].map((veh) => {
        const q2 = veh.position();
        return { id: veh.machineId, type: veh.type, x: q2.x, z: q2.z, yaw: veh.yaw(), current: veh === v };
      }),
      barrow: hands.placement(),
      guide: guideTarget(),
    };
  }

  // For automated play tests and the dev console.
  const debug = {
    settleWeather() { weatherSettle = true; },
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
      if (veh?.road) veh.reset(x, z, yaw);
      else if (veh?.tracked) Object.assign(veh.state, { x, z, yaw });
    },
    enterVehicle(id) {
      const veh = vehicles.get(id);
      if (veh) enter(veh);
    },
    exitVehicle: () => exit(),
    swing(dl) {
      if (current()?.digger) current().swingBy(dl);
    },
    setFootPitch(pitch) {
      player.look.pitch = pitch;
    },
    setFootYaw(yaw) {
      player.look.yaw = yaw;
    },
    // Look at a point on the ground (from where you stand).
    aimAt(x, z) {
      const e = player.eye();
      const dx = x - e.x;
      const dz = z - e.z;
      player.look.yaw = Math.atan2(-dx, -dz);
      player.look.pitch = Math.atan2(heightAt(x, z) - e.y, Math.hypot(dx, dz));
    },
    planner,
    feet: () => player.feet().toArray(),
    eye: () => camera.position.toArray(),
    setHouseYaw(yaw) {
      const veh = current();
      if (veh?.digger) Object.assign(veh.state, { houseYaw: yaw, targetHouseYaw: yaw });
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
    // Direct digger control without a mouse: { boom, stick, bucket } axes -1..1 (null: real input).
    setDirectInput: (i) => { testInput = i; },
    // Hold some actions down without a keyboard, e.g. ['forward', 'left'] ([]: real input only).
    setKeys: (list) => { testKeys = new Set(list); },
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
    // Product photos of the machines (for the laptop); dispose() the result when done.
    createProductPhotos: (opts) => createThumbnails(opts),
    destroy() {
      offs.forEach((off) => off());
      resizeObserver.disconnect();
      mouse.destroy();
      sounds?.destroy();
      groundView?.dispose();
      hands.destroy();
      beacon.destroy();
      for (const veh of vehicles.values()) veh.destroy();
      player.destroy();
      land.dispose();
      rain.dispose();
      frameRenderer.dispose();
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
    // (farm tracks meet the road through a gap in the hedge)
    ...plan.farms.map((f) => farmTrack(plan, f)).filter(Boolean).map((t) => [t.meets.x, t.meets.z, 9]),
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
  // and a few round each farm.
  for (const [i, f] of plan.farms.entries()) for (const [k, t] of farmTrees(f).entries()) singles.push([t.x, t.z, (i + k) % 2]); // (oaks and poplars)
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

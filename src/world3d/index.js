// The 3D world: the countryside map with your field, the village and the depot. Reads the
// game state, draws it, and turns walking, driving and digging into calls to the same game
// actions the rest of the game uses.
import * as THREE from 'three';
import { createPhysics } from './physics.js';
import { createRenderer, createEnvironment, createFrameRenderer } from './environment.js';
import { createCountryside, planWorld, preloadCountryside } from './countryside.js';
import { ownsBuilding, stockpileLoad, stockpileConfig } from '../buildings/index.js';
import { createYardStockpiles } from './stockpiles.js';
import { buildPlaces } from './places.js';
import { buildFarms, farmClearRect, farmWorkRect, farmTrees, farmTrack } from './farms.js';
import { createParticles } from './particles.js';
import { createPlayer } from './player.js';
import { createTruck } from './truck.js';
import { createParkedTrailer } from './trailer.js';
import { createExcavator, POUR_ANGLE } from './excavator.js';
import { createDumper } from './dumper.js';
import { createMouse } from './mouse.js';
import { preloadModels } from './glbModels.js';
import { preloadGround, groundWeather } from './groundMaterial.js';
import { preloadVegetation, createVegetation, createTrees } from './vegetation.js';
import { createWorldSounds } from './sounds.js';
import { createGroundView } from './groundChunks.js';
import { createHandTools } from './handTools.js';
import { createPlanner } from './planner.js';
import { createThumbnails } from './thumbnails.js';
import { createWorkLight } from './workLight.js';
import { createRain } from './rain.js';
import { workerFor } from '../staff/index.js';
import { visualHour } from '../core/visualClock.js';
import { currentWeather } from '../weather/index.js';
import { createHeadSway } from './headSway.js';
import { createFootCameraFeel } from './cameraFeel.js';
import { toolSwapBusy } from './toolSwap.js';
import { dominantMaterial, workFeedback } from './workTelemetry.js';
import { MAP, inRect } from './map.js';
import { createGuideBeacon } from './guideBeacon.js';
import { currentObjective } from '../progression/index.js';
import { entryModel } from '../progression/objectives.js';
import { contractsState } from '../contracts/index.js';
import { barrowFill } from '../handtools/index.js';
import { keyLabel } from '../input/index.js';
import { pileTotal } from '../quarry/index.js';
import { bucketFill, cuttingAttack } from '../machinery/digging.js';
import { loadCarrier, combinationStats, attachedTrailer, cargoVolume } from '../machinery/trailers.js';
import {
  getStats, machinesAt, machineName, getMachine, JOBS, jobProgress, isDigger, typeName, machinePrice,
} from '../machinery/index.js';
import { hasTicket, quoteDelivery } from '../economy/index.js';

const MOUSE_SCALE = 0.0022;
const ENTER_DISTANCE = 2.8;
const BARROW_GRAB = 1.5; // how close to the wheelbarrow's handles you must be to take it

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
  let yardStockpiles = null;
  const heightAt = (x, z) => Math.max(land.heightAt(x, z), yardStockpiles?.surfaceAt(x, z) ?? -Infinity);
  const onPlot = (x, z) => ground && ground.inside(x, z);
  let surveying = false;
  let surveyInfo = null;
  let roadNotice = null;
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
  yardStockpiles = createYardStockpiles({ scene, physics, game, map: MAP, siteId, heightAt: (x,z) => land.heightAt(x,z) });
  yardStockpiles.setOwned(ownsBuilding(game.ctx, 'stockpiles', siteId));
  buildFarms({ scene, physics, plan, heightAt });
  const particles = createParticles(scene);
  const rain = createRain(scene);
  const workLight = createWorkLight(scene);
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
    ...plan.farms.map(farmWorkRect).filter(Boolean).map((r) => [r, 0]),
  ];
  // (no tufts in the ruts of the farm tracks either)
  const farmTracks = plan.farms.map((f) => farmTrack(plan, f)).filter(Boolean).map((t) => t.points);
  const onFarmTrack = (x, z) => farmTracks.some((pts) => pts.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.z - z) < 3 && Math.hypot(p.x - x, p.z - z) < 2.6));
  const vegetation = createVegetation({
    scene,
    quality: settings.graphics,
    surfaceAt,
    blocked: (x, z) => noGrowth.some(([r, m]) => inRect(r, x, z, m)) || onFarmTrack(x, z),
  });
  const trees = createTrees({
    scene,
    quality: settings.graphics,
    plan: treePlan(plan),
    keepClear: (x, z) => land.onRoad(x, z, 2.5) || noGrowth.some(([r, m]) => inRect(r, x, z, m + 3)),
    groundHeight: heightAt,
  });

  const saved = game.state.positions ?? {};
  const cargoLoad = (m) => loadCarrier(game.ctx, m)?.load ?? {};
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
    if (onPlot(x,z)) {
      const i = Math.floor((x-ground.x0)/ground.cellSize), j = Math.floor((z-ground.z0)/ground.cellSize);
      if (!s.grass && !ground.cellBuilt(i,j)) {
        const r = ground.materialResponseAt(x,z);
        return { grip: r.traction, roll: r.rollingResistance, name: r.material };
      }
    }
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
  // (`fresh`: just back from hire, so it's parked in its spot, not where it was left)
  function addVehicle(machine, { fresh = false } = {}) {
    const spot = (!fresh && saved.machines?.[machine.id]) || parkingSpot(machine.type);
    const stats = () => combinationStats(game.ctx, getMachine(game.ctx, machine.id) ?? machine);
    const live = () => getMachine(game.ctx, machine.id);
    const args = { physics, scene, terrain, machine, spawn: spot, stats, live, liveTrailer: () => attachedTrailer(game.ctx, machine), surfaceAt: groundSurface };
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
    else if (machine.type === 'trailer') v = createParkedTrailer(args);
    else v = createTruck(args);
    vehicles.set(machine.id, v);
  }
  for (const m of machinesAt(game.ctx, siteId)) if (!m.away && !m.attachedTo) addVehicle(m); // (not one out on the road with a driver)
  game.ctx.machinePlacement = id => vehicles.get(id)?.placement();
  game.ctx.machineSpeed = id => vehicles.get(id)?.speed() ?? 0;

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
    if (v.towable) {
      notify('Drive a tractor nearby and hitch this trailer from Fleet', 'warn');
      return;
    }
    // (one of your staff is working it: they keep it until you give them another job)
    const op = workerFor(game.ctx, getMachine(game.ctx, v.machineId));
    if (op?.role) {
      notify(`${op.name} is working the ${typeName(data, v.type).toLowerCase()}: give them another job first (laptop: Staff)`, 'warn');
      return;
    }
    game.state.player.driving = v.machineId;
    if (game.state.player.navigationMachineId === v.machineId || getMachine(game.ctx, game.state.player.navigationMachineId)?.attachedTo === v.machineId) game.actions.navigateFleet?.(null);
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
      v.phys.cancelCruise?.();
      v.control.throttle = 0;
      v.control.brakePressed = false;
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
    game.state.player.driving = null;
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
    const store = yardStockpiles.bayAt(u.point.x, u.point.z);
    if (store) return { stockpileBay: store.id, name: stockpileConfig(game.ctx, store.id).name };
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
      case 'forward':
      case 'back':
      case 'jump':
        v?.phys?.cancelCruise?.();
        return false; // held input still controls ordinary pedals/jumping
      case 'cruise': {
        if (!v?.road) { notify('Cruise control is available in road vehicles', 'info'); return true; }
        const r = v.phys.toggleCruise();
        roadNotice = r.ok ? null : { machineId: m.id, text: r.reason, left: data.presentation.controlNoticeSeconds };
        return true;
      }
      case 'survey':
        surveying = !surveying;
        return true;
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
        if (v?.digger) {
          if (pileTotal(cargoLoad(m)) > 1e-6 && settings.diggerControls === 'assisted' && v.state.lastDump) {
            const destination = v.state.lastDump;
            const bed = destination.machineId ? vehicles.get(destination.machineId) : null;
            const point = bed?.bedWorld() ?? (destination.x != null ? destination : null);
            if (!point || !v.aimDump(point.x,point.z)) notify('Reposition the digger within reach of the last dump target', 'warn');
            else { v.state.repeatDump = {destination,height:bed?.bedWorld().y??null}; notify('Returning to the last dump target', 'good'); }
            return true;
          }
          if (toolSwapBusy(v, m)) { notify('Stop the machine and finish the current stroke before changing attachments', 'warn'); return true; }
          const choices = getStats(data, m).attachments ?? ['standard', 'trench', 'grading'];
          const attachment = choices[(Math.max(0, choices.indexOf(m.attachment ?? 'standard')) + 1) % choices.length];
          const r = game.actions.setDiggerAttachment(m.id, attachment);
          if (r.ok) notify(`Attachment: ${attachment}`, 'good');
          else report(r);
          return true;
        }
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
        else report(game.actions.tip(m.id, spot.stockpileBay ? { stockpileBay: spot.stockpileBay } : spot.bay ? { bay: spot.bay } : { x: spot.x, z: spot.z }));
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
        else if (!v) {
          const p = player.feet();
          let safe = null;
          for (const radius of [2.5, 4, 6, 8]) {
            for (let i = 0; i < 12 && !safe; i++) {
              const angle = i * Math.PI / 6;
              const x = p.x + Math.cos(angle) * radius, z = p.z + Math.sin(angle) * radius;
              const h = heightAt(x, z);
              const clear = [...vehicles.values()].every(veh => veh.position().distanceTo(new THREE.Vector3(x, h, z)) > veh.radius + 2);
              const flat = [[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz]) => Math.abs(heightAt(x+dx,z+dz)-h) < .25);
              if (clear && flat && onYourLand(x,z)) safe = { x,z,h };
            }
            if (safe) break;
          }
          if (safe) {
            hands.recoverAt(safe.x, safe.z, player.look.yaw);
            player.teleport(safe.x + 1.4, heightAt(safe.x + 1.4, safe.z) + .1, safe.z);
            notify('Wheelbarrow recovered with its load', 'good');
          } else notify('Walk to clear level ground before recovering the barrow', 'warn');
        }
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
    v.control.brakePressed = keys('back');
    v.control.handbrake = keys('jump') || m.broken || busy;
  }

  // What a digger's bucket is over: a carrier's bed, or the ground.
  const bedUnder = (t, raised = false) => [...vehicles.values()].find((tr) => tr.carrier && tr.isOverBed(t) && (!raised || t.y >= (tr.bedFloorWorldY?.() ?? tr.bedWorld().y))) ?? null;

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
    const precision = keys('precision') ? 0.3 : 1;
    const freeLook = keys('freeLook');
    if (freeLook) {
      look.yaw = THREE.MathUtils.clamp(look.yaw - d.x * sens, -2.3, 2.3);
      look.pitch = THREE.MathUtils.clamp(look.pitch - d.y * sens, -1.2, 0.8);
    }
    st.note = Math.max(0, st.note - dt);
    if (m.broken || m.job) {
      v.drive(dt, 0, 0);
      v.directInput({});
      v.directReport({});
      return;
    }
    v.swingBy((freeLook ? 0 : -d.x * sens * precision) + ((keys('slewLeft') ? 1 : 0) - (keys('slewRight') ? 1 : 0)) * dt * precision);
    v.drive(dt, (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0), (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0));
    const wheel = mouse.takeWheel();
    v.directInput(testInput ?? {
      boom: ((keys('boomUp') ? 1 : 0) - (keys('boomDown') ? 1 : 0)) * precision,
      stick: ((keys('stickOut') ? 1 : 0) - (keys('stickIn') ? 1 : 0)) * precision,
      bucket: ((mouse.isRightDown() || keys('bucketDump') ? 1 : 0) - (mouse.isDown() || keys('bucketCurl') ? 1 : 0)) * precision,
      stickDelta: freeLook ? 0 : -d.y * sens * 1.2 * precision,
      boomDelta: THREE.MathUtils.clamp(-wheel / 100, -3, 3) * 0.1 * precision,
    });

    const s = v.directState();
    const stats = getStats(data, m);
    const loaded = bucketFill(ground, stats, cargoLoad(m)).loaded;
    const tp = new THREE.Vector3(s.teeth.x, s.teeth.y, s.teeth.z);
    // Bucket tilted open with a load in it: the load runs out (faster the further it's tipped).
    let pouring = 0;
    if (dt > 0 && loaded && s.phi > POUR_ANGLE && !s.under) { // (in the ground, the earth holds it in)
      pouring = THREE.MathUtils.clamp((s.phi - POUR_ANGLE) / 0.9, 0, 1);
      const flow = Object.entries(cargoLoad(m)).reduce((sum,[id,tonnes]) => sum + tonnes * (data.ground.materials[id]?.flow ?? .7),0) / Math.max(.000001,pileTotal(cargoLoad(m)));
      st.pour += 1 - Math.exp(-2.2 * pouring * Math.max(.15,flow) * dt);
      st.pourT -= dt;
      if (st.pourT <= 0) {
        st.pourT = 0.1;
        const bed = bedUnder(tp, true);
        const store = yardStockpiles.bayAt(s.teeth.x, s.teeth.z);
        const spot = bed ? { machineId: bed.machineId } : store ? { stockpileBay: store.id } : ground?.workable(s.teeth.x, s.teeth.z) ? { x: s.teeth.x, z: s.teeth.z, radius: 0.5 } : null;
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
    st.pouring = pouring;
  }

  // Both control modes use the same real tooth trajectory. Bound terrain work to 14 Hz,
  // retaining the previous sample so cuts remain continuous at varying frame rates.
  const cuts = new Map();
  const traffic = new Map();
  function collectBucket(v, m, dt) {
    const s = v.directState();
    let c = cuts.get(m.id);
    if (!c) cuts.set(m.id, c = { from: s.teeth, time: 0 });
    c.time += dt;
    if (dt <= 0) return;
    const stats = getStats(data, m);
    const fill = bucketFill(ground, stats, cargoLoad(m));
    const enabled = (v === current() && v.isDirect()) || (m.job?.type === 'dig' && m.job.params.physical);
    if (!enabled || fill.full || !s.under) {
      c.from = s.teeth; c.time = 0; c.blocked = null;
      v.directReport({ pouring: directState.get(m.id)?.pouring ?? 0 });
      return;
    }
    if (c.time < 0.07) return;
    c.time = 0;
    const attack = cuttingAttack(c.from, s.teeth, v.houseWorldYaw(), s.phi);
    const distance = Math.hypot(s.teeth.x - c.from.x, s.teeth.y - c.from.y, s.teeth.z - c.from.z);
    const cutMaterial = onPlot(s.teeth.x,s.teeth.z) ? data.ground.materials[ground.surfaceAt(s.teeth.x,s.teeth.z)] : null;
    const r = attack > 0.05 && distance < 2 ? game.actions.bucketCut(m.id, { x: s.teeth.x, z: s.teeth.z, from: c.from, to: s.teeth, attack, moisture: groundWeather.wet.value,
      stockpileBay: yardStockpiles.bayAt(s.teeth.x, s.teeth.z)?.id }) : { ok: true, tonnes: 0 };
    c.from = s.teeth;
    const cutting = r.ok && r.tonnes > 0;
    c.blocked = r.blocked ?? null;
    v.directReport({ cutting, stuck: !!r.blocked, resistance: r.resistance ?? 0, pouring: directState.get(m.id)?.pouring ?? 0 });
    if (cutting) {
      particles.spawn(new THREE.Vector3(s.teeth.x,s.teeth.y,s.teeth.z), {count:2,spread:.3,life:.9,up:.35,size:.22,color:cutMaterial?.color??0xc8b08a,opacity:groundWeather.wet.value>.4?.25:.45});
    }
  }

  let digHintShown = false;
  function controlExcavator(v, m, keys, d, sens, clicked, dt) {
    const direct = settings.diggerControls === 'direct';
    v.setDirect(direct);
    if (direct) {
      controlDirect(v, m, keys, d, sens, dt);
      return;
    }
    const freeLook = keys('freeLook');
    if (freeLook) look.yaw = THREE.MathUtils.clamp(look.yaw - d.x * sens, -2.3, 2.3);
    look.pitch = THREE.MathUtils.clamp(look.pitch - (freeLook ? d.y : 0) * sens, -1.2, 0.6);
    const working = !!m.job || v.busy();
    if (!working && v.state.repeatDump && Math.abs(v.state.targetHouseYaw-v.state.houseYaw)<.06 && dt>0) {
      const remembered=v.state.repeatDump; v.state.repeatDump=null;
      v.startDump(remembered.height,remembered.destination);
      return;
    }
    if (!m.broken && !working) {
      const precision = keys('precision') ? 0.3 : 1;
      if (!v.state.repeatDump) v.swingBy((freeLook ? 0 : -d.x * sens * precision) + ((keys('slewLeft') ? 1 : 0) - (keys('slewRight') ? 1 : 0)) * dt * precision);
      const wheel = mouse.takeWheel();
      if (dt > 0) v.adjustAim(-wheel / 100 * (keys('precision') ? 0.05 : 0.2), keys('precision'));
      const move = (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
      const turn = (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0);
      v.drive(dt, move, turn);
    } else v.drive(dt, 0, 0);
    if (m.broken || working || dt <= 0) return;

    const target = v.bucketTarget();
    const full = pileTotal(cargoLoad(m)) > 0.01;
    const store = yardStockpiles.bayAt(target.x, target.z);
    if (!full && mouse.isDown()) {
      if (store || ground?.workable(target.x, target.z)) {
        const r = game.actions.scoop(m.id, { x: target.x, z: target.z, stockpileBay: store?.id, physical: true, depth: v.state.cutDepth, groundY: heightAt(target.x, target.z) });
        if (!r.ok && clicked) notify(r.reason, 'warn');
      } else if (clicked && !digHintShown) {
        notify('Swing the bucket over your field to dig', 'warn');
        digHintShown = true;
      }
    } else if (full && clicked) {
      const bed = bedUnder(target);
      const destination = { x:target.x,z:target.z,...(bed ? { machineId: bed.machineId } : store ? { stockpileBay: store.id } : {}) };
      if (!bed && !store && !ground?.workable(target.x, target.z)) notify('Swing over your field or a truck to dump', 'warn');
      else v.startDump(bed ? bed.bedWorld().y : null, destination);
    }
  }

  // ---- the weighbridge: a loaded road vehicle standing on it is weighed in
  const weigh = new Map(); // machineId -> seconds on the bridge
  const onHomeBridge = (x,z) => ownsBuilding(game.ctx, 'weighbridge', siteId) && inRect(MAP.home.weighbridge,x,z,0.3);
  function updateWeighbridge(dt) {
    let busy = false;
    for (const v of vehicles.values()) {
      if (!v.road) continue;
      const m = getMachine(game.ctx, v.machineId);
      const p = v.position();
      const homeBridge = onHomeBridge(p.x, p.z);
      const on = homeBridge || places.onWeighbridge(p.x, p.z);
      if (!on || !m || pileTotal(cargoLoad(m)) < data.depot.minLoad || hasTicket(game.ctx, m.id) || Math.abs(v.speed()) > 0.4) {
        weigh.delete(v.machineId);
        continue;
      }
      busy = true;
      const t = (weigh.get(v.machineId) ?? 0) + dt;
      weigh.set(v.machineId, t);
      if (t >= data.depot.weighSeconds) {
        weigh.delete(v.machineId);
        const r = game.actions.weighIn(m.id, { home: homeBridge });
        if (r.ok) {
          const mix = Object.entries(cargoLoad(m)).sort((a, b) => b[1] - a[1])
            .map(([id, tt]) => `${data.materials[id]?.name.toLowerCase() ?? id} ${Math.round((tt / r.tonnes) * 100)}%`).join(', ');
          const quote = r.quote ? ` ${data.depot.bays[r.quote.bay].name}: ${r.quote.grade}, current quote $${r.quote.gross.toFixed(2)}. Drive straight to the depot bays (T).` : ' Unload in the right bay (T).';
          notify(`Weighed in: ${r.tonnes.toFixed(2)} t (${mix}).${quote}`, 'good');
          sounds?.play('chime', { gain: 0.4 });
        }
      }
    }
    places.setLight(!busy);
  }

  // ---- game events -> effects ----
  function rebuildTow(e, detached = false) {
    const tractor = vehicles.get(e.machineId);
    const parked = vehicles.get(e.trailerId);
    const wasDriving = current() === tractor;
    const at = tractor?.placement();
    const trailerAt = tractor?.trailerPlacement?.() ?? parked?.placement() ?? at;
    if (wasDriving) exit();
    if (tractor) { tractor.destroy(); vehicles.delete(e.machineId); }
    if (parked) { parked.destroy(); vehicles.delete(e.trailerId); }
    saved.machines ??= {};
    if (at) saved.machines[e.machineId] = at;
    if (trailerAt) saved.machines[e.trailerId] = trailerAt;
    const tow = getMachine(game.ctx, e.machineId);
    if (tow) addVehicle(tow);
    if (detached) {
      const trailer = getMachine(game.ctx, e.trailerId);
      if (trailer) addVehicle(trailer);
    }
    if (wasDriving && vehicles.has(e.machineId)) enter(vehicles.get(e.machineId));
  }
  const offs = [
    game.events.on('trailerAttached', e => rebuildTow(e)),
    game.events.on('trailerDetached', e => rebuildTow(e, true)),
    game.events.on('worksBuilt', () => {
      const feet = player.feet();
      // Grading, heap sourcing and spare spoil can all change the ground underfoot.
      if (mode.kind === 'foot') {
        player.teleport(feet.x, heightAt(feet.x, feet.z) + 0.1, feet.z);
      }
    }),
    game.events.on('buildingBought', e => {
      if (e.siteId === siteId) { places.setBuilding(e.buildingId, true); if(e.buildingId === 'stockpiles') yardStockpiles.setOwned(true); }
    }),
    game.events.on('stockpileChanged', e => { if(e.siteId === siteId) yardStockpiles.refresh(); }),
    game.events.on('jobFailed', e => notify(e.reason, 'warn')),
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
      if (v?.carrier && v.unload) particles.spawn(v.unload().point, { count: 20, spread: 2.5, life: 2.6, size: 1.6 });
    }),
    game.events.on('productSold', (e) => places.delivered(e.bayId, e.tonnes)),
    game.events.on('machineBought', (e) => {
      const m = getMachine(game.ctx, e.machineId);
      if (m && m.siteId === siteId) addVehicle(m);
    }),
    ...['machineSold', 'machineHiredOut', 'staffTripOut'].map((type) => game.events.on(type, (e) => {
      const v = vehicles.get(e.machineId);
      if (!v) return;
      if (current() === v) exit();
      v.destroy();
      vehicles.delete(e.machineId);
    })),
    // Staff at work: a driver's vehicle comes back from the depot; an operator's digger swings to
    // where it digs or dumps (the dig itself animates from the job, like yours).
    game.events.on('staffTripBack', (e) => {
      const m = getMachine(game.ctx, e.machineId);
      if (m && m.siteId === siteId && !vehicles.has(m.id)) addVehicle(m, { fresh: true });
    }),
    game.events.on('operatorAim', (e) => {
      const veh = vehicles.get(e.machineId);
      if (!veh?.digger) return;
      const p = veh.position();
      const want = Math.atan2(-(e.z - p.z), e.x - p.x) - veh.yaw();
      const s = veh.state;
      s.operatorReach = Math.hypot(e.x-p.x,e.z-p.z);
      s.targetHouseYaw = s.houseYaw + Math.atan2(Math.sin(want - s.houseYaw), Math.cos(want - s.houseYaw));
    }),
    game.events.on('operatorDump', (e) => vehicles.get(e.machineId)?.startDump?.(e.intoMachineId ? vehicles.get(e.intoMachineId)?.bedWorld().y ?? heightAt(e.x,e.z) : heightAt(e.x, e.z))),
    game.events.on('machineReturned', (e) => {
      const m = getMachine(game.ctx, e.machineId);
      if (m && m.siteId === siteId && !vehicles.has(m.id)) addVehicle(m, { fresh: true });
    }),
  ];

  // ---- guidance: where the current goal wants you to go (a beam in the world, an arrow on the
  // HUD, a ring on the map). Worked out from what you're doing, so it points at the next thing.
  const beacon = createGuideBeacon(scene);
  const vehicleOf = (type) => [...vehicles.values()].find((x) => x.type === type) ?? null;
  const dominant = (load) => Object.entries(load).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const onField = (p) => !!ground && ground.inside(p.x, p.z);
  function guideTarget() {
    const navigation = getMachine(game.ctx, game.state.player.navigationMachineId);
    if (navigation) {
      const target = vehicles.get(navigation.attachedTo ?? navigation.id);
      if (target) { const p = target.position(); return { x:p.x,z:p.z,label:machineName(data,navigation),near:target.radius+1.5 }; }
    }
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
      const bayId = dominant(cargoLoad(m));
      const bay = MAP.depot.bays.find((b) => b.id === bayId) ?? MAP.depot.bays.find((b) => b.id === data.depot.mixedProduct);
      return at((bay.x0 + bay.x1) / 2, (MAP.depot.bayZ.z0 + MAP.depot.bayZ.z1) / 2, `${data.depot.bays[bay.id].name} bay`, 5);
    };
    const affordable = (type) => game.state.money >= machinePrice(game.ctx, type, entryModel(data,type)) + (type === 'tractor' ? machinePrice(game.ctx,'trailer',entryModel(data,'trailer')) : 0);
    const loadedRoad = () => (v?.road && pileTotal(cargoLoad(currentMachine())) >= data.depot.minLoad ? v : null);
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
        const full = pileTotal(cargoLoad(m)) >= (o.target ?? getStats(data, m).capacity * 0.5);
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

  const surveyMarker=new THREE.Mesh(new THREE.RingGeometry(data.presentation.survey.markerRadius*.8,data.presentation.survey.markerRadius,32),
    new THREE.MeshBasicMaterial({color:0xf2b632,transparent:true,opacity:.9,depthWrite:false}));
  surveyMarker.rotation.x=-Math.PI/2;surveyMarker.visible=false;scene.add(surveyMarker);
  const surveyDirection=new THREE.Vector3();
  function updateSurvey() {
    surveyMarker.visible=false;surveyInfo=null;
    if (!surveying) return;
    const key=keyLabel(settings.bindings.survey);
    surveyInfo={key,empty:true,reason:'Aim at the ground on your field'};
    const v=current();
    let point;
    if (v?.digger) point=v.isDirect()?v.teethWorld():v.bucketTarget();
    else {
      // Stop at the first actual collider, so the survey cannot see through plant or buildings.
      camera.getWorldDirection(surveyDirection);
      const hit=physics.world.castRay(new physics.RAPIER.Ray(camera.position,surveyDirection),data.presentation.survey.range,true,
        undefined,undefined,player.collider);
      if(hit) point=camera.position.clone().addScaledVector(surveyDirection,hit.timeOfImpact);
      if(point&&Math.abs(point.y-heightAt(point.x,point.z))>.35) point=null;
    }
    const column=point&&ground?.inspectAt(point.x,point.z);
    if (!column) return;
    const coverId=column.surface.coverMaterial,material=data.ground.materials[coverId];
    const name=material?.name??coverId;
    const substrate=data.ground.materials[column.surface.material]?.name??column.surface.material;
    surveyInfo={key,surface:{...column.surface,id:coverId,name:coverId!==column.surface.material?`${name} over ${substrate}`:name,color:material?.color},
      layers:column.layers.map(l=>({...l,id:l.material,name:data.ground.materials[l.material]?.name??l.material})),
      bedrockDepth:column.bedrockDepth,bedrockName:data.ground.materials[column.bedrock]?.name??column.bedrock};
    surveyMarker.position.set(point.x,heightAt(point.x,point.z)+.035,point.z);
    surveyMarker.material.color.set(material?.color??0xf2b632);surveyMarker.visible=true;
  }

  // ---- camera ----
  const tmpQ = new THREE.Quaternion();
  const lookQ = new THREE.Quaternion();
  const lookE = new THREE.Euler();
  const chaseBounds = new THREE.Box3();
  const chaseSphere = new THREE.Sphere();
  const head = createHeadSway();
  const footFeel = createFootCameraFeel();

  function placeCamera(dt) {
    const v = current();
    const motionScale=THREE.MathUtils.clamp(settings.cameraMotion??1,0,1);
    let fov=THREE.MathUtils.clamp(settings.fieldOfView??72,50,95);
    const footMotion=!v ? footFeel.update(dt,player.motion?.()??{},motionScale) : null;
    if (footMotion) fov+=footMotion.fov;
    else footFeel.reset();
    if (Math.abs(camera.fov-fov)>.005) {camera.fov=fov;camera.updateProjectionMatrix();}
    for (const veh of vehicles.values()) veh.model.setFirstPerson?.(veh === v && camMode === 'cab');
    if (!v) {
      head.reset();
      camera.position.copy(player.eye());
      camera.position.y+=footMotion.height;
      camera.rotation.set(player.look.pitch, player.look.yaw, footMotion.roll);
      return;
    }
    const baseYaw = v.digger ? v.houseWorldYaw() : v.yaw();
    if (camMode === 'cab') {
      // The seat moves with the cab (pitch and roll too); your head sways against the
      // machine's acceleration and picks up engine and ground vibration.
      const cabQ = v.digger ? v.model.house.getWorldQuaternion(tmpQ) : tmpQ.copy(v.quaternion());
      const sway = head.update(dt, v, cabQ);
      camera.position.copy(v.seatWorld()).addScaledVector(sway.offset,motionScale);
      lookQ.setFromEuler(lookE.set(look.pitch + sway.pitch*motionScale, -Math.PI / 2 + look.yaw, sway.roll*motionScale, 'YXZ'));
      camera.quaternion.copy(cabQ).multiply(lookQ);
      return;
    }
    head.reset();
    // Chase camera behind the machine, orbiting with the mouse.
    const yaw = baseYaw + look.yaw;
    // Fit the actual rig, including the attached trailer and current arm or tipped bed.
    // The quad can stay close; a large trailer or an extended boom gets enough room.
    chaseBounds.setFromObject(v.model.root);
    if (v.trailer) chaseBounds.union(new THREE.Box3().setFromObject(v.trailer.model.root));
    chaseBounds.getBoundingSphere(chaseSphere);
    const p = chaseSphere.center;
    const halfFov = Math.min(THREE.MathUtils.degToRad(camera.fov / 2), Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    const dist = Math.max(2.8, chaseSphere.radius / Math.sin(halfFov) * 1.08);
    const desired = new THREE.Vector3(p.x - Math.cos(yaw) * dist, p.y + dist * 0.45 - look.pitch * 6, p.z + Math.sin(yaw) * dist);
    desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1.2);
    chasePos = chasePos ? chasePos.lerp(desired, Math.min(1, dt * 5)) : desired;
    camera.position.copy(chasePos);
    camera.lookAt(p);
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
    if (veh.towable) return;
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
    // (wet ground doesn't raise dust: the wheels throw up low, dark spray instead)
    const wet = groundWeather.wet.value;
    if (veh.road) {
      const speed = Math.abs(f.speed);
      const dusty = DUSTY[f.surface] ?? 0.8;
      st.dust += dt * dusty * (Math.max(0, speed - 1.5) * 1.3 + f.slip * 10);
      while (st.dust > 1) {
        st.dust -= 1;
        st.side = -st.side;
        const at = veh.tailgateWorld().add(new THREE.Vector3(0, -0.5, st.side * 0.8));
        if (Math.random() < wet) {
          particles.spawn(at, { count: 2, spread: 0.4, up: 0.25, life: 0.7, size: 0.35 + speed * 0.02, color: 0x3e3326, opacity: 0.4 * Math.min(1, dusty) });
        } else {
          particles.spawn(at, {
            count: 1, spread: 0.5, up: 0.45, life: 2.4, size: 1.1 + speed * 0.09,
            color: 0xb7a07c, opacity: Math.min(0.4, 0.14 + speed * 0.012) * Math.min(1, dusty),
          });
        }
      }
    } else {
      st.dust += dt * ((f.digging ? 9 : 0) + f.travel * 5) * (1 - 0.8 * wet);
      while (st.dust > 1) {
        st.dust -= 1;
        const r = veh.radius;
        const at = f.digging ? veh.teethWorld() : veh.model.root.localToWorld(new THREE.Vector3(-0.75 * r * Math.sign(veh.speed() || 1), 0.2, (Math.random() - 0.5) * r));
        particles.spawn(at, { count: 1, spread: 0.6, up: f.digging ? 0.8 : 0.3, life: 2, size: 1, color: wet > 0.5 ? 0x6a5a46 : 0xb7a07c, opacity: 0.28 * (1 - 0.5 * wet) });
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
    if (roadNotice && !paused) roadNotice.left = Math.max(0, roadNotice.left - dt);

    const v = current();
    const m = currentMachine();
    if (!paused) ground?.setMoisture(groundWeather.wet.value);
    if (!v && hands.holding()) hands.controlHeld(paused ? 0 : dt, keys, delta, sens);
    else if (!v) controlFoot(keys, delta, sens);
    else if (v.road) controlTruck(v, m, keys, delta, sens);
    else if (v.digger) controlExcavator(v, m, keys, delta, sens * (settings.diggerSensitivity ?? 1), clicked && !paused, paused ? 0 : dt);
    else controlDumper(v, m, keys, delta, sens, paused ? 0 : dt);

    if (!paused) physics.step(dt);
    groundView?.update();
    if (planning && (v || hands.holding())) planner.cancel();
    // (while planning, the shovel is put away and the clicks belong to the planner)
    hands.update(paused ? 0 : dt, { onFoot: !v && !planner?.active, clicked: clicked && !paused && !planner?.active, paused, repeat: !!settings.repeatShovel && mouse.isDown() });
    planner?.update(paused ? 0 : dt, { clicked: clicked && !paused, rightPressed: rightPressed && !paused, wheel: paused ? 0 : wheelNotch });
    if (!paused) updateWeighbridge(dt);

    // Sync machines with their game state.
    for (const veh of vehicles.values()) {
      const mm = getMachine(game.ctx, veh.machineId);
      if (!mm) continue;
      if (!paused && onPlot(veh.position().x, veh.position().z)) {
        let t = traffic.get(mm.id);
        const p = veh.position();
        if (!t) traffic.set(mm.id, t = { x: p.x, z: p.z, time: 0 });
        t.time += dt;
        const distance = Math.hypot(p.x - t.x, p.z - t.z);
        if (t.time >= 0.25 && distance >= 0.5) {
          const physical = combinationStats(game.ctx,mm);
          ground.applyTraffic({ x: p.x, z: p.z, heading: -veh.yaw(), width: veh.radius * 0.7, weight: ((physical.mass ?? 2000) + (physical.trailerMass ?? 0)) / 1000 + pileTotal(cargoLoad(mm)), distance: Math.min(distance, 2), moisture: groundWeather.wet.value, slip: veh.feel().slip ?? 0 });
          Object.assign(t, { x: p.x, z: p.z, time: 0 });
        }
      }
      if (veh.carrier || veh.road || veh.towable) {
        const cap = combinationStats(game.ctx, mm).capacity;
        const tonnes = pileTotal(cargoLoad(mm));
        veh.setCargo(tonnes);
        veh.update(paused ? 0 : dt, { job: mm.job, fill: cap > 0 ? tonnes / cap : 0, color: bedColor(cargoLoad(mm)), occupied: veh === v });
        if (veh !== v) {
          if (veh.road) {
            veh.phys.cancelCruise?.();
            veh.control.throttle = 0;
            veh.control.brakePressed = false;
            veh.control.handbrake = true;
          } else veh.drive?.(dt, 0, 0);
        }
      } else {
        if (veh !== v) {
          veh.drive(dt, 0, 0);
          veh.directInput({});
        }
        const fill = bucketFill(ground, getStats(data, mm), cargoLoad(mm));
        veh.update(paused ? 0 : dt, { job: mm.job, bucketFull: fill.full, bucketLoaded: fill.loaded, bucketFraction:fill.fraction, bucketColor: bedColor(cargoLoad(mm)), occupied: veh === v });
        collectBucket(veh, mm, paused ? 0 : dt);
        const destination = paused ? null : veh.takeDumpTarget();
        if (destination) {
          const teeth = veh.teethWorld();
          const bed = bedUnder(teeth,true);
          const store = yardStockpiles.bayAt(teeth.x,teeth.z);
          const actual = bed ? { machineId:bed.machineId } : store ? { stockpileBay:store.id } : {x:teeth.x,z:teeth.z};
          const r = game.actions.dumpBucket(mm.id, actual);
          if (!r.ok && veh === v) notify(r.reason, 'warn');
        }
      }
    }

    if (!paused) for (const veh of vehicles.values()) vehicleEffects(dt, veh);

    // Bucket target marker (in Direct control: a ring on the ground under the teeth).
    if (v?.digger && !m.job && v.isDirect()) {
      const s = v.directState();
      marker.visible = true;
      marker.position.set(s.teeth.x, s.ground + 0.08, s.teeth.z);
      marker.material.color.set(bucketFill(ground,getStats(data,m),cargoLoad(m)).full ? 0xf2b632 : 0x7ee07e);
    } else if (v?.digger && !m.job) {
      const t = v.bucketTarget();
      const bed = bedUnder(t);
      const full = pileTotal(cargoLoad(m)) > 0.01;
      const store = yardStockpiles.bayAt(t.x, t.z);
      const diggable = !!store || ground?.workable(t.x, t.z);
      marker.visible = true;
      marker.position.set(t.x, (bed ? bed.bedWorld().y : heightAt(t.x, t.z)) + 0.08, t.z);
      marker.material.color.set(full ? (bed ? 0x4fc3f7 : (diggable ? 0xf2b632 : 0x888888)) : (diggable ? 0x7ee07e : 0x888888));
    } else marker.visible = false;

    particles.update(dt);
    // The weather: sky, light and fog ease toward it; rain falls around you and wets the ground.
    const w = currentWeather(game.ctx);
    const settle = weatherSettle; // (debug: jump straight to the weather, for screenshots)
    weatherSettle = false;
    const felt = env.weather(paused ? 0 : settle ? 10 : dt, w, visualHour(game.state, data));
    weatherGrip = w.grip;
    groundWeather.wet.value += ((felt.rain > 0.05 ? Math.min(1, felt.rain * 1.3) : 0) - groundWeather.wet.value) * (settle ? 1 : Math.min(1, dt * (felt.rain > 0.05 ? 0.08 : 0.02)));
    rain.update(paused ? 0 : dt, camera, felt.rain);
    rainFelt = paused ? 0 : felt.rain;
    const here = v ? v.position() : player.feet();
    vegetation.update(dt, here);
    trees.update(dt);
    placeCamera(paused ? 0 : dt);
    updateSurvey();
    workLight.update(camera, env.lighting().night);
    sounds?.update(dt, {
      rain: rainFelt,
      night: env.lighting().night,
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
      const fill = bucketFill(ground,getStats(data,m),cargoLoad(m));
      if (!fill.full && s.under) prompt = { key:'LMB',text:`Curl and pull inward to fill the bucket (${Math.round(fill.fraction*100)}%)` };
      else if (fill.loaded) {
        prompt = s.phi > POUR_ANGLE && !s.under ? { key: null, text: 'Emptying the bucket…' }
          : { key: 'RMB', text: 'Tilt the bucket over a truck or your field to empty it' };
      } else prompt = { key: 'Wheel', text: 'Lower the boom, push the stick out, then curl and pull in' };
    } else if (v.digger) {
      const t = v.bucketTarget();
      const full = pileTotal(cargoLoad(m)) > 0.01;
      const bed = bedUnder(t);
      const store = yardStockpiles.bayAt(t.x, t.z);
      const diggable = !!store || ground?.workable(t.x, t.z);
      if (m.attachment === 'breaker' && diggable) {
        const face = ground.materialResponseAt(t.x, t.z);
        prompt = !store && face.material === 'rock' && !face.loose
          ? { key: 'Hold LMB', text: 'Break exposed rock into rubble' }
          : { key: 'T', text: 'Use a bucket to remove soil or collect rubble' };
      } else if (!full) {
        prompt = diggable
          ? { key: 'Hold LMB', text: store ? `Load from ${stockpileConfig(game.ctx, store.id).name}` : `Dig ${(data.ground.materials[ground.surfaceAt(t.x, t.z)]?.name ?? '').toLowerCase()}` }
          : { key: null, text: 'Swing the bucket over your field to dig' };
      } else if (bed) prompt = { key: 'LMB', text: `Dump into ${machineName(data, getMachine(game.ctx, bed.machineId))}` };
      else if (diggable) prompt = { key: 'LMB', text: 'Dump here' };
      else prompt = { key: null, text: 'Swing over your field or a truck to dump' };
    } else if (v.road) {
      const loaded = pileTotal(cargoLoad(m)) >= data.depot.minLoad;
      const p = v.position();
      if (loaded) {
        const spot = unloadSpot(v);
        if (spot.stockpileBay) {
          const total = pileTotal(stockpileLoad(game.ctx, spot.stockpileBay));
          const cfg = stockpileConfig(game.ctx, spot.stockpileBay);
          prompt = { key: key('tip'), text: `Store in ${cfg.name}: ${total.toFixed(1)} / ${cfg.capacity} t` };
        } else if (spot.bay) {
          if (!hasTicket(game.ctx, m.id)) prompt = { key: null, text: 'Weigh in on the weighbridge first' };
          else {
            const qd = quoteDelivery(game.ctx, spot.bay, cargoLoad(m));
            prompt = { key: key('tip'), text: `Unload in the ${spot.name} bay: ${qd.grade}, $${qd.perTonne.toFixed(2)}/t` };
          }
        } else if (onHomeBridge(p.x, p.z) || places.onWeighbridge(p.x, p.z)) {
          prompt = { key: null, text: hasTicket(game.ctx, m.id) ? 'Weighed in: drive on to the depot bays' : 'Stop here to weigh in…' };
        } else if (spot.x !== undefined) {
          prompt = { key: key('tip'), text: v.type === 'pickup' ? 'Shovel it off here' : 'Tip here' };
        } else if (inRect(MAP.depot.yard, p.x, p.z, 10)) {
          prompt = { key: null, text: hasTicket(game.ctx, m.id) ? 'Back up into the right bay to unload' : 'Weigh in on the weighbridge at the gate' };
        } else {
          prompt = { key: null, text: `Take it to ${MAP.depot.name} to sell (Tab: map)` };
        }
      }
    } else if (v.type === 'dumper' && pileTotal(cargoLoad(m)) >= data.depot.minLoad) {
      const spot = unloadSpot(v);
      prompt = spot.reason ? { key: null, text: spot.reason } : { key: key('tip'), text: spot.stockpileBay ? `Store in ${spot.name}` : 'Tip the skip here' };
    }

    let machine = null;
    if (m) {
      const stats = combinationStats(game.ctx, m);
      machine = {
        name: machineName(data, m),
        tier: m.tier,
        type: m.type,
        road: !!v.road,
        carrier: !!v.carrier,
        condition: m.condition,
        broken: m.broken,
        load: pileTotal(cargoLoad(m)),
        capacity: v.digger ? stats.bucketVolume : stats.capacity,
        bucketVolume: v.digger ? ground.looseVolume(cargoLoad(m)) : null,
        cutDepth: v.digger ? v.state.cutDepth : null,
        aimReach: v.digger ? v.state.aimReach : null,
        resistance: v.digger ? v.state.resistance : null,
        direct: !!v.digger && v.isDirect(),
        attachmentBusy: !!v.digger && toolSwapBusy(v, m),
        speedKmh: Math.abs(v.speed()) * 3.6,
        camera: camMode,
        ticket: hasTicket(game.ctx, m.id),
      };
      const f = v.feel();
      const load=cargoLoad(m),volume=cargoVolume(game.ctx,load);
      const target=v.digger?v.teethWorld():v.position();
      const response=v.digger&&onPlot(target.x,target.z)?ground.materialResponseAt(target.x,target.z):null;
      const materialId=response?.material??dominantMaterial(load);
      const material=data.ground.materials[materialId];
      machine.material=materialId?{...response,id:materialId,name:material?.name??materialId,color:material?.color}:null;
      machine.loadVolume=volume;
      machine.capacityVolume=v.digger?stats.bucketVolume:stats.bedVolume??null;
      const filling=v.digger?bucketFill(ground,stats,load):null;
      machine.bucketFill01=filling?.fraction??null;
      machine.hydraulicLoad=v.digger?Math.max(0,Math.min(1,Math.max(f.work??0,(v.state.resistance??0)/Math.max(1,stats.breakoutForce??60)))):null;
      machine.slip=f.slip??0;
      machine.attachment=v.digger?({standard:'Standard bucket',trench:'Trenching bucket',grading:'Grading bucket',breaker:'Hydraulic breaker'}[m.attachment??'standard']??m.attachment):null;
      machine.grossLoadTonnes=stats.grossTrailerMass!=null?stats.grossTrailerMass/1000:null;
      machine.towLimitTonnes=stats.maxTowMass!=null?stats.maxTowMass/1000:null;
      machine.workFeedback=workFeedback({digger:v.digger,attachment:m.attachment??'standard',fill:machine.bucketFill01??0,full:filling?.full??false,
        blocked:cuts.get(m.id)?.blocked,resistance:v.state?.resistance??0,force:stats.breakoutForce??60,material:materialId,loose:response?.loose,feel:f,overloaded:stats.overloaded});
      if (v.road && roadNotice?.machineId === m.id && roadNotice.left > 0) machine.workFeedback = { kind: 'warn', label: roadNotice.text, intensity: 1 };
      machine.engine = f.engine; // off / cranking / running / idleOut / stopping / stall
      if (v.road) {
        machine.cruiseActive = !!f.cruiseActive;
        machine.cruiseTargetKmh = (f.cruiseTarget ?? 0) * 3.6;
        machine.cruiseLimited = !!f.cruiseLimited;
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
    return { prompt, job, machine: machine ?? tool, mode: hintMode, locked: mouse.locked(), guide: guideInfo, works: works?.card ?? null, survey:surveyInfo };
  }

  // Remember where everything is, so saves put machines back in place.
  function writePositions(state) {
    const machines = {};
    for (const [id, veh] of vehicles) machines[id] = veh.placement();
    for (const veh of vehicles.values()) {
      const attached = attachedTrailer(game.ctx, veh.machineId);
      if (attached && veh.trailerPlacement) machines[attached.id] = veh.trailerPlacement();
    }
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
      if (veh?.road || veh?.towable) veh.reset(x, z, yaw);
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
    lighting: () => env.lighting(),
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
    bucketState: id => vehicles.get(id)?.directState?.() ?? null,
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
    // Where a machine stands in the world ({ x, z, yaw }), or null (for staff: a digger's work spot).
    machinePlacement: (id) => {
      const v = vehicles.get(id), p = v?.placement?.();
      if (!p) return null;
      const bed = v.bedWorld?.();
      return { ...p, ...(bed ? { bed:{x:bed.x,y:bed.y,z:bed.z} } : {}) };
    },
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
      surveyMarker.geometry.dispose();surveyMarker.material.dispose();
      for (const veh of vehicles.values()) veh.destroy();
      player.destroy();
      yardStockpiles.destroy();
      land.dispose();
      rain.dispose();
      env.dispose();
      workLight.dispose();
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

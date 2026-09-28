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
import { LAYOUTS, zoneAt, inRect } from './layouts.js';
import { getSiteData, getZoneInfo, pileTotal } from '../quarry/index.js';
import {
  getStats, machinesAt, machineName, getMachine, JOBS, jobProgress,
} from '../machinery/index.js';

const MOUSE_SCALE = 0.0022;
const ENTER_DISTANCE = 2.8;

export async function createWorld3D({ container, game, settings, notify, onPointerLockLost }) {
  const { data } = game;
  const siteId = game.state.currentSiteId;
  const layout = LAYOUTS[siteId];
  const siteData = getSiteData(data, siteId);

  const physics = await createPhysics();
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  container.append(canvas);
  const { renderer, q } = createRenderer(canvas, settings.graphics);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 3000);
  camera.rotation.order = 'YXZ';
  const env = createEnvironment(scene, renderer, q, layout.terrain);

  const zoneDepths = () => Object.fromEntries(siteData.zones.map((z) => [z.id, getZoneInfo(game.ctx, siteId, z.id).depth]));
  const terrain = createTerrain({
    scene, physics, layout, siteData, materials: data.materials, getDepths: zoneDepths,
  });
  // The face pile sits where rock was first dumped (saved with the game).
  const facePilePos = { ...(game.state.positions?.facePile ?? layout.facePile) };
  const piles = createPiles({ scene, layout, game, facePilePos });
  const particles = createParticles(scene);

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

  function addVehicle(machine) {
    const spot = saved.machines?.[machine.id] ?? parkingSpot(machine.type);
    const stats = () => getStats(data, getMachine(game.ctx, machine.id) ?? machine);
    const args = { physics, scene, terrain, machine, spawn: spot, stats };
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
    const working = !!m.job;
    if (!m.broken && !working) {
      v.swingBy(-d.x * sens);
      const move = (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
      const turn = (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0);
      v.drive(dt, move, turn);
    }
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
        v.startDump();
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
      camera.position.copy(v.seatWorld());
      camera.rotation.set(look.pitch, baseYaw - Math.PI / 2 + look.yaw, 0);
      return;
    }
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

  let wheelDust = 0;

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
    piles.update();

    // Sync machines with their game state.
    for (const veh of vehicles.values()) {
      const mm = getMachine(game.ctx, veh.machineId);
      if (!mm) continue;
      if (veh.type === 'truck') {
        const cap = getStats(data, mm).capacity;
        const tonnes = pileTotal(mm.load);
        veh.setCargo(tonnes);
        veh.update(dt, { job: mm.job, fill: tonnes / cap, color: bedColor(mm.load) });
        if (veh !== v) {
          veh.control.throttle = 0;
          veh.control.handbrake = true;
        }
        if (!paused && Math.abs(veh.speed()) > 4) {
          wheelDust += dt;
          if (wheelDust > 0.08) {
            wheelDust = 0;
            const back = veh.model.root.localToWorld(new THREE.Vector3(-3.2, -1, 0));
            particles.spawn(back, { count: 1, spread: 1.5, life: 1.6, size: 1.4, opacity: 0.35 });
          }
        }
      } else {
        veh.update(dt, { job: mm.job, bucketFull: pileTotal(mm.load) > 0.01, bucketColor: bedColor(mm.load) });
      }
    }

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
    placeCamera(dt);
    env.follow(v ? v.position() : player.feet());
    renderer.render(scene, camera);
  }

  // What the HUD should show right now.
  function hudInfo() {
    const v = current();
    const m = currentMachine();
    let prompt = '';
    if (!v) {
      const near = nearestVehicle(ENTER_DISTANCE);
      if (near) {
        const nm = getMachine(game.ctx, near.machineId);
        prompt = `E — Get in ${machineName(data, nm)}${nm.broken ? ' (broken down — R to repair)' : ''}`;
      }
    } else if (m.broken) {
      prompt = 'Broken down — press R to repair';
    } else if (m.job) {
      prompt = `${JOBS[m.job.type].label}… ${Math.round(jobProgress(m.job) * 100)}%`;
    } else if (v.type === 'excavator') {
      const t = v.bucketTarget();
      const full = pileTotal(m.load) > 0.01;
      const truck = [...vehicles.values()].find((tr) => tr.type === 'truck' && tr.isOverBed(t));
      const zone = zoneAt(layout, t.x, t.z);
      if (!full) prompt = zone ? `Hold Left Mouse — dig zone ${zone}` : 'Swing the bucket over the pit (mouse) to dig';
      else if (truck) prompt = `Left Mouse — dump into ${machineName(data, getMachine(game.ctx, truck.machineId))}`;
      else prompt = 'Left Mouse — dump on the face pile · or swing over a truck';
    } else if (v.type === 'truck') {
      const p = v.position();
      const loaded = pileTotal(m.load) > 0.05;
      const fp = facePilePos;
      if (loaded && inRect(layout.tipBay, p.x, p.z, 1.5)) prompt = 'T — tip the load';
      else if (Math.hypot(p.x - fp.x, p.z - fp.z) < 9) prompt = 'F — load from the face pile';
      else if (loaded) prompt = 'Drive to the yellow tipping bay at the yard';
    }

    let machine = null;
    if (m) {
      const stats = getStats(data, m);
      machine = {
        name: machineName(data, m),
        type: m.type,
        condition: m.condition,
        broken: m.broken,
        load: pileTotal(m.load),
        capacity: m.type === 'truck' ? stats.capacity : stats.bucket,
        speedKmh: Math.abs(v.speed()) * 3.6,
        camera: camMode,
      };
    }
    return { prompt, machine, mode: mode.kind, locked: mouse.locked() };
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
    setHouseYaw(yaw) {
      const v = current();
      if (v?.type === 'excavator') Object.assign(v.state, { houseYaw: yaw, targetHouseYaw: yaw });
    },
    mode: () => mode.kind,
    look: () => ({ ...look, foot: { ...player.look } }),
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
      for (const v of vehicles.values()) v.destroy();
      player.destroy();
      terrain.dispose();
      renderer.dispose();
      physics.destroy();
      canvas.remove();
    },
  };
}

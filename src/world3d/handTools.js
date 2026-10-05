import { createGroundAccess } from './groundAccess.js';
// Your hands: the shovel you carry and the wheelbarrow you push.
//
// Shovel: held in front of you (first person). Look at the ground on the field and click to
// dig a shovelful out of the real ground; click again to tip it into the barrow, into a vehicle's
// bed, or onto the ground as a heap. The digging happens halfway through each swing.
// Wheelbarrow: E at the handles to take it, then it goes where you look (it turns at a
// walking pace, and won't push through walls or machines). T tips it: onto the field as a
// real pile, or into the pickup's bed (push the wheel up to its tailgate). E lets go; it stands
// on its wheel and legs and follows the ground under it.
//
// All the real work (how much you dig, where material goes) is done by game actions
// (src/handtools); this file only draws, animates, aims and asks.
import * as THREE from 'three';
import { glbProp } from './glbModels.js';
import { createHeap } from './piles.js';
import { pileTotal } from '../quarry/index.js';
import {
  shovelLoad, barrowLoad, barrowFill, looseVolume, whyCannotDig,
} from '../handtools/index.js';
import { getMachine, machineName } from '../machinery/index.js';

// Wheelbarrow geometry in model space (X forward, Y up), as built by blender/handtools.py.
const AXLE = new THREE.Vector3(0.56, 0.19, 0);
const WHEEL_R = 0.19;
const GRIP = { x: -0.98, y: 0.53 }; // midway between the grips
const FOOT = { x: -0.34, y: 0.006 };
const HANDS = 0.72; // grip height above your feet while pushing
const HOLD = 0.42; // grips this far in front of your feet
const RIM_Y = 0.64;
const TRAY = { x0: -0.36, x1: 0.62, hw: 0.34, floor: 0.35 };
const TIP_PITCH = -1.05; // nose down while tipping (radians)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const ease = (t) => t * t * (3 - 2 * t);
// A point of the frame as an arm from the axle: length and angle (in the model's X-Y plane).
const arm = (p) => ({ len: Math.hypot(p.x - AXLE.x, p.y - AXLE.y), ang: Math.atan2(p.y - AXLE.y, p.x - AXLE.x) });
const GRIP_ARM = arm(GRIP);
const FOOT_ARM = arm(FOOT);
// Pitch about the axle (negative = nose down) that puts a backward-pointing arm `dy` above the axle.
const pitchFor = (a, dy) => wrap(Math.PI - Math.asin(clamp(dy / a.len, -1, 1)) - a.ang);
// How far behind the axle (horizontally) that arm ends at a pitch.
const reachBack = (a, pitch) => -a.len * Math.cos(a.ang + pitch);
// Direction you face for a camera yaw (yaw 0 looks along -Z).
const heading = (yaw) => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));

// ---------------------------------------------------------------- stand-in models

function placeholderBarrow() {
  const root = new THREE.Group();
  const green = new THREE.MeshStandardMaterial({ color: 0x2d6a36, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.62), green);
  tray.position.set(0.13, 0.5, 0);
  root.add(tray);
  for (const z of [-0.28, 0.28]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1.6, 8), dark);
    h.rotation.z = Math.PI / 2 - 0.22;
    h.position.set(-0.2, 0.36, z);
    root.add(h);
  }
  const wheel = new THREE.Group();
  wheel.name = 'Wheel';
  wheel.position.copy(AXLE);
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.08, 20), dark);
  tyre.rotation.x = Math.PI / 2;
  wheel.add(tyre);
  root.add(wheel);
  root.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return root;
}

function placeholderShovel() {
  const root = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 8), new THREE.MeshStandardMaterial({ color: 0xc9a36b }));
  wood.rotation.z = Math.PI / 2;
  wood.position.x = 0.55;
  const blade = new THREE.Group();
  blade.name = 'Blade';
  blade.position.set(1.26, -0.035, 0);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.26), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.7 }));
  blade.add(plate);
  root.add(wood, blade);
  return root;
}

// ---------------------------------------------------------------- flying clods (visual only)

function createClods(scene) {
  const geo = new THREE.DodecahedronGeometry(0.035, 0);
  const pool = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5e4a36, roughness: 1 }));
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    pool.push({ m, vel: new THREE.Vector3(), life: 0 });
  }
  let next = 0;
  return {
    spawn(at, color, { count = 6, spread = 0.15, up = 1.2, dir = null, size = 1 } = {}) {
      for (let i = 0; i < count; i++) {
        const c = pool[next];
        next = (next + 1) % pool.length;
        c.m.position.set(at.x + (Math.random() - 0.5) * spread, at.y + Math.random() * 0.05, at.z + (Math.random() - 0.5) * spread);
        c.vel.set((Math.random() - 0.5) * 0.8, up * (0.3 + Math.random() * 0.7), (Math.random() - 0.5) * 0.8);
        if (dir) c.vel.addScaledVector(dir, 1);
        c.m.scale.setScalar((0.5 + Math.random() * 0.9) * size);
        c.m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
        c.m.material.color.copy(color);
        c.m.visible = true;
        c.life = 1.5;
      }
    },
    update(dt, heightAt) {
      for (const c of pool) {
        if (!c.m.visible) continue;
        c.life -= dt;
        c.vel.y -= 9.81 * dt;
        c.m.position.addScaledVector(c.vel, dt);
        c.m.rotation.x += dt * 5;
        if (c.life <= 0 || c.m.position.y < heightAt(c.m.position.x, c.m.position.z) - 0.02) c.m.visible = false;
      }
    },
    dispose() {
      for (const c of pool) {
        scene.remove(c.m);
        c.m.material.dispose();
      }
      geo.dispose();
    },
  };
}

// ---------------------------------------------------------------- the hands

export function createHandTools({
  scene, camera, physics, terrain, game, home, player, particles, vehicles, audio = null, notify, saved = null,
}) {
  const { data } = game;
  const ctx = game.ctx;
  const ground = createGroundAccess(ctx);
  const { RAPIER, world } = physics;
  const shovelSpec = data.tools.shovel;
  const barrowSpec = data.tools.wheelbarrow;

  // Colour of some material, by what's in it.
  const colorOf = (load) => {
    const c = new THREE.Color(0, 0, 0);
    const total = pileTotal(load);
    if (total <= 0) return c.set('#5e4a36');
    for (const [id, t] of Object.entries(load)) {
      c.add(new THREE.Color(data.ground.materials[id]?.color ?? data.materials[id]?.color ?? '#777').multiplyScalar(t / total));
    }
    return c;
  };
  const materialName = (id) => (data.ground.materials[id]?.name ?? id).toLowerCase();

  // ---- the wheelbarrow in the world
  const pivot = new THREE.Group(); // at the axle, turned to face where it points
  const tilt = new THREE.Group(); // pitched about the axle
  const barrowModel = glbProp('wheelbarrow') ?? placeholderBarrow();
  barrowModel.position.copy(AXLE).negate();
  tilt.add(barrowModel);
  pivot.add(tilt);
  scene.add(pivot);
  const wheel = barrowModel.getObjectByName('Wheel');
  const barrowHeap = createHeap(41);
  barrowHeap.visible = false;
  tilt.add(barrowHeap);
  // The shovel rides in the tray while you push.
  const ridingShovel = glbProp('shovel') ?? placeholderShovel();
  {
    const handle = new THREE.Vector3(-0.95, 0.6, 0.3).sub(AXLE); // shaft resting on the right handle
    const bladeAt = new THREE.Vector3(0.28, 0.5, 0.1).sub(AXLE); // blade in the tray
    const dir = bladeAt.clone().sub(handle).normalize();
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    const up = dir.clone().cross(side).normalize();
    ridingShovel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, up, side.negate()));
    ridingShovel.position.copy(bladeAt).addScaledVector(dir, -1.26);
    ridingShovel.visible = false;
    tilt.add(ridingShovel);
  }

  const start = saved ?? home.barrow ?? { x: 0, z: 0, yaw: 0 };
  const b = {
    x: start.x,
    z: start.z,
    yaw: start.yaw ?? 0,
    pitch: 0,
    held: false,
    tipT: -1, // tipping progress 0..1, or -1
    tipDone: false,
    tipAt: null,
    roll: 0,
    speed: 0,
  };

  // A fixed collider while it stands still, so you (and trucks) bump into it.
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(b.x, 0, b.z));
  const BOX = { hx: 0.56, hy: 0.24, hz: 0.35, cx: 0.17 - AXLE.x, cy: 0.42 - AXLE.y };
  const collider = world.createCollider(RAPIER.ColliderDesc.cuboid(BOX.hx, BOX.hy, BOX.hz).setTranslation(BOX.cx, BOX.cy, 0), body);
  const testShape = new RAPIER.Cuboid(BOX.hx, BOX.hy - 0.06, BOX.hz);
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');

  // Ground height under the barrow (the plot, the site terrain, or the flat outside).
  const heightAt = (x, z) => terrain.heightAt(x, z);

  function parkedPose() {
    const f = heading(b.yaw);
    let pitch = b.pitch;
    let axleY = heightAt(b.x, b.z) + WHEEL_R;
    for (let i = 0; i < 3; i++) {
      const back = reachBack(FOOT_ARM, pitch);
      const fy = heightAt(b.x - f.x * back, b.z - f.z * back);
      axleY = heightAt(b.x, b.z) + WHEEL_R;
      pitch = pitchFor(FOOT_ARM, fy + 0.004 - axleY);
    }
    return { axleY, pitch };
  }

  // Where the barrow would be (axle x/z, height, pitch) held by someone standing at `feet`.
  function heldPose(feet, yaw) {
    const f = heading(yaw);
    let pitch = b.pitch;
    let x = b.x;
    let z = b.z;
    let axleY = 0;
    for (let i = 0; i < 3; i++) {
      const back = reachBack(GRIP_ARM, pitch);
      x = feet.x + f.x * (HOLD + back);
      z = feet.z + f.z * (HOLD + back);
      axleY = heightAt(x, z) + WHEEL_R;
      pitch = pitchFor(GRIP_ARM, feet.y + HANDS - axleY);
    }
    return { x, z, axleY, pitch };
  }

  function barrowQuat(yaw, pitch) {
    return q.setFromEuler(e.set(0, yaw + Math.PI / 2, pitch, 'YXZ'));
  }

  // Would the barrow (at axle x/z, facing yaw) hit a wall, a prop or a machine?
  function blocked(x, z, axleY, yaw, pitch) {
    const rot = barrowQuat(yaw, pitch).clone();
    const c = new THREE.Vector3(BOX.cx, BOX.cy + 0.06, 0).applyQuaternion(rot).add(new THREE.Vector3(x, axleY, z));
    const hit = world.intersectionWithShape(c, rot, testShape, undefined, undefined, collider, undefined, (col) => {
      if (col === player.collider || col.shapeType() === RAPIER.ShapeType.HeightField) return false;
      return col.translation().y > -1; // not the flat ground slabs outside the site
    });
    return !!hit;
  }

  function placeBarrow(x, axleY, z, yaw, pitch) {
    pivot.position.set(x, axleY, z);
    pivot.rotation.set(0, yaw + Math.PI / 2, 0);
    tilt.rotation.set(0, 0, pitch);
    body.setNextKinematicTranslation({ x, y: axleY, z });
    const r = barrowQuat(yaw, pitch);
    body.setNextKinematicRotation({ x: r.x, y: r.y, z: r.z, w: r.w });
  }

  function updateBarrowHeap() {
    const load = barrowLoad(ctx);
    const f = clamp(barrowFill(ctx), 0, 1.05);
    barrowHeap.visible = f > 0.01;
    if (!barrowHeap.visible) return;
    const t = 0.8 * Math.min(1, f);
    const w = 1 - (1 - t) ** 1.35;
    const x0 = -0.2 - 0.16 * w;
    const x1 = 0.26 + 0.36 * w ** 0.8;
    const hw = 0.2 + 0.14 * w;
    const y = TRAY.floor + (RIM_Y - TRAY.floor) * t;
    barrowHeap.position.set((x0 + x1) / 2 - AXLE.x, y - AXLE.y, 0);
    barrowHeap.scale.set(((x1 - x0) / 2) * 0.97, (0.04 + 0.16 * f) / 0.6, hw * 0.97);
    barrowHeap.material.color.copy(colorOf(load));
  }

  // ---- the shovel in your hands (first person)
  const shovelView = new THREE.Group();
  const shovelModel = glbProp('shovel') ?? placeholderShovel();
  shovelModel.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  shovelView.add(shovelModel);
  camera.add(shovelView);
  const blade = shovelModel.getObjectByName('Blade') ?? shovelModel;
  const bladeHeap = createHeap(51);
  bladeHeap.castShadow = false;
  bladeHeap.visible = false;
  blade.add(bladeHeap);
  // Resting pose in camera space: carried level at your hip, the blade low and a little right
  // of centre with its face up (so you see what's on it), the shaft coming in from the bottom
  // right corner (your hands are just out of view). `up` is the world's up when you look down
  // at the ground (about 35 degrees), so the blade lies flat then.
  const REST = (() => {
    const bladeAt = new THREE.Vector3(0.34, -0.56, -1.0);
    const up = new THREE.Vector3(0, 0.83, 0.56);
    const want = new THREE.Vector3(-0.3, -0.33, -1);
    const dir = want.addScaledVector(up, -want.dot(up)).normalize(); // along the shaft, level
    return { dir, up, grip: bladeAt.clone().addScaledVector(dir, -1.26) };
  })();
  const restQuat = (() => {
    const z = REST.dir.clone().cross(REST.up).normalize();
    const y = z.clone().cross(REST.dir).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(REST.dir, y, z));
  })();
  const THRUST = new THREE.Vector3(-0.1, -0.35, -1).normalize(); // into the ground in front of you
  const anim = { kind: null, t: 0, dur: 1, target: null, done: false, bob: 0 };
  let barrowBlocked = null;
  const tmpQ = new THREE.Quaternion();
  const axisX = new THREE.Vector3(1, 0, 0);

  function updateBladeHeap() {
    const load = shovelLoad(ctx);
    const v = looseVolume(data, load);
    bladeHeap.visible = v > 1e-5;
    if (!bladeHeap.visible) return;
    const k = Math.cbrt(v / shovelSpec.volume);
    bladeHeap.position.set(-0.03, 0.0, 0);
    bladeHeap.scale.set(0.12 * k, 0.12 * k, 0.1 * k);
    bladeHeap.material.color.copy(colorOf(load));
  }

  function poseShovel(dt, walkSpeed) {
    anim.bob += dt * (2 + walkSpeed * 2.2);
    const bob = Math.min(1, walkSpeed / 4);
    const pos = REST.grip.clone().add(new THREE.Vector3(Math.sin(anim.bob) * 0.012 * bob, Math.abs(Math.cos(anim.bob)) * 0.02 * bob, 0));
    const quat = restQuat.clone();
    if (anim.kind) {
      const t = anim.t / anim.dur;
      if (anim.kind === 'dig') {
        // Thrust forward and down, then lever it up with the shovelful on the blade.
        const thrust = t < 0.45 ? ease(t / 0.45) : 1 - ease((t - 0.45) / 0.55);
        const lift = t < 0.45 ? 0 : Math.sin(Math.PI * Math.min(1, (t - 0.45) / 0.55));
        pos.addScaledVector(THRUST, thrust * 0.3).add(new THREE.Vector3(0, 0.08 * lift, 0.04 * lift));
        quat.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.35 * thrust + 0.2 * lift));
      } else {
        // Swing toward what you're tipping into and turn the blade over.
        const s = Math.sin(Math.PI * t);
        pos.add(new THREE.Vector3(-0.12 * s, 0.1 * s, -0.1 * s));
        quat.multiply(tmpQ.setFromAxisAngle(axisX, -1.9 * ease(Math.min(1, t * 1.8)) * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3)));
        quat.multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.25 * s));
      }
    }
    shovelModel.position.copy(pos);
    shovelModel.quaternion.copy(quat);
  }

  // ---- aiming: what the middle of the screen is on, within reach
  const eye = new THREE.Vector3();
  const look = new THREE.Vector3();
  const inv = new THREE.Matrix4();

  function rayGround(reach) {
    let prev = 0.15;
    for (let t = 0.15; t <= reach; t += 0.05) {
      const p = eye.clone().addScaledVector(look, t);
      if (p.y <= heightAt(p.x, p.z)) {
        let lo = prev;
        let hi = t;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const m = eye.clone().addScaledVector(look, mid);
          if (m.y <= heightAt(m.x, m.z)) hi = mid;
          else lo = mid;
        }
        return { t: hi, point: eye.clone().addScaledVector(look, hi) };
      }
      prev = t;
    }
    return null;
  }

  function rayTray(reach) {
    tilt.updateWorldMatrix(true, false);
    inv.copy(tilt.matrixWorld).invert();
    const o = eye.clone().applyMatrix4(inv).add(AXLE);
    const d = look.clone().transformDirection(inv);
    if (d.y > -0.05) return null;
    const t = (RIM_Y - o.y) / d.y;
    if (t < 0 || t > reach + 0.4) return null;
    const p = o.clone().addScaledVector(d, t);
    if (p.x < TRAY.x0 - 0.1 || p.x > TRAY.x1 + 0.1 || Math.abs(p.z) > TRAY.hw + 0.1) return null;
    return { t, point: eye.clone().addScaledVector(look, t) };
  }

  // A vehicle's bed you're looking at (a truck's sides are above your head: you throw it up and in).
  function rayTruck(reach) {
    for (const v of vehicles.values()) {
      if (!v.carrier || Math.abs(v.speed()) > 0.5) continue;
      const floorY = v.bedWorld().y - 0.3;
      for (let t = 0.3; t <= reach + 0.8; t += 0.1) {
        const p = eye.clone().addScaledVector(look, t);
        if (p.y > floorY && p.y < floorY + 1.8 && v.isOverBed(p, 0.05)) return { t, point: p, v };
      }
    }
    return null;
  }

  // The target right now: { kind, point, ... } or null. Kinds: dig, noDig, barrow, truck,
  // ground (tip here), noTip.
  let target = null;
  function aim() {
    camera.getWorldPosition(eye);
    camera.getWorldDirection(look);
    const reach = shovelSpec.reach;
    const full = pileTotal(shovelLoad(ctx)) > 1e-6;
    const g = rayGround(reach);
    if (full) {
      const tray = rayTray(reach);
      if (tray && (!g || tray.t < g.t + 0.3)) return { kind: 'barrow', point: tray.point };
      const truck = rayTruck(reach);
      if (truck && (!g || truck.t < g.t + 0.3)) return { kind: 'truck', point: truck.point, v: truck.v };
      if (!g) return null;
      return { kind: ground?.workable(g.point.x, g.point.z) ? 'ground' : 'noTip', point: g.point };
    }
    if (!g) return null;
    const tray = rayTray(reach);
    if (tray && tray.t < g.t) return null; // looking into the barrow, not at the ground
    return { kind: ground?.workable(g.point.x, g.point.z) ? 'dig' : 'noDig', point: g.point };
  }

  // A small ring on the ground where the shovel goes.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.27, 28),
    new THREE.MeshBasicMaterial({ color: 0x7ee07e, transparent: true, opacity: 0.75, depthTest: false }));
  marker.rotation.x = -Math.PI / 2;
  marker.renderOrder = 10;
  marker.visible = false;
  scene.add(marker);

  const clods = createClods(scene);

  // ---- sound
  let rollVoice = null;
  const sfx = (name, pos, opts = {}) => audio?.play(name, { pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, ...opts });

  // ---- actions
  function doShovel() {
    const tg = anim.target;
    if (tg.kind === 'dig') {
      const r = game.actions.shovelDig({ x: tg.point.x, z: tg.point.z });
      if (!r.ok) {
        notify(r.reason, 'warn');
        return;
      }
      const at = tg.point.clone();
      at.y = heightAt(at.x, at.z);
      sfx('shovel', at, { gain: 0.9, rate: 0.9 + Math.random() * 0.2 });
      const material = Object.entries(r.materials).sort((a,b)=>b[1]-a[1])[0]?.[0];
      const flow = data.ground.materials[material]?.flow ?? .6;
      clods.spawn(at, colorOf(r.materials), { count: flow > .8 ? 9 : 5, up: flow > .8 ? .7 : 1.4, size: flow > .8 ? .45 : 1 });
      particles.spawn(at, { count: 2, spread: 0.3, up: 0.3, life: 1.2, size: 0.5, color: 0xa08a6a, opacity: 0.25 });
      return;
    }
    const color = colorOf(shovelLoad(ctx));
    let r;
    if (tg.kind === 'barrow') r = game.actions.shovelDump({ into: 'barrow' });
    else if (tg.kind === 'truck') r = game.actions.shovelDump({ into: 'machine', machineId: tg.v.machineId });
    else r = game.actions.shovelDump({ into: 'ground', x: tg.point.x, z: tg.point.z });
    if (!r.ok) {
      notify(r.reason, 'warn');
      return;
    }
    const at = tg.point.clone();
    if (tg.kind === 'ground') at.y = heightAt(at.x, at.z) + 0.3;
    sfx(tg.kind === 'truck' ? 'pour' : 'soil', at, { gain: tg.kind === 'truck' ? 0.35 : 0.8, rate: 1.1 + Math.random() * 0.2 });
    if (tg.kind === 'truck') sfx('boom', at, { gain: 0.15, rate: 1.6 });
    clods.spawn(at, color, { count: 7, up: 0.2, spread: 0.25 });
  }

  function useShovel() {
    if (anim.kind || b.held) return;
    const tg = target;
    if (!tg) return;
    if (tg.kind === 'noDig') {
      notify(whyCannotDig(ctx, tg.point.x, tg.point.z) ?? 'You can only dig on the field', 'warn');
      return;
    }
    if (tg.kind === 'noTip') {
      notify('Tip it on the field, or into the wheelbarrow', 'warn');
      return;
    }
    anim.kind = tg.kind === 'dig' ? 'dig' : 'dump';
    anim.t = 0;
    const resistance = tg.kind === 'dig' ? ground.digResistanceAt(tg.point.x, tg.point.z) : 0;
    anim.dur = tg.kind === 'dig' ? shovelSpec.digTime * Math.min(2.5, Math.max(1, resistance / (shovelSpec.force ?? 24))) : shovelSpec.dumpTime;
    anim.target = tg;
    anim.done = false;
  }

  function gripsWorld() {
    tilt.updateWorldMatrix(true, false);
    return new THREE.Vector3(GRIP.x - AXLE.x, GRIP.y - AXLE.y, 0).applyMatrix4(tilt.matrixWorld);
  }

  // Distance from your feet to the barrow's handles (for taking it).
  function grabDistance() {
    if (b.held) return Infinity;
    const g = gripsWorld();
    const f = player.feet();
    return Math.hypot(g.x - f.x, g.z - f.z);
  }

  function grab() {
    if (b.held) return;
    b.held = true;
    b.tipT = -1;
    collider.setEnabled(false);
    // Face along the barrow and stand at its handles.
    const f = heading(b.yaw);
    const back = reachBack(GRIP_ARM, b.pitch) + HOLD;
    const x = b.x - f.x * back;
    const z = b.z - f.z * back;
    player.teleport(x, heightAt(x, z) + 0.05, z);
    player.look.yaw = b.yaw;
    player.look.pitch = Math.min(player.look.pitch, -0.35);
    anim.kind = null;
  }

  function letGo() {
    if (!b.held || b.tipT >= 0) return;
    b.held = false;
    collider.setEnabled(true);
    player.input.maxSpeed = null;
    player.input.moveYaw = null;
  }

  // Where tipped material lands: just in front of the wheel.
  function dumpPoint() {
    const f = heading(b.yaw);
    return { x: b.x + f.x * 0.45, z: b.z + f.z * 0.45 };
  }
  // A low bed (the pickup's) whose tailgate the barrow's wheel is up against: you can tip into it.
  // A truck's bed is too high to tip a barrow into.
  function bedAtTailgate() {
    const p = dumpPoint();
    let best = null;
    for (const v of vehicles.values()) {
      if (!v.road || !v.tailgateWorld || Math.abs(v.speed()) > 0.5) continue;
      const tg = v.tailgateWorld();
      if (v.bedFloorWorldY() - heightAt(tg.x, tg.z) > 1.2) continue;
      const d = Math.hypot(tg.x - p.x, tg.z - p.z);
      if (d < 1.3 && (!best || d < best.d)) best = { v, d };
    }
    return best?.v ?? null;
  }
  const bedName = (v) => machineName(data, getMachine(ctx, v.machineId)).replace(/ #\d+$/, '').toLowerCase();

  function tip() {
    if (!b.held || b.tipT >= 0) return;
    if (pileTotal(barrowLoad(ctx)) < 1e-6) {
      notify('The wheelbarrow is empty', 'warn');
      return;
    }
    const p = dumpPoint();
    const bed = bedAtTailgate();
    if (!bed && !ground?.workable(p.x, p.z)) {
      notify('Tip it on your field, or push it up to the pickup\'s tailgate', 'warn');
      return;
    }
    b.tipT = 0;
    b.tipDone = false;
    b.tipAt = { ...p, machineId: bed?.machineId ?? null, bedY: bed ? bed.bedFloorWorldY() : null };
  }

  function finishTip() {
    const { x, z, machineId, bedY } = b.tipAt;
    const color = colorOf(barrowLoad(ctx));
    const r = game.actions.tipBarrow(machineId ? { machineId } : { x, z });
    if (!r.ok) {
      notify(r.reason, 'warn');
      return;
    }
    const at = new THREE.Vector3(x, (bedY ?? heightAt(x, z)) + 0.35, z);
    sfx('soilLong', at, { gain: 1 });
    if (machineId) sfx('boom', at, { gain: 0.12, rate: 1.9 });
    clods.spawn(at, color, { count: 14, up: 0.5, spread: 0.4, dir: heading(b.yaw).multiplyScalar(0.8) });
    particles.spawn(at, { count: 6, spread: 0.6, up: 0.4, life: 1.8, size: 0.8, color: 0xa08a6a, opacity: 0.3 });
  }

  // ---- per frame
  let lastFeet = null;
  let walkSpeed = 0;

  return {
    holding: () => b.held,
    grabDistance,
    grab,
    letGo,
    tip,
    useShovel,
    target: () => target,
    busy: () => !!anim.kind || b.tipT >= 0,

    // Steering while you push (called instead of the normal on-foot controls).
    controlHeld(dt, keys, d, sens) {
      barrowBlocked = null;
      const turnKeys = (keys('left') ? 1 : 0) - (keys('right') ? 1 : 0);
      player.look.yaw -= d.x * sens;
      player.look.yaw += turnKeys * 1.6 * dt;
      player.look.pitch = clamp(player.look.pitch - d.y * sens, -1.25, 0.8);
      player.input.right = 0;
      player.input.sprint = false;
      player.input.jump = false;
      const tipping = b.tipT >= 0;
      // The barrow swings round toward where you look, at a walking pace.
      const diff = wrap(player.look.yaw - b.yaw);
      const rate = barrowSpec.turnRate * dt;
      let yaw = tipping ? b.yaw : b.yaw + clamp(diff, -rate, rate);
      const fwd = tipping ? 0 : (keys('forward') ? 1 : 0) - (keys('back') ? 1 : 0);
      const speed = lerp(barrowSpec.pushSpeed, barrowSpec.loadedSpeed, clamp(barrowFill(ctx), 0, 1)) * (fwd < 0 ? 0.6 : 1);
      const feet = player.feet();
      let go = fwd;
      if (dt > 0 && (fwd || yaw !== b.yaw)) {
        // Stop short of walls, props and machines (unless it's already stuck in one: then
        // let it move, so you can always back out).
        const here = heldPose(feet, b.yaw);
        if (!blocked(here.x, here.z, here.axleY, b.yaw, here.pitch)) {
          const f = heading(yaw);
          const ahead = { x: feet.x + f.x * fwd * speed * dt * 2, y: feet.y, z: feet.z + f.z * fwd * speed * dt * 2 };
          const pa = heldPose(ahead, yaw);
          if (blocked(pa.x, pa.z, pa.axleY, yaw, pa.pitch)) {
            go = 0;
            barrowBlocked = fwd < 0 ? 'back' : fwd > 0 ? 'forward' : 'turn';
            const ps = heldPose(feet, yaw);
            if (blocked(ps.x, ps.z, ps.axleY, yaw, ps.pitch)) yaw = b.yaw;
          }
        }
      }
      b.yaw = wrap(yaw);
      player.input.forward = go;
      player.input.maxSpeed = speed;
      player.input.moveYaw = b.yaw;
    },

    // After physics: place the barrow, animate, aim.
    update(dt, { onFoot, clicked, paused, repeat = false }) {
      const feet = player.feet();
      walkSpeed = lastFeet && dt > 0 ? Math.min(10, Math.hypot(feet.x - lastFeet.x, feet.z - lastFeet.z) / dt) : 0;
      lastFeet = feet.clone();

      // ---- barrow
      const prevX = b.x;
      const prevZ = b.z;
      if (b.held) {
        let extra = 0;
        if (b.tipT >= 0) {
          b.tipT = Math.min(1, b.tipT + (paused ? 0 : dt / barrowSpec.tipTime));
          const t = b.tipT;
          const up = t < 0.35 ? ease(t / 0.35) : t < 0.6 ? 1 : 1 - ease((t - 0.6) / 0.4);
          extra = (TIP_PITCH - b.pitch) * up;
          if (!b.tipDone && t >= 0.4) {
            b.tipDone = true;
            finishTip();
          }
          if (t >= 1) b.tipT = -1;
        }
        const p = heldPose(feet, b.yaw);
        b.x = p.x;
        b.z = p.z;
        b.pitch = p.pitch;
        placeBarrow(p.x, p.axleY, p.z, b.yaw, p.pitch + extra);
      } else {
        const p = parkedPose();
        b.pitch = p.pitch;
        placeBarrow(b.x, p.axleY, b.z, b.yaw, p.pitch);
      }
      const moved = Math.hypot(b.x - prevX, b.z - prevZ);
      const f = heading(b.yaw);
      const along = (b.x - prevX) * f.x + (b.z - prevZ) * f.z;
      b.roll -= along / WHEEL_R;
      if (wheel) wheel.rotation.z = b.roll;
      b.speed = dt > 0 ? moved / dt : 0;
      updateBarrowHeap();
      ridingShovel.visible = b.held;

      // ---- shovel
      shovelView.visible = onFoot && !b.held;
      if (anim.kind && !paused) {
        anim.t += dt;
        if (!anim.done && anim.t >= anim.dur * (anim.kind === 'dig' ? 0.45 : 0.5)) {
          anim.done = true;
          doShovel();
        }
        if (anim.t >= anim.dur) anim.kind = null;
      }
      updateBladeHeap();
      poseShovel(dt, walkSpeed);

      target = onFoot && !b.held ? aim() : null;
      if (onFoot && !b.held && (clicked || repeat) && !paused) useShovel();
      const show = target && !anim.kind;
      marker.visible = !!show;
      if (show) {
        const colors = { dig: 0x7ee07e, noDig: 0x888888, barrow: 0x4fc3f7, truck: 0x4fc3f7, ground: 0xf2b632, noTip: 0x888888 };
        marker.material.color.set(colors[target.kind]);
        const y = ['barrow', 'truck'].includes(target.kind) ? target.point.y : heightAt(target.point.x, target.point.z);
        marker.position.set(target.point.x, y + 0.04, target.point.z);
      }
      clods.update(dt, heightAt);

      // Rolling wheel on the ground.
      if (audio?.ready()) {
        rollVoice ??= audio.loopVoice('gravel');
        const w = new THREE.Vector3(b.x, heightAt(b.x, b.z), b.z);
        const loud = b.held ? Math.min(1, b.speed / 2.5) : 0;
        rollVoice?.set({ gain: loud * (0.12 + 0.12 * clamp(barrowFill(ctx), 0, 1)), rate: 0.9 + b.speed * 0.25, pos: w, cutoff: 5000 });
      }
    },

    // What the HUD should say about your hands. Returns { prompts, dash }.
    hud(key) {
      const prompts = [];
      let dash = null;
      if (b.held) {
        const p = dumpPoint();
        const empty = pileTotal(barrowLoad(ctx)) < 1e-6;
        const bed = bedAtTailgate();
        if (b.tipT >= 0) prompts.push({ key: null, text: 'Tipping…' });
        else if (barrowBlocked) prompts.push({ key: key(barrowBlocked === 'back' ? 'forward' : 'back'),
          text: barrowBlocked === 'back' ? 'Blocked behind: push forward or let go' : barrowBlocked === 'turn' ? 'No room to turn: pull back first' : 'Blocked ahead: pull back before turning' });
        else if (bed && !empty) prompts.push({ key: key('tip'), text: `Tip it into the ${bedName(bed)}` });
        else if (bed && empty) prompts.push({ key: key('back'), text: 'Back away from the tailgate before turning' });
        else if (!empty && ground?.workable(p.x, p.z)) prompts.push({ key: key('tip'), text: 'Tip it here' });
        else if (!empty) prompts.push({ key: null, text: 'Push it up to the pickup\'s tailgate to load it' });
        prompts.push({ key: key('interact'), text: 'Let go' });
        const load = barrowLoad(ctx);
        dash = {
          name: barrowSpec.name,
          type: 'barrow',
          load: looseVolume(data, load),
          capacity: barrowSpec.volume,
          tonnes: pileTotal(load),
          speedKmh: b.speed * 3.6,
        };
        return { prompts, dash };
      }
      const tg = target;
      if (tg && !anim.kind) {
        if (tg.kind === 'dig') prompts.push({ key: 'LMB', text: `Dig ${materialName(ground.surfaceAt(tg.point.x, tg.point.z))}` });
        else if (tg.kind === 'barrow') prompts.push({ key: 'LMB', text: `Tip into the wheelbarrow (${Math.round(Math.min(1, barrowFill(ctx)) * 100)}% full)` });
        else if (tg.kind === 'truck') prompts.push({ key: 'LMB', text: `Tip into ${machineName(data, getMachine(ctx, tg.v.machineId))}` });
        else if (tg.kind === 'ground') prompts.push({ key: 'LMB', text: 'Tip it here' });
      }
      return { prompts, dash };
    },

    // Where the barrow is (saved with the game).
    placement: () => ({ x: b.x, z: b.z, yaw: b.yaw }),
    recoverAt(x, z, yaw = b.yaw) {
      // Recovery changes only placement. Partially completed pours keep their real cargo.
      b.held = false;
      b.tipT = -1;
      b.speed = 0;
      Object.assign(b, { x, z, yaw });
      collider.setEnabled(true);
      player.input.maxSpeed = null;
      player.input.moveYaw = null;
      anim.kind = null;
    },
    // For play tests: put the barrow somewhere, or move yourself while holding it.
    placeBarrow(x, z, yaw = b.yaw) {
      letGo();
      Object.assign(b, { x, z, yaw });
    },
    moveHeld(x, z, yaw) {
      if (!b.held) return;
      player.teleport(x, heightAt(x, z) + 0.05, z);
      player.look.yaw = yaw;
      b.yaw = yaw;
    },
    state: b,

    destroy() {
      rollVoice?.stop();
      scene.remove(pivot, marker);
      camera.remove(shovelView);
      clods.dispose();
      world.removeRigidBody(body);
    },
  };
}

// Everything at the front of the site: the public road outside, the driveway in,
// the fence and farm gates, the old entrance sign and the power line along the road.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glbProp } from './glbModels.js';
import { createGroundMaterial, paintGround, dampSheen } from './groundMaterial.js';

const OUTSIDE_Y = -0.3; // ground level beyond the earth bank

let asphalt = null;
export async function preloadEntrance(renderer) {
  try {
    asphalt = await new THREE.TextureLoader().loadAsync('textures/ground/asphalt_albedo.jpg');
    asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    asphalt.colorSpace = THREE.SRGBColorSpace;
    asphalt.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  } catch {
    asphalt = null;
  }
}

export function addEntrance({ scene, physics, layout }) {
  const { RAPIER, world } = physics;
  const T = layout.terrain;
  const gate = layout.entrance;
  const road = layout.publicRoad;
  if (!gate || !road) return;
  const place = (name, x, y, z, yaw = 0) => {
    const obj = glbProp(name);
    if (!obj) return null;
    obj.position.set(x, y, z);
    obj.rotation.y = yaw;
    scene.add(obj);
    return obj;
  };

  // ---- public road: worn tarmac with faded centre dashes ----
  const len = 1200;
  const roadMat = dampSheen(new THREE.MeshStandardMaterial({
    // Tint warmed a little against the blue sky light.
    color: asphalt ? new THREE.Color(1.3, 1.18, 1.0) : 0x3b3a37, map: asphalt, roughness: 0.9, envMapIntensity: 0.7,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  if (asphalt) asphalt.repeat.set(len / 2, road.width / 2);
  const tarmac = new THREE.Mesh(new THREE.PlaneGeometry(len, road.width).rotateX(-Math.PI / 2), roadMat);
  tarmac.position.set(0, OUTSIDE_Y + 0.02, road.z);
  tarmac.receiveShadow = true;
  scene.add(tarmac);
  const dashMat = dampSheen(new THREE.MeshStandardMaterial({ color: 0xc9c4b4, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  const dashCount = Math.floor(len / 9);
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(3, 0.12).rotateX(-Math.PI / 2), dashMat, dashCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < dashCount; i++) {
    m.makeTranslation(-len / 2 + i * 9, OUTSIDE_Y + 0.025, road.z);
    dashes.setMatrixAt(i, m);
  }
  dashes.receiveShadow = true;
  scene.add(dashes);

  // ---- driveway from the gate to the road ----
  const drive = createGroundMaterial();
  Object.assign(drive, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const driveLen = T.z0 - (road.z + road.width / 2) + 0.5;
  const driveway = new THREE.Mesh(
    paintGround(new THREE.PlaneGeometry(gate.x1 - gate.x0 - 2.5, driveLen, 4, 8).rotateX(-Math.PI / 2), [0, 0.55, 0.45, 0], [0.9, 0.88, 0.82]),
    drive,
  );
  driveway.position.set((gate.x0 + gate.x1) / 2, OUTSIDE_Y + 0.01, T.z0 - driveLen / 2 + 0.5);
  driveway.receiveShadow = true;
  scene.add(driveway);

  // ---- fence along the road side, with the gates in the gap ----
  const fenceZ = T.z0 - 1;
  const bays = [];
  for (let x = T.x0; x + 3 <= gate.x0 - 0.2; x += 3) bays.push(x);
  for (let x = gate.x1 + 0.2; x + 3 <= T.x1; x += 3) bays.push(x);
  for (const x of bays) place('fence', x, OUTSIDE_Y, fenceZ);
  // Two gate leaves, left open (swung inwards).
  place('gate', gate.x0, OUTSIDE_Y, fenceZ, -1.75);
  place('gate', gate.x1, OUTSIDE_Y, fenceZ, Math.PI + 1.75);
  for (const x of [gate.x0, gate.x1]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 1, 0.15).setTranslation(x, 0.5, fenceZ));
  }
  // A low invisible rail along the fence so machines can't drive through it.
  for (const [x0, x1] of [[T.x0, gate.x0], [gate.x1, T.x1]]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.7, 0.1).setTranslation((x0 + x1) / 2, 0.4, fenceZ));
  }

  // ---- the old sign by the gate ----
  addEntranceSign(scene, gate.x1 + 4.5, fenceZ - 1.6);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.7, 1.3, 0.15).setTranslation(gate.x1 + 4.5, 1.2, fenceZ - 1.6));

  // ---- power line along the far side of the road, with a drop to the office ----
  const poleZ = road.z - road.width / 2 - 2.5;
  const spacing = 42;
  const poles = [];
  for (let x = -336; x <= 336; x += spacing) {
    if (place('pole', x, OUTSIDE_Y, poleZ)) poles.push(x);
  }
  const top = OUTSIDE_Y + 8.6;
  const wires = [];
  for (let i = 0; i + 1 < poles.length; i++) {
    for (const dz of [-0.8, 0, 0.8]) {
      wires.push(wire(new THREE.Vector3(poles[i], top, poleZ + dz), new THREE.Vector3(poles[i + 1], top, poleZ + dz), 1.1));
    }
  }
  // Service drop: road pole -> pole inside the site -> office roof.
  const cabin = layout.cabin;
  const inner = new THREE.Vector3(cabin.x - 6, 0, cabin.z - 18);
  if (poles.length && place('pole', inner.x, 0, inner.z, Math.PI / 2)) {
    world.createCollider(RAPIER.ColliderDesc.cylinder(4.5, 0.15).setTranslation(inner.x, 4.5, inner.z));
    const near = poles.reduce((a, b) => (Math.abs(b - inner.x) < Math.abs(a - inner.x) ? b : a));
    wires.push(wire(new THREE.Vector3(near, top, poleZ), new THREE.Vector3(inner.x, 8.6, inner.z), 1.4));
    wires.push(wire(new THREE.Vector3(inner.x, 8.6, inner.z), new THREE.Vector3(cabin.x - 3.5, 3.2, cabin.z - 1.6), 0.8));
  }
  if (wires.length) {
    const cable = new THREE.Mesh(mergeGeometries(wires), new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.5, metalness: 0.6 }));
    scene.add(cable);
  }
}

// A hanging cable between two points, sagging in the middle.
function wire(a, b, sag) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.013, 4, false);
}

// Hand-painted board on two posts, faded by years of sun, with a newer notice stuck on.
function addEntranceSign(scene, x, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.fillStyle = '#e4dccb';
  g.fillRect(0, 0, 1024, 512);
  // Weathering: blotches and streaks.
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 260; i++) {
    const v = 150 + rnd() * 70;
    g.fillStyle = `rgba(${v},${v - 10},${v - 30},${0.05 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(rnd() * 1024, rnd() * 512, 6 + rnd() * 40, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = '#2f5130';
  g.lineWidth = 18;
  g.strokeRect(22, 22, 980, 468);
  g.fillStyle = '#2f5130';
  g.textAlign = 'center';
  g.font = 'bold 120px "Barlow Condensed", Impact, sans-serif';
  g.fillText('ROADSIDE GRAVEL', 512, 175);
  g.font = 'bold 54px "Barlow Condensed", Impact, sans-serif';
  g.fillText('SAND  ·  GRAVEL  ·  HARDCORE  ·  FILL', 512, 262);
  g.font = 'italic 40px Georgia, serif';
  g.fillText('Est. 1971', 512, 330);
  // Rust runs from the bolts.
  for (const bx of [70, 954]) {
    for (const by of [60, 452]) {
      const grad = g.createLinearGradient(0, by, 0, by + 90);
      grad.addColorStop(0, 'rgba(120,60,20,0.8)');
      grad.addColorStop(1, 'rgba(120,60,20,0)');
      g.fillStyle = grad;
      g.fillRect(bx - 4, by, 8, 90);
      g.fillStyle = '#5a4a3a';
      g.beginPath();
      g.arc(bx, by, 9, 0, Math.PI * 2);
      g.fill();
    }
  }
  // "Under new management" strip, a bit crooked.
  g.save();
  g.translate(512, 420);
  g.rotate(-0.035);
  g.fillStyle = '#f5b82e';
  g.fillRect(-300, -34, 600, 68);
  g.fillStyle = '#1b1a17';
  g.font = 'bold 44px "Barlow Condensed", Impact, sans-serif';
  g.fillText('UNDER NEW MANAGEMENT', 0, 16);
  g.restore();
  // Overall fade.
  g.fillStyle = 'rgba(230,225,210,0.12)';
  g.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const edge = new THREE.MeshStandardMaterial({ color: 0x6f6454, roughness: 0.9 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.06), [edge, edge, edge, edge, edge, face]);
  board.position.set(x, OUTSIDE_Y + 1.9, z);
  board.rotation.y = 0.12;
  board.castShadow = true;
  scene.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5b4c3b, roughness: 0.95 });
  for (const px of [-1.3, 1.3]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.12), postMat);
    post.position.set(x + px * Math.cos(0.12), OUTSIDE_Y + 1.4, z + 0.08 - px * Math.sin(0.12));
    post.castShadow = true;
    scene.add(post);
  }
}

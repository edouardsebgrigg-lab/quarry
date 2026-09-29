// Machine models. Uses the Blender models (assets/models/*.glb) when they exist,
// otherwise placeholders built from simple shapes. Each faces +X locally.
import * as THREE from 'three';
import { glbTruck, glbExcavator } from './glbModels.js';
import { rustyMetal } from './textures.js';
import { createHeap } from './piles.js';
import { TRUCK_SHAPE } from './truckPhysics.js';

const TIER_PAINT = {
  rusty: { color: 0xffffff, map: () => rustyMetal('#a8562b'), roughness: 0.85, metalness: 0.3 },
  used: { color: 0xe3a51f, roughness: 0.55, metalness: 0.2 },
  standard: { color: 0xf2c230, roughness: 0.4, metalness: 0.2 },
  heavy: { color: 0xd8d8d0, roughness: 0.4, metalness: 0.3 },
  mega: { color: 0x2e6fd8, roughness: 0.35, metalness: 0.3 },
};

function paint(tier) {
  const p = TIER_PAINT[tier] ?? TIER_PAINT.used;
  return new THREE.MeshStandardMaterial({
    color: p.color, map: p.map?.() ?? null, roughness: p.roughness, metalness: p.metalness,
  });
}

const DARK = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.2 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.55 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.5, metalness: 0.8 });
const TYRE = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- haul truck ----------
export function buildTruckModel(tier) {
  const fromFile = glbTruck(tier);
  if (fromFile) return fromFile;
  const S = TRUCK_SHAPE;
  const body = paint(tier);
  const root = new THREE.Group();

  root.add(box(6.2, 0.3, 1.5, DARK, 0, -0.25, 0)); // frame
  // Cab at the front.
  const cab = new THREE.Group();
  cab.add(box(1.7, 1.5, 2.3, body, 0, 0, 0));
  cab.add(box(0.05, 0.8, 2.0, GLASS, 0.86, 0.25, 0)); // windscreen
  cab.add(box(1.1, 0.7, 0.05, GLASS, 0.1, 0.3, 1.16));
  cab.add(box(1.1, 0.7, 0.05, GLASS, 0.1, 0.3, -1.16));
  cab.add(box(0.1, 0.3, 2.3, DARK, 0.9, -0.55, 0)); // bumper
  for (const z of [-0.85, 0.85]) {
    const light = box(0.06, 0.2, 0.35, new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0x665f40 }), 0.9, -0.3, z);
    cab.add(light);
  }
  cab.add(box(0.12, 1.2, 0.12, STEEL, -0.9, 0.9, -1.0)); // exhaust stack
  cab.position.set(2.25, 0.75, 0);
  root.add(cab);

  // What you see from the driver's seat (the outside cab is hidden then).
  const interior = new THREE.Group();
  interior.add(box(0.45, 0.35, 2.1, DARK, 2.95, 0.6, 0)); // dashboard
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 24), DARK);
  wheel.position.set(2.78, 0.8, -0.5);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.5;
  interior.add(wheel);
  for (const z of [-1.12, 1.12]) interior.add(box(0.05, 0.9, 0.05, DARK, 3.08, 1.15, z)); // pillars
  interior.add(box(1.4, 0.04, 2.3, DARK, 2.1, 1.62, 0)); // roof
  interior.visible = false;
  root.add(interior);

  // Tipping bed hinged at the back.
  const bedPivot = new THREE.Group();
  bedPivot.position.set(-3.1, 0.05, 0);
  const bed = new THREE.Group();
  bed.add(box(4.3, 0.15, 2.3, body, 2.15, 0, 0)); // floor
  bed.add(box(4.3, 1.0, 0.1, body, 2.15, 0.55, 1.1));
  bed.add(box(4.3, 1.0, 0.1, body, 2.15, 0.55, -1.1));
  bed.add(box(0.12, 1.3, 2.3, body, 4.3, 0.7, 0)); // front wall
  bed.add(box(0.1, 0.9, 2.2, body, 0.02, 0.5, 0)); // tailgate
  const heap = createHeap(21);
  heap.position.set(2.15, 0.08, 0);
  heap.visible = false;
  bed.add(heap);
  bedPivot.add(bed);
  root.add(bedPivot);

  const wheels = [];
  const tyreGeo = new THREE.CylinderGeometry(S.wheelRadius, S.wheelRadius, 0.45, 20);
  tyreGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.47, 10);
  hubGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const steerGroup = new THREE.Group();
    const spin = new THREE.Group();
    const tyre = new THREE.Mesh(tyreGeo, TYRE);
    tyre.castShadow = true;
    spin.add(tyre, new THREE.Mesh(hubGeo, STEEL));
    steerGroup.add(spin);
    steerGroup.position.set(S.wheelX[i], S.wheelY, S.wheelZ[i]);
    root.add(steerGroup);
    wheels.push({ steerGroup, spin });
  }

  return {
    root,
    wheels,
    bedPivot,
    // Show the load as a heap inside the bed; fill 0..1.
    setLoad(fill, color) {
      heap.visible = fill > 0.02;
      const f = Math.min(1, fill);
      heap.scale.set(2.0 * Math.sqrt(f) + 0.1, 1.6 * f + 0.1, 1.05);
      if (color) heap.material.color.copy(color);
    },
    // Local position of the bed centre (for "is the bucket over the bed?").
    bedCenter: new THREE.Vector3(-1.0, 0.8, 0),
    bedHalf: { x: 2.2, z: 1.2 },
    cabSeat: new THREE.Vector3(2.3, 1.15, -0.5),
    // Switch between the outside look and the in-cab view.
    setFirstPerson(on) {
      cab.visible = !on;
      interior.visible = on;
    },
  };
}

// ---------- excavator ----------
export function buildExcavatorModel(tier) {
  const fromFile = glbExcavator(tier);
  if (fromFile) return fromFile;
  const body = paint(tier);
  const root = new THREE.Group();

  // Tracks.
  for (const z of [-1.2, 1.2]) {
    const track = box(4.2, 0.85, 0.7, DARK, 0, 0.42, z);
    root.add(track);
    root.add(box(3.6, 0.2, 0.72, STEEL, 0, 0.42, z));
  }
  root.add(box(2.4, 0.5, 1.8, DARK, 0, 0.8, 0));

  // Rotating upper house.
  const house = new THREE.Group();
  house.position.y = 1.05;
  house.add(box(3.2, 1.2, 2.6, body, -0.4, 0.6, 0));
  house.add(box(0.9, 1.1, 2.6, DARK, -2.2, 0.55, 0)); // counterweight
  const cab = new THREE.Group();
  cab.add(box(1.3, 1.6, 1.0, body, 0, 0, 0));
  cab.add(box(0.05, 1.0, 0.85, GLASS, 0.66, 0.2, 0));
  cab.add(box(0.9, 0.8, 0.05, GLASS, 0.05, 0.25, -0.51));
  cab.add(box(0.9, 0.8, 0.05, GLASS, 0.05, 0.25, 0.51));
  cab.position.set(0.55, 2.0, -0.75);
  house.add(cab);

  // In-cab view: window frame, roof, levers.
  const interior = new THREE.Group();
  for (const [x, z] of [[1.18, -1.23], [1.18, -0.27], [-0.08, -1.23], [-0.08, -0.27]]) {
    interior.add(box(0.04, 1.6, 0.04, DARK, x, 2.0, z));
  }
  interior.add(box(1.3, 0.04, 1.0, DARK, 0.55, 2.8, -0.75)); // roof
  interior.add(box(0.5, 0.3, 0.9, DARK, 0.95, 1.35, -0.75)); // console
  for (const z of [-1.1, -0.4]) {
    interior.add(box(0.06, 0.35, 0.06, DARK, 0.7, 1.65, z)); // joysticks
    interior.add(box(0.12, 0.12, 0.12, new THREE.MeshStandardMaterial({ color: 0xaa2222 }), 0.7, 1.85, z));
  }
  interior.visible = false;
  house.add(interior);
  house.add(box(0.12, 1.0, 0.12, STEEL, -1.4, 1.7, 0.8)); // exhaust

  // Arm: boom -> stick -> bucket, each rotating about Z.
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0.9, 1.1, 0.35);
  const boomLen = 3.6;
  boomPivot.add(box(boomLen, 0.45, 0.4, body, boomLen / 2, 0, 0));
  const stickPivot = new THREE.Group();
  stickPivot.position.set(boomLen, 0, 0);
  const stickLen = 2.6;
  stickPivot.add(box(stickLen, 0.32, 0.3, body, stickLen / 2, 0, 0));
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(stickLen, 0, 0);
  const bucket = new THREE.Group();
  bucket.add(box(0.9, 0.12, 1.0, STEEL, 0.45, -0.3, 0));
  bucket.add(box(0.12, 0.7, 1.0, STEEL, 0.9, 0, 0));
  bucket.add(box(0.9, 0.7, 0.08, STEEL, 0.45, 0, 0.5));
  bucket.add(box(0.9, 0.7, 0.08, STEEL, 0.45, 0, -0.5));
  const scoop = createHeap(31);
  scoop.position.set(0.45, -0.25, 0);
  scoop.scale.set(0.45, 0.6, 0.45);
  scoop.visible = false;
  bucket.add(scoop);
  bucketPivot.add(bucket);
  stickPivot.add(bucketPivot);
  boomPivot.add(stickPivot);
  house.add(boomPivot);
  root.add(house);

  return {
    root,
    house,
    boomPivot,
    stickPivot,
    bucketPivot,
    setBucketLoad(full, color) {
      scoop.visible = full;
      if (color) scoop.material.color.copy(color);
    },
    cabSeat: new THREE.Vector3(0.55, 2.45, -0.75), // in house space
    rams: [], // the simple stand-in has no moving rams or tracks
    bucketLink: null,
    trackShoe: null,
    trackChain: null,
    trackWheels: null,
    setFirstPerson(on) {
      cab.visible = !on;
      interior.visible = on;
    },
  };
}

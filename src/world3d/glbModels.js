// Loads the Blender-made machine models (assets/models/*.glb, listed in manifest.json)
// and wraps them with the same interface as the placeholder models in models.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHeap } from './piles.js';
import { weatherModel } from './weathering.js';
import { addDecals } from './decals.js';

const OPEN_SURFACE = /(^|_)Rims$/; // materials on open (one-sided) surfaces

// The sheds' wall cladding is painted steel, but is exported 40% metallic and so mirrors the
// sky, and its colour is pale enough to read mint; painted and weathered, it's darker and dull.
function paintedCladding(material) {
  if (!/(?:^|_)Cladding$/.test(material?.name ?? '') || material.userData.painted) return;
  material.userData.painted = true;
  material.metalness = 0.12;
  material.roughness = Math.max(material.roughness, 0.7);
  material.color.multiplyScalar(0.55); // (a weathered green-grey, not pastel)
}

// Lamps are exported glowing; by day they're switched off: a clear lens over a silver
// reflector, a dark red tail lens, and the beacon (it turns while the machine works) a bit less
// blinding.
// The black plastic and rubber of cab interiors, frames and trim is exported mid grey and reads
// blue-grey under the sky; real dashboards and pillars are near charcoal.
function blackTrim(material) {
  if (!/(?:^|_)Black$/.test(material?.name ?? '') || material.userData.trim) return;
  material.userData.trim = true;
  material.color.multiplyScalar(0.16); // (linear: about 45% as bright to the eye)
  material.roughness = Math.max(material.roughness, 0.72);
  material.envMapIntensity = 0.5;
}

const LAMPS = { Headlight: { color: 0xd8dcdf, emissive: 0.06, metalness: 0.55, roughness: 0.06 }, TailLight: { emissive: 0.18 }, Beacon: { emissive: 0.6 } };
function daylightLamp(material) {
  const kind = /(?:^|_)(Headlight|TailLight|Beacon)$/.exec(material?.name ?? '')?.[1];
  const lamp = kind && LAMPS[kind];
  if (!lamp || material.userData.daylight) return;
  material.userData.daylight = true;
  if (lamp.color !== undefined) material.color.setHex(lamp.color);
  material.emissiveIntensity *= lamp.emissive;
  if (lamp.metalness !== undefined) material.metalness = lamp.metalness;
  if (lamp.roughness !== undefined) material.roughness = lamp.roughness;
}

const cache = new Map(); // "truck_used" -> THREE.Object3D (the loaded scene)

// onProgress(fraction 0..1) follows the downloads, for the loading card.
export async function preloadModels({ onProgress } = {}) {
  let names = [];
  try {
    const res = await fetch('models/manifest.json');
    if (res.ok) names = (await res.json()).models ?? [];
  } catch {
    return; // no models yet: placeholders are used
  }
  const loader = new GLTFLoader();
  const todo = names.filter((n) => !cache.has(n));
  const part = new Map(todo.map((n) => [n, 0])); // how much of each file has arrived
  const report = () => onProgress?.([...part.values()].reduce((a, b) => a + b, 0) / Math.max(1, todo.length));
  await Promise.all(todo.map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`models/${name}.glb`, (e) => {
        if (e.total > 0) {
          part.set(name, Math.min(0.99, e.loaded / e.total));
          report();
        }
      });
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          // The tractor's wheel discs are open surfaces facing inward on one side: draw both
          // sides, or you see straight through the left-hand wheels.
          if (OPEN_SURFACE.test(o.material?.name ?? '')) o.material.side = THREE.DoubleSide;
          daylightLamp(o.material);
          blackTrim(o.material);
          paintedCladding(o.material);
        }
      });
      weatherModel(gltf.scene, name); // machines only: rust, chips, fade and mud by tier
      addDecals(gltf.scene, name); // lettering, hazard chevrons, warning stickers, number plates
      cache.set(name, gltf.scene);
    } catch (err) {
      console.warn(`Could not load model ${name}:`, err);
    }
    part.set(name, 1);
    report();
  }));
}

// The loaded scene for a model file name (e.g. "truck_used"), or null. (Shared: clone it.)
export const modelScene = (name) => cache.get(name) ?? null;

function instance(name) {
  const scene = cache.get(name);
  if (!scene) return null;
  const root = new THREE.Group();
  root.add(scene.clone(true));
  shadeInterior(root);
  return root;
}

// Sky light reaches everything in three.js, even inside a roofed cab. Turn it down on
// interior parts so the cab reads as a shaded space.
const shadedMaterials = new Map();
function shadeInterior(root) {
  const interior = root.getObjectByName('Interior');
  interior?.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const shaded = mats.map((m) => {
      if (!shadedMaterials.has(m)) {
        const c = m.clone();
        c.envMapIntensity = 0.12;
        shadedMaterials.set(m, c);
      }
      return shadedMaterials.get(m);
    });
    o.material = Array.isArray(o.material) ? shaded : shaded[0];
  });
}

const node = (root, name) => {
  const n = root.getObjectByName(name);
  if (!n) throw new Error(`Model is missing the "${name}" part`);
  return n;
};

export function glbTruck(tier) {
  const root = instance(`truck_${tier}`);
  if (!root) return null;
  const wheels = [0, 1, 2, 3].map((i) => {
    const w = node(root, `Wheel${i}`);
    w.rotation.order = 'YXZ'; // steer about Y, then spin about the axle
    return { steerGroup: w, spin: w };
  });
  const bedPivot = node(root, 'BedPivot');
  const heap = createHeap(21);
  heap.position.set(2.15, 0.1, 0);
  heap.visible = false;
  bedPivot.add(heap);
  return {
    root,
    wheels,
    bedPivot,
    setLoad(fill, color) {
      heap.visible = fill > 0.02;
      const f = Math.min(1, fill);
      heap.scale.set(2.0 * Math.sqrt(f) + 0.1, 1.6 * f + 0.1, 1.0);
      if (color) heap.material.color.copy(color);
    },
    bedCenter: new THREE.Vector3(-1.0, 0.8, 0),
    bedHalf: { x: 2.2, z: 1.2 },
    cabSeat: new THREE.Vector3(2.3, 1.15, -0.5),
    // The cab shell and glass are one-sided, so from the seat you see out through them.
    setFirstPerson() {},
  };
}

// Your pickup (vehicle_pickup.glb): origin on the ground, so it's lowered to sit under the
// physics body's centre (`rideHeight` above the ground).
export function glbPickup(rideHeight) {
  const inner = instance('vehicle_pickup');
  if (!inner) return null;
  inner.position.y = -rideHeight;
  const root = new THREE.Group();
  root.add(inner);
  const wheels = [0, 1, 2, 3].map((i) => {
    const w = node(inner, `Wheel${i}`);
    w.rotation.order = 'YXZ';
    return { steerGroup: w, spin: w };
  });
  const tailgate = node(inner, 'TailgatePivot');
  const floorY = 0.86 - rideHeight;
  const heap = createHeap(23);
  heap.position.set(-1.5, floorY, 0);
  heap.visible = false;
  root.add(heap);
  return {
    root,
    wheels,
    bedPivot: null,
    tailgate,
    wheelOffsetY: rideHeight, // the wheels sit inside the lowered model
    // Show the load as a heap in the bed; fill 0..1.
    setLoad(fill, color) {
      heap.visible = fill > 0.02;
      const f = Math.min(1, fill);
      heap.scale.set(1.0 * Math.sqrt(f) + 0.1, 0.75 * f + 0.05, 0.72);
      if (color) heap.material.color.copy(color);
    },
    bedCenter: new THREE.Vector3(-1.5, floorY + 0.2, 0),
    bedHalf: { x: 1.1, z: 0.8 },
    bedFloorY: floorY,
    tailgateLocal: new THREE.Vector3(-2.7, floorY, 0), // the middle of the open tailgate
    cabSeat: new THREE.Vector3(0.18, 1.45 - rideHeight, -0.45), // driver's eyes (left-hand drive)
    exhaustLocal: new THREE.Vector3(-2.75, 0.3 - rideHeight, 0.35),
    setFirstPerson() {},
  };
}

// A digger's bucket link turns with the bucket, at this share of its angle.
export const LINK_RATIO = 0.55;
export const LINK_OFFSET = 1.9;

// Points each ram's barrel and rod at each other, so they follow the arm (they turn on their
// pins). Call with the model's world matrices up to date.
export function aimRams(rams) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const { barrel, rod } of rams) {
    for (const [obj, other] of [[barrel, rod], [rod, barrel]]) {
      other.getWorldPosition(a);
      obj.parent.worldToLocal(b.copy(a));
      obj.rotation.z = Math.atan2(b.y - obj.position.y, b.x - obj.position.x);
    }
  }
}

const diggerRams = (root) => ['BoomRam', 'StickRam', 'BucketRam']
  .map((n) => ({ barrel: root.getObjectByName(n), rod: root.getObjectByName(`${n}Rod`) }))
  .filter((r) => r.barrel && r.rod);

// Sets a digger model's arm to joint angles [boom, stick, bucket] with its rams lined up
// (for photos: the models are saved with the arm straight out).
export function poseDigger(root, [boom, stick, bucket]) {
  const boomPivot = root.getObjectByName('Boom');
  if (!boomPivot) return;
  boomPivot.rotation.z = boom;
  root.getObjectByName('Stick').rotation.z = stick;
  root.getObjectByName('Bucket').rotation.z = bucket;
  const link = root.getObjectByName('BucketLink');
  if (link) link.rotation.z = LINK_RATIO * bucket + LINK_OFFSET;
  root.updateMatrixWorld(true);
  aimRams(diggerRams(root));
}

// The diggers (excavator, mini digger) share their parts: House, Boom, Stick, Bucket and the rams.
function diggerFromFile(name, { cabSeat, scoop }) {
  const root = instance(name);
  if (!root) return null;
  const bucketPivot = node(root, 'Bucket');
  const heap = createHeap(31);
  heap.position.set(...scoop.pos);
  heap.scale.set(...scoop.scale);
  heap.visible = false;
  bucketPivot.add(heap);
  const opt = (n) => root.getObjectByName(n) ?? null;
  const rams = diggerRams(root);
  let shoeMesh = null;
  opt('TrackShoe')?.traverse((o) => { if (o.isMesh && !shoeMesh) shoeMesh = o; });
  return {
    root,
    house: node(root, 'House'),
    boomPivot: node(root, 'Boom'),
    stickPivot: node(root, 'Stick'),
    bucketPivot,
    bucketLink: opt('BucketLink'),
    rams,
    trackShoe: shoeMesh,
    trackChain: opt('Tracks'),
    trackWheels: { L: [opt('TrackWheelL0'), opt('TrackWheelL1')], R: [opt('TrackWheelR0'), opt('TrackWheelR1')] },
    setBucketLoad(full, color) {
      heap.visible = full;
      if (color) heap.material.color.copy(color);
    },
    cabSeat, // in house space
    setFirstPerson() {},
  };
}

export const glbExcavator = (tier) => diggerFromFile(`excavator_${tier}`, {
  cabSeat: new THREE.Vector3(0.4, 1.42, -0.72), scoop: { pos: [0.45, -0.25, 0], scale: [0.38, 0.55, 0.38] },
});
export const glbMiniDigger = (tier) => diggerFromFile(`minidigger_${tier}`, {
  cabSeat: new THREE.Vector3(-0.05, 1.44, 0), scoop: { pos: [0.2, -0.11, 0], scale: [0.17, 0.25, 0.17] },
});

// Track parts shared by the tracked machines.
function trackParts(root) {
  const opt = (n) => root.getObjectByName(n) ?? null;
  let shoeMesh = null;
  opt('TrackShoe')?.traverse((o) => { if (o.isMesh && !shoeMesh) shoeMesh = o; });
  return {
    trackShoe: shoeMesh,
    trackChain: opt('Tracks'),
    trackWheels: { L: [opt('TrackWheelL0'), opt('TrackWheelL1')], R: [opt('TrackWheelR0'), opt('TrackWheelR1')] },
  };
}

// The site dumper: tracks, and a skip that tips forward about SkipPivot.
export function glbDumper(tier) {
  const root = instance(`dumper_${tier}`);
  if (!root) return null;
  const skipPivot = node(root, 'SkipPivot');
  const heap = createHeap(27);
  heap.position.set(-0.55, 0.05, 0);
  heap.visible = false;
  skipPivot.add(heap);
  return {
    root,
    skipPivot,
    ...trackParts(root),
    setLoad(fill, color) {
      heap.visible = fill > 0.02;
      const f = Math.min(1, fill);
      heap.scale.set(0.5 * Math.sqrt(f) + 0.05, 0.42 * f + 0.03, 0.4);
      if (color) heap.material.color.copy(color);
    },
    // In the model's frame: the skip's middle, where a bucket or shovel drops in, and its front lip.
    bedCenter: new THREE.Vector3(0.67, 0.85, 0),
    bedHalf: { x: 0.6, z: 0.5 },
    lipLocal: new THREE.Vector3(1.2, 0.6, 0),
    cabSeat: new THREE.Vector3(-0.55, 1.75, 0),
    exhaustLocal: new THREE.Vector3(-0.75, 1.25, 0.32),
    setFirstPerson() {},
  };
}

// The tractor (tractor_<tier>.glb): origin on the ground between the axles, lowered to sit
// under the physics body's centre like the pickup. The trailer is a separate model.
export function glbTractor(tier, rideHeight) {
  const inner = instance(`tractor_${tier}`);
  if (!inner) return null;
  inner.position.y = -rideHeight;
  const root = new THREE.Group();
  root.add(inner);
  const wheels = [0, 1, 2, 3].map((i) => {
    const w = node(inner, `Wheel${i}`);
    w.rotation.order = 'YXZ';
    return { steerGroup: w, spin: w };
  });
  return {
    root,
    wheels,
    wheelOffsetY: rideHeight,
    hitchLocal: new THREE.Vector3(-1.32, 0.5 - rideHeight, 0),
    cabSeat: new THREE.Vector3(-0.9, 2.0 - rideHeight, 0),
    exhaustLocal: new THREE.Vector3(1.15, 1.9 - rideHeight, 0.2),
    setFirstPerson() {},
  };
}

// The tipping trailer (trailer_<tier>.glb): origin on the ground under the axle; the drawbar
// eye is 3.3 m ahead of it. The bed tips about BedPivot (its rear hinge), and the tailgate
// hangs from TailgatePivot.
export function glbTrailer(tier) {
  const root = instance(`trailer_${tier}`);
  if (!root) return null;
  const wheels = [0, 1].map((i) => node(root, `Wheel${i}`));
  const bedPivot = node(root, 'BedPivot');
  const tailgatePivot = node(root, 'TailgatePivot');
  const heap = createHeap(29);
  heap.position.set(1.9, 0.03, 0);
  heap.visible = false;
  bedPivot.add(heap);
  return {
    root,
    wheels,
    bedPivot,
    tailgatePivot,
    setLoad(fill, color) {
      heap.visible = fill > 0.02;
      const f = Math.min(1, fill);
      heap.scale.set(1.75 * Math.sqrt(f) + 0.1, 0.85 * f + 0.04, 0.85);
      if (color) heap.material.color.copy(color);
    },
    bedCenter: new THREE.Vector3(0.2, 1.3, 0),
    bedHalf: { x: 1.9, z: 0.95 },
    bedFloorY: 1.0,
    tailgateLocal: new THREE.Vector3(-1.75, 1.0, 0),
    eyeLocal: new THREE.Vector3(3.3, 0.5, 0),
    axleLength: 3.3,
  };
}

// A site prop (office, fuel tank, block, boulder1..3, cone), or null if not modelled.
export function glbProp(name) {
  return instance(`prop_${name}`);
}

// Loads the Blender-made machine models (assets/models/*.glb, listed in manifest.json)
// and wraps them with the same interface as the placeholder models in models.js.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHeap } from './piles.js';

const cache = new Map(); // "truck_used" -> THREE.Object3D (the loaded scene)

export async function preloadModels() {
  let names = [];
  try {
    const res = await fetch('models/manifest.json');
    if (res.ok) names = (await res.json()).models ?? [];
  } catch {
    return; // no models yet: placeholders are used
  }
  const loader = new GLTFLoader();
  await Promise.all(names.filter((n) => !cache.has(n)).map(async (name) => {
    try {
      const gltf = await loader.loadAsync(`models/${name}.glb`);
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      cache.set(name, gltf.scene);
    } catch (err) {
      console.warn(`Could not load model ${name}:`, err);
    }
  }));
}

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

export function glbExcavator(tier) {
  const root = instance(`excavator_${tier}`);
  if (!root) return null;
  const bucketPivot = node(root, 'Bucket');
  const scoop = createHeap(31);
  scoop.position.set(0.45, -0.25, 0);
  scoop.scale.set(0.38, 0.55, 0.38);
  scoop.visible = false;
  bucketPivot.add(scoop);
  return {
    root,
    house: node(root, 'House'),
    boomPivot: node(root, 'Boom'),
    stickPivot: node(root, 'Stick'),
    bucketPivot,
    setBucketLoad(full, color) {
      scoop.visible = full;
      if (color) scoop.material.color.copy(color);
    },
    cabSeat: new THREE.Vector3(0.4, 1.42, -0.72), // in house space
    setFirstPerson() {},
  };
}

// A site prop (office, fuel tank, block, boulder1..3, cone), or null if not modelled.
export function glbProp(name) {
  return instance(`prop_${name}`);
}

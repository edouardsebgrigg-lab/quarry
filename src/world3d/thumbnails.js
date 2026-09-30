// "Product photos" of the machines for the laptop's plant dealer: each model rendered once in a
// small studio (soft room light, a key light, a shadow on the floor), three-quarter view, on a
// transparent background. Uses its own small renderer; call dispose() when the laptop closes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { modelScene } from './glbModels.js';

// Which model files make up each machine type (the tractor comes with its trailer).
const FILES = {
  miniDigger: ['minidigger'],
  excavator: ['excavator'],
  dumper: ['dumper'],
  truck: ['truck'],
  tractor: ['tractor', 'trailer'],
  pickup: ['vehicle_pickup'], // (one model for every tier)
};
const TRAILER_OFFSET = -1.32; // the trailer's origin sits this far behind the tractor's

const photos = new Map(); // "truck_used" -> data URL (kept between laptop visits)

export function createThumbnails({ width = 480, height = 300 } = {}) {
  let renderer = null;
  let scene = null;
  let camera = null;

  function setup() {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(6, 10, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
    key.shadow.radius = 4;
    scene.add(key, key.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 200);
  }

  function build(type, tier) {
    const files = FILES[type];
    if (!files) return null;
    const group = new THREE.Group();
    files.forEach((f, i) => {
      const src = modelScene(f.startsWith('vehicle_') ? f : `${f}_${tier}`);
      if (!src) return;
      const part = src.clone(true);
      if (i === 1) part.position.x = TRAILER_OFFSET;
      group.add(part);
    });
    if (!group.children.length) return null;
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    // Stand it on the floor, centred.
    const box = new THREE.Box3().setFromObject(group);
    const centre = box.getCenter(new THREE.Vector3());
    group.position.x -= centre.x;
    group.position.z -= centre.z;
    group.position.y -= box.min.y;
    return group;
  }

  return {
    // A data URL for the machine, or null if its model isn't loaded.
    photo(type, tier) {
      const key = `${type}_${tier}`;
      if (photos.has(key)) return photos.get(key);
      const group = build(type, tier);
      if (!group) return null;
      if (!renderer) setup();
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      // Three-quarter view from the front left, a little above, filling most of the frame.
      const dir = new THREE.Vector3(1, 0.42, 0.95).normalize();
      const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.7;
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.lookAt(sphere.center.x, sphere.center.y * 0.8, sphere.center.z);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      scene.remove(group);
      photos.set(key, url);
      return url;
    },
    dispose() {
      if (!renderer) return;
      scene.environment?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    },
  };
}

// "Product photos" of the machines for the laptop's plant dealer: each model rendered once in a
// small studio (soft room light, a key light, a shadow on the floor), three-quarter view, on a
// transparent background. Uses its own small renderer; call dispose() when the laptop closes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { modelScene, poseDigger } from './glbModels.js';

// Which model files make up each machine type (the tractor comes with its trailer).
const FILES = {
  miniDigger: ['minidigger'],
  excavator: ['excavator'],
  dumper: ['dumper'],
  truck: ['truck'],
  tractor: ['tractor', 'trailer'],
  pickup: ['vehicle_pickup'], // (one model for every tier)
};
const TRAILER_OFFSET = -1.32 - 3.3; // the trailer's origin (its axle) sits this far behind the tractor's
// Diggers pose like a dealer's photo: boom up, stick in, bucket curled (the game's carry pose).
const DIGGER_POSE = [0.55, -1.6, -1.3];

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
    const parts = files.map((f) => modelScene(f.startsWith('vehicle_') ? f : `${f}_${tier}`)?.clone(true) ?? null);
    parts.forEach((part) => part && group.add(part));
    // A trailer hangs off the tractor's hitch by its towing eye, as in the game (glbModels.js:
    // the hitch is 1.32 m behind the tractor's origin, the eye 3.3 m ahead of the trailer's).
    if (parts[1]) parts[1].position.x = TRAILER_OFFSET;
    if (parts[0] && (type === 'miniDigger' || type === 'excavator')) poseDigger(parts[0], DIGGER_POSE);
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
    // A data URL for the machine, or null if its model isn't loaded. `view` (optional) turns the
    // camera: { yaw (radians around the machine), pitch, zoom } — for model reviews.
    photo(type, tier, view = null) {
      const key = `${type}_${tier}${view ? JSON.stringify(view) : ''}`;
      if (photos.has(key)) return photos.get(key);
      const group = build(type, tier);
      if (!group) return null;
      if (!renderer) setup();
      scene.add(group);
      const box = new THREE.Box3().setFromObject(group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      // Three-quarter view from the front left, a little above, filling most of the frame.
      const yaw = view?.yaw ?? Math.atan2(0.95, 1);
      const pitch = view?.pitch ?? 0.3;
      const dir = new THREE.Vector3(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
      const dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.7 * (view?.zoom ?? 1);
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

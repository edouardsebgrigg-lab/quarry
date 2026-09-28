// Renderer, sky, sunlight, fog, and scenery outside the quarry (grass, hills, trees).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { grass } from './textures.js';

const QUALITY = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 1024, trees: 150 },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 1024, trees: 350 },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, trees: 700 },
  ultra: { pixelRatio: 2, shadows: true, shadowMap: 4096, trees: 1200 },
};

export function createRenderer(canvas, quality) {
  const q = QUALITY[quality] ?? QUALITY.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return { renderer, q };
}

// `site` is the rectangle covered by the quarry terrain ({ x0, x1, z0, z1 }).
export function createEnvironment(scene, renderer, q, site) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(210));

  // Physically-based sky dome.
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Image-based lighting from the sky, so metal and rock pick up realistic ambient light.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  scene.environment = pmrem.fromScene(envScene, 0, 1, 20000).texture;
  scene.environmentIntensity = 0.55;

  scene.fog = new THREE.Fog(0xc9d6df, 120, 900);

  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x6b5a40, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = q.shadows;
  sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
  const s = 70;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Grass beyond the quarry: four strips around the site, so it never covers the pits.
  const grassTex = grass();
  grassTex.repeat.set(10, 10);
  const R = 1500;
  const s0 = site;
  for (const [x0, x1, z0, z1] of [
    [-R, R, -R, s0.z0], [-R, R, s0.z1, R], [-R, s0.x0, s0.z0, s0.z1], [s0.x1, R, s0.z0, s0.z1],
  ]) {
    const w = x1 - x0;
    const d = z1 - z0;
    const tex = grassTex.clone();
    tex.repeat.set(w / 10, d / 10);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((x0 + x1) / 2, -0.3, (z0 + z1) / 2);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  addHills(scene);
  addTrees(scene, q.trees);

  return {
    // Keep the shadow area centred on whatever the camera is looking at.
    follow(target) {
      sun.position.copy(target).addScaledVector(sunDir, 120);
      sun.target.position.copy(target);
    },
  };
}

function addHills(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5f7040, roughness: 1, flatShading: true });
  const rnd = mulberry(7);
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + rnd() * 0.2;
    const dist = 520 + rnd() * 280;
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const hill = new THREE.Mesh(geo, mat);
    hill.scale.set(120 + rnd() * 160, 40 + rnd() * 70, 120 + rnd() * 160);
    hill.position.set(Math.cos(angle) * dist, -10, Math.sin(angle) * dist);
    scene.add(hill);
  }
}

function addTrees(scene, count) {
  const rnd = mulberry(11);
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
  const leafGeo = new THREE.ConeGeometry(2.2, 7, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a24, roughness: 1, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  leaves.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    let x;
    let z;
    do {
      x = (rnd() - 0.5) * 900;
      z = (rnd() - 0.5) * 900;
      // Keep trees off the quarry site itself.
    } while (x > -110 && x < 125 && z > -85 && z < 85);
    const s = 0.7 + rnd() * 0.8;
    sc.set(s, s, s);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    m.compose(new THREE.Vector3(x, 1.2 * s, z), q, sc);
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, 5.5 * s, z), q, sc);
    leaves.setMatrixAt(i, m);
  }
  scene.add(trunks, leaves);
}

function mulberry(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

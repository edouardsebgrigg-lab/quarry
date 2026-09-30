// Renderer, sky, sunlight, fog, and scenery outside the quarry (grass, hills, trees).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createGroundMaterial, paintGround } from './groundMaterial.js';

// ao: ambient occlusion (soft contact shadows where things meet), worked out at half or full
// resolution; softShadows: blurred shadow edges.
const QUALITY = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 1024, softShadows: false, ao: false },
  medium: { pixelRatio: 1, shadows: true, shadowMap: 1024, softShadows: true, ao: false },
  high: { pixelRatio: 1.5, shadows: true, shadowMap: 2048, softShadows: true, ao: 'half' },
  ultra: { pixelRatio: 2, shadows: true, shadowMap: 4096, softShadows: true, ao: 'full' },
};

export function createRenderer(canvas, quality) {
  const q = QUALITY[quality] ?? QUALITY.high;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  return { renderer, q };
}

// Draws each frame: straight to the screen, or (with ambient occlusion) through a small
// post-processing chain: the scene into an anti-aliased HDR target, GTAO, then tone mapping.
export function createFrameRenderer(renderer, scene, camera, q) {
  if (!q.ao) {
    return { render: () => renderer.render(scene, camera), setSize() {}, dispose() {} };
  }
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const ao = new ContactAOPass(scene, camera, 1, 1);
  ao.scale = q.ao === 'half' ? 0.5 : 1;
  ao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.5, thickness: 1.2, distanceFallOff: 1, scale: 1, samples: 12 });
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
  ao.blendIntensity = 0.85;
  composer.addPass(ao);
  composer.addPass(new OutputPass());
  composer.setSize(Math.max(1, size.x), Math.max(1, size.y));
  return {
    render: () => composer.render(),
    // (CSS size; the composer applies the renderer's pixel ratio)
    setSize: (w, h) => composer.setSize(Math.max(1, w), Math.max(1, h)),
    dispose() {
      composer.dispose();
      ao.dispose();
    },
  };
}

// GTAO, minus anything see-through: its depth and normal pass draws every mesh as solid, so
// grass cards, leaves, glass and effects would otherwise cast dark rectangles.
class ContactAOPass extends GTAOPass {
  // (at half resolution on "high": a quarter of the work, and the blur hides the difference)
  setSize(width, height) {
    const k = this.scale ?? 1;
    super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
  }

  _overrideVisibility() {
    super._overrideVisibility();
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible || o.isPoints || o.isLine || o.isLine2) return;
      if (o.userData.noAO || (o.material && seeThrough(o.material))) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}
const seeThrough = (m) => (Array.isArray(m) ? m.some(seeThrough) : m.transparent || m.alphaTest > 0 || m.isShaderMaterial);

// `site` is the rectangle covered by the map's own terrain ({ x0, x1, z0, z1 }); beyond it
// there's flat farmland (at `outsideY`) running out to hills on the horizon.
export function createEnvironment(scene, renderer, q, site, { outsideY = -0.3, hillDistance = [480, 900] } = {}) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(210));

  // Physically-based sky dome.
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const u = sky.material.uniforms;
  // (a clear English summer day: blue overhead, a light haze on the horizon, not a milky sky)
  u.turbidity.value = 2.6;
  u.rayleigh.value = 1.1;
  u.mieCoefficient.value = 0.003;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);

  // Image-based lighting from the sky, so metal and rock pick up realistic ambient light.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  scene.environment = pmrem.fromScene(envScene, 0, 1, 20000).texture;
  scene.environmentIntensity = 0.55;

  scene.fog = new THREE.Fog(0xc9d6df, 160, Math.max(900, hillDistance[1] * 0.75));

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

  // Grass beyond the map: four strips around it.
  const ground = createGroundMaterial();
  const R = Math.max(1500, hillDistance[1] * 1.6);
  const s0 = site;
  for (const [x0, x1, z0, z1] of [
    [-R, R, -R, s0.z0], [-R, R, s0.z1, R], [-R, s0.x0, s0.z0, s0.z1], [s0.x1, R, s0.z0, s0.z1],
  ]) {
    const strip = new THREE.Mesh(paintGround(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2)), ground);
    strip.position.set((x0 + x1) / 2, outsideY, (z0 + z1) / 2);
    strip.receiveShadow = true;
    scene.add(strip);
  }

  const hills = addHills(scene, ground, hillDistance, outsideY, Math.max(Math.abs(s0.x0), s0.x1, Math.abs(s0.z0), s0.z1) + 60);

  // Overcast: a grey dome over the sky that fades in with the cloud. It's the fog's colour at the
  // horizon (written the same way the fog is, so distant hills melt into it) and a little
  // darker overhead. The sky shader alone can't go grey.
  const overcastMat = new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 }, uHorizon: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // (always at the back, like the sky)
      }`,
    fragmentShader: `uniform float uAmount; uniform vec3 uHorizon; varying vec3 vDir;
      void main() {
        float up = smoothstep(-0.02, 0.6, vDir.y);
        gl_FragColor = vec4(uHorizon * mix(1.0, 0.78, up), uAmount);
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, toneMapped: false,
  });
  const overcast = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), overcastMat);
  overcast.renderOrder = -1;
  overcast.frustumCulled = false;
  overcast.visible = false;
  overcast.userData.noAO = true;
  scene.add(overcast);

  // The weather eases in: { cloud 0..1, rain 0..1 } targets, followed a little each frame.
  const clear = { turbidity: u.turbidity.value, rayleigh: u.rayleigh.value, mie: u.mieCoefficient.value, sun: sun.intensity, hemi: hemi.intensity, env: scene.environmentIntensity, fogNear: scene.fog.near, fogFar: scene.fog.far };
  const fogClear = scene.fog.color.clone();
  const fogGrey = new THREE.Color(0x9ba4ad);
  const now = { cloud: 0, rain: 0 };

  return {
    weather(dt, { cloud = 0, rain = 0 }) {
      const k = Math.min(1, dt * 0.25);
      now.cloud += (cloud - now.cloud) * k;
      now.rain += (rain - now.rain) * k;
      const c = now.cloud;
      const r = now.rain;
      u.turbidity.value = clear.turbidity + c * 7;
      u.rayleigh.value = clear.rayleigh + c * 1.6;
      u.mieCoefficient.value = clear.mie + c * 0.012;
      sun.intensity = clear.sun * (1 - 0.72 * c);
      hemi.intensity = clear.hemi * (1 + 0.6 * c);
      scene.environmentIntensity = clear.env * (1 - 0.3 * c);
      scene.fog.color.copy(fogClear).lerp(fogGrey, c);
      overcastMat.uniforms.uAmount.value = Math.min(1, c * 1.05);
      overcastMat.uniforms.uHorizon.value.copy(scene.fog.color);
      overcast.visible = c > 0.02;
      scene.fog.near = clear.fogNear * (1 - 0.65 * r);
      scene.fog.far = clear.fogFar * (1 - 0.55 * r);
      return now;
    },
    // Height of the countryside outside the site (grass level, or up a hill).
    groundHeight(x, z) {
      let h = -0.3;
      for (const hl of hills) {
        const dx = (x - hl.x) / hl.sx;
        const dz = (z - hl.z) / hl.sz;
        const k = 1 - dx * dx - dz * dz;
        if (k > 0) h = Math.max(h, hl.y + hl.sy * Math.sqrt(k) * 0.97);
      }
      return h;
    },
    // Keep the shadow area centred on whatever the camera is looking at.
    follow(target) {
      sun.position.copy(target).addScaledVector(sunDir, 120);
      sun.target.position.copy(target);
    },
  };
}

// Rolling farmland hills on the horizon: smooth lumps with the same grass as the ground. Each
// one is pushed out until it's clear of the square `keepOut` (the map and a margin), so none
// pokes up through the countryside you can walk on.
function addHills(scene, material, [near, far], baseY, keepOut) {
  const rnd = mulberry(7);
  const hills = [];
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2 + rnd() * 0.3;
    const want = near + rnd() * (far - near);
    const geo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const p = geo.attributes.position;
    const seed = rnd() * 10;
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v);
      const z = p.getZ(v);
      const bump = 1 + 0.18 * Math.sin(x * 3 + seed) * Math.cos(z * 2.5 - seed)
        + 0.08 * Math.sin(x * 7.3 - seed * 2) * Math.sin(z * 6.1 + seed);
      p.setY(v, p.getY(v) * bump);
    }
    geo.computeVertexNormals();
    paintGround(geo, [0.85, 0.15, 0, 0], [0.92, 0.95, 0.88]);
    const hill = new THREE.Mesh(geo, material);
    const k = Math.max(1, want / 700); // further hills are bigger, so they still show
    hill.scale.set((180 + rnd() * 260) * k, (14 + rnd() * 36) * k, (160 + rnd() * 240) * k);
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    // Far enough out along its bearing that its footprint clears the square on one axis.
    const clearX = Math.abs(c) > 1e-3 ? (keepOut + hill.scale.x) / Math.abs(c) : Infinity;
    const clearZ = Math.abs(sn) > 1e-3 ? (keepOut + hill.scale.z) / Math.abs(sn) : Infinity;
    const dist = Math.max(want, Math.min(clearX, clearZ));
    hill.position.set(c * dist, baseY - 2, sn * dist);
    scene.add(hill);
    hills.push({ x: hill.position.x, z: hill.position.z, y: baseY - 2, sx: hill.scale.x, sy: hill.scale.y, sz: hill.scale.z });
  }
  return hills;
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

// Tyre marks: the tracks wheels leave, drawn as thin quads laid along each wheel's path. The
// ground's own wear (ground.js) is the physical, saved record, but its cells are half a metre
// across; this is what you see at a tyre's width: flattened tracks over grass, darker ones
// through mud and soil, grey lines on gravel, and on tarmac black rubber only where a wheel
// locked or spun. One draw for all of them; the oldest fade away as new ones take their place.
import * as THREE from 'three';

// A tread print: blocks across the tyre, a little irregular, soft at the edges.
function treadTexture() {
  const w = 64;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {
    for (const [x0, x1, shift] of [[6, 29, 0], [35, 58, 8]]) {
      const v = 150 + Math.random() * 90;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x0, (y + shift) % h, x1 - x0, 10);
    }
  }
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(70,70,70,1)'; // (the whole width is pressed down a little)
  g.fillRect(4, 0, w - 8, h);
  // Soft edges across the tyre.
  g.globalCompositeOperation = 'destination-in';
  const edge = g.createLinearGradient(0, 0, w, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(0.12, 'rgba(0,0,0,1)');
  edge.addColorStop(0.88, 'rgba(0,0,0,1)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = edge;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createTyreMarks(scene, { max = 4000 } = {}) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // flat; length along x
  // (the tread runs along the mark: turn the texture so its v follows x)
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const birth = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  const length = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  geometry.setAttribute('aStrength', strength);
  geometry.setAttribute('aBirth', birth);
  geometry.setAttribute('aLength', length);
  const newest = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, alphaMap: treadTexture(), transparent: true, depthWrite: false, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNewest = newest;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aStrength;
        attribute float aBirth;
        attribute float aLength;
        uniform float uNewest;
        varying float vFade;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_ALPHAMAP
        vAlphaMapUv.y *= aLength * 2.5; // (a tread block every 40 cm)
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // (the oldest quarter fades out before it's replaced)
        float age = (uNewest - aBirth) / ${max.toFixed(1)};
        vFade = aStrength * (1.0 - smoothstep(0.75, 1.0, age));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vFade;');
  };
  material.customProgramCacheKey = () => 'tyre-marks';
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false; // (marks are everywhere; one cheap draw)
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'tyre-marks';
  scene.add(mesh);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1)); // (creates the colour buffer)

  let next = 0;
  let total = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const across = new THREE.Vector3(0, 0, 1);
  const tint = new THREE.Color();

  return {
    mesh,
    // A stretch of one wheel's track, from (x0, y0, z0) to (x1, y1, z1) on the ground.
    add({ x0, y0, z0, x1, y1, z1, width = 0.3, color = 0x3a3022, strength: s = 0.5 }) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const flat = Math.hypot(dx, dz);
      if (flat < 0.05 || s <= 0.01) return;
      const len = flat + 0.04;
      q.setFromAxisAngle(up, Math.atan2(-dz, dx));
      qPitch.setFromAxisAngle(across, Math.atan2(y1 - y0, flat));
      q.multiply(qPitch);
      pos.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.02, (z0 + z1) / 2);
      m.compose(pos, q, sc.set(len, 1, width));
      const i = next;
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tint.set(color));
      strength.setX(i, Math.min(1, s));
      birth.setX(i, total);
      length.setX(i, len);
      next = (next + 1) % max;
      total += 1;
      newest.value = total;
      mesh.count = Math.min(max, total);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      strength.needsUpdate = true;
      birth.needsUpdate = true;
      length.needsUpdate = true;
    },
    count: () => Math.min(max, total),
  };
}

// How a wheel marks the surface under it: { color, strength } or null for no mark. `surface` is
// the name from surfaces.js or a field material; `wet` 0..1; `slide` 0..1 is how much the tyre is
// locked, spinning or sliding sideways.
export function markFor(surface, wet = 0, slide = 0) {
  const w = Math.max(0, Math.min(1, wet));
  const s = Math.max(0, Math.min(1, slide));
  switch (surface) {
    case 'asphalt':
      return s > 0.3 ? { color: 0x121212, strength: 0.25 + 0.45 * s } : null; // (rubber, only when it slides)
    case 'grass':
      return { color: w > 0.4 ? 0x33291d : 0x334022, strength: 0.18 + 0.4 * w + 0.35 * s };
    case 'gravel':
      return { color: 0x4e4a44, strength: 0.18 + 0.15 * w + 0.25 * s };
    case 'rock':
      return s > 0.3 ? { color: 0x3a3836, strength: 0.2 * s } : null;
    default: // dirt and the field's soils: a tread print, deeper and darker when wet
      return { color: w > 0.4 ? 0x2a2018 : 0x3a3022, strength: 0.35 + 0.35 * w + 0.25 * s };
  }
}

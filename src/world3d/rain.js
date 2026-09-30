// Rain: streaks falling in a box around the camera, recycled as they reach the ground. Thin
// lines, see-through, so they skip the contact-shadow pass. Hidden when it's dry.
import * as THREE from 'three';

const COUNT = 2200;
const BOX = { x: 36, y: 22, z: 36 };
const LENGTH = 0.45;

export function createRain(scene) {
  const pos = new Float32Array(COUNT * 6);
  const drops = [];
  for (let i = 0; i < COUNT; i++) {
    drops.push({ x: (Math.random() - 0.5) * BOX.x, y: Math.random() * BOX.y, z: (Math.random() - 0.5) * BOX.z, v: 9 + Math.random() * 3 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xb8c2cc, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = 5;
  scene.add(lines);
  const wind = new THREE.Vector3(0.9, 0, 0.4); // (a slight slant)

  return {
    update(dt, camera, amount) {
      lines.visible = amount > 0.02;
      if (!lines.visible) return;
      mat.opacity = 0.32 * amount;
      const shown = Math.floor(COUNT * amount);
      geo.setDrawRange(0, shown * 2);
      const c = camera.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < shown; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        d.x += wind.x * dt;
        d.z += wind.z * dt;
        if (d.y < 0) {
          d.y += BOX.y;
          d.x = (Math.random() - 0.5) * BOX.x;
          d.z = (Math.random() - 0.5) * BOX.z;
        }
        // (the box follows the camera, wrapping sideways so rain is always all around you)
        const x = c.x + ((((d.x + BOX.x / 2) % BOX.x) + BOX.x) % BOX.x) - BOX.x / 2;
        const z = c.z + ((((d.z + BOX.z / 2) % BOX.z) + BOX.z) % BOX.z) - BOX.z / 2;
        const y = c.y - BOX.y * 0.35 + d.y;
        const o = i * 6;
        pos[o] = x;
        pos[o + 1] = y;
        pos[o + 2] = z;
        pos[o + 3] = x - wind.x * 0.04;
        pos[o + 4] = y + LENGTH;
        pos[o + 5] = z - wind.z * 0.04;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(lines);
      geo.dispose();
      mat.dispose();
    },
  };
}

// The guide marker in the world: a soft column of light where the current goal wants you to go,
// with a turning diamond at head height. It stays readable from across the map (it grows with
// distance and ignores the fog) and disappears once you're there.
import * as THREE from 'three';

function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, 'rgba(255,214,110,0.75)');
  grad.addColorStop(0.25, 'rgba(255,200,80,0.35)');
  grad.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createGuideBeacon(scene) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0),
    new THREE.MeshBasicMaterial({
      map: beamTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
    }),
  );
  beam.renderOrder = 5;
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.35),
    new THREE.MeshBasicMaterial({ color: 0xffc94a, fog: false, transparent: true, opacity: 0.95 }));
  diamond.scale.y = 1.5;
  group.add(beam, diamond);
  group.visible = false;
  scene.add(group);
  let t = 0;

  return {
    // target { x, y, z } or null; `from` is where you are (camera).
    update(dt, target, from) {
      t += dt;
      if (!target) {
        group.visible = false;
        return;
      }
      group.visible = true;
      const d = Math.hypot(target.x - from.x, target.z - from.z);
      const k = Math.max(1, d / 40); // grows with distance so it still shows far away
      group.position.set(target.x, target.y, target.z);
      beam.scale.set(0.35 * k, 40 + 30 * Math.min(1, d / 400), 0.35 * k);
      beam.material.opacity = THREE.MathUtils.clamp((d - 4) / 12, 0, 1);
      diamond.position.y = 2.6 + Math.sin(t * 2) * 0.15;
      diamond.scale.setScalar(Math.min(4, k)).multiply(new THREE.Vector3(1, 1.5, 1));
      diamond.rotation.y = t * 1.5;
    },
    destroy() {
      scene.remove(group);
    },
  };
}

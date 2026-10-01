// A pooled automatic head/work light keeps the nearby work area readable at night.
// Follows the player's view on foot or in a cab; no shadows or per-machine light allocation.
import * as THREE from 'three';
export function createWorkLight(scene) {
  const light = new THREE.SpotLight(0xf1f3ff, 0, 45, .62, .65, 2);
  light.name = 'player-night-work-light';
  light.castShadow = false;
  scene.add(light, light.target);
  const forward = new THREE.Vector3();
  return {
    update(camera, night) {
      light.intensity = 35 * night;
      light.visible = night > .01;
      camera.getWorldDirection(forward);
      light.position.copy(camera.position).addScaledVector(forward, .2);
      light.position.y -= .1;
      light.target.position.copy(light.position).addScaledVector(forward, 18);
    },
    dispose() { scene.remove(light, light.target); light.dispose(); },
  };
}

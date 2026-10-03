// Dust puffs (digging, dumping, tipping, wheels on gravel).
import * as THREE from 'three';

const MAX = 600;

function dustTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createParticles(scene) {
  const texture = dustTexture();
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture, color: 0xc8b08a, transparent: true, depthWrite: false, opacity: 0,
    }));
    s.visible = false;
    scene.add(s);
    pool.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
  }
  let next = 0;

  // A puff of dust by default (it drifts up, grows and fades). `velocity` and `gravity` make it
  // a thrown thing instead: clods and stones flung off a spinning wheel (`growth` 0 keeps them
  // their size).
  function spawn(pos, { count = 10, spread = 1, up = 1, life = 2, size = 1.2, color = 0xc8b08a, opacity = 0.5, velocity = null, gravity = 0, growth = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = pool[next];
      next = (next + 1) % MAX;
      p.s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + (velocity ? 0 : Math.random() * 0.5), pos.z + (Math.random() - 0.5) * spread);
      if (velocity) p.vel.set(velocity.x * (0.6 + Math.random() * 0.6), velocity.y * (0.6 + Math.random() * 0.7), velocity.z * (0.6 + Math.random() * 0.6));
      else p.vel.set((Math.random() - 0.5) * 1.2, up * (0.4 + Math.random()), (Math.random() - 0.5) * 1.2);
      p.gravity = gravity;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.max = p.life;
      p.grow = growth ? size * (1.5 + Math.random()) : size * 2 * (0.7 + Math.random() * 0.6);
      p.s.scale.setScalar(size);
      p.s.material.color.set(color);
      p.s.material.opacity = opacity;
      p.baseOpacity = opacity;
      p.s.visible = true;
    }
  }

  return {
    spawn,
    update(dt) {
      for (const p of pool) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.s.visible = false;
          continue;
        }
        const t = 1 - p.life / p.max;
        p.s.position.addScaledVector(p.vel, dt);
        if (p.gravity) p.vel.y -= p.gravity * dt;
        else p.vel.multiplyScalar(1 - dt * 0.8);
        p.s.scale.setScalar(p.gravity ? p.grow * 0.5 : p.grow * (0.5 + t));
        p.s.material.opacity = p.baseOpacity * (1 - t);
      }
    },
  };
}

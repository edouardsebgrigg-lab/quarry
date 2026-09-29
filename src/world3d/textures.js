// Procedural textures drawn on canvases, so the world looks textured before real art exists.
import * as THREE from 'three';

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTexture(size, draw, { repeat = 1, color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Light grey speckle used on top of vertex colours (gravel/dirt detail).
export function gravelDetail() {
  return makeTexture(512, (g, n) => {
    const r = rand(1);
    g.fillStyle = '#cfcfcf';
    g.fillRect(0, 0, n, n);
    // Soft large-scale variation.
    for (let i = 0; i < 60; i++) {
      const v = 175 + Math.floor(r() * 60);
      g.fillStyle = `rgba(${v},${v},${v},0.25)`;
      g.beginPath();
      g.arc(r() * n, r() * n, 20 + r() * 50, 0, Math.PI * 2);
      g.fill();
    }
    // Stones and grit.
    for (let i = 0; i < 14000; i++) {
      const v = 120 + Math.floor(r() * 135);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const s = 1 + r() * 2.5;
      g.fillRect(r() * n, r() * n, s, s * (0.6 + r() * 0.8));
    }
    for (let i = 0; i < 500; i++) {
      const v = 90 + Math.floor(r() * 70);
      g.fillStyle = `rgba(${v},${v - 4},${v - 8},0.55)`;
      g.beginPath();
      g.arc(r() * n, r() * n, 1.5 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function rustyMetal(base = '#a8562b') {
  return makeTexture(128, (g, n) => {
    const r = rand(5);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(90,40,15,0.35)' : 'rgba(255,220,180,0.08)';
      g.beginPath();
      g.arc(r() * n, r() * n, 1 + r() * 4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function planks() {
  return makeTexture(128, (g, n) => {
    const r = rand(6);
    for (let i = 0; i < 8; i++) {
      const v = 95 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${v + 20},${v},${v - 30})`;
      g.fillRect(0, (i * n) / 8, n, n / 8 - 2);
    }
  });
}

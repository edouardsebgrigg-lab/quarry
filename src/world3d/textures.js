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
  return makeTexture(256, (g, n) => {
    const r = rand(1);
    g.fillStyle = '#d8d8d8';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 5000; i++) {
      const v = 150 + Math.floor(r() * 105);
      g.fillStyle = `rgb(${v},${v},${v})`;
      const s = 1 + r() * 3;
      g.fillRect(r() * n, r() * n, s, s);
    }
    for (let i = 0; i < 120; i++) {
      const v = 110 + Math.floor(r() * 60);
      g.fillStyle = `rgba(${v},${v},${v},0.6)`;
      g.beginPath();
      g.arc(r() * n, r() * n, 2 + r() * 5, 0, Math.PI * 2);
      g.fill();
    }
  });
}

export function grass() {
  return makeTexture(256, (g, n) => {
    const r = rand(2);
    g.fillStyle = '#4c6b2f';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      const h = 70 + r() * 40;
      g.fillStyle = `hsl(${h}, ${35 + r() * 25}%, ${20 + r() * 22}%)`;
      g.fillRect(r() * n, r() * n, 1, 2 + r() * 4);
    }
  });
}

export function concrete() {
  return makeTexture(256, (g, n) => {
    const r = rand(3);
    g.fillStyle = '#9d988f';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 6000; i++) {
      const v = 130 + Math.floor(r() * 50);
      g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.5)`;
      g.fillRect(r() * n, r() * n, 2, 2);
    }
    g.strokeStyle = 'rgba(60,55,50,0.35)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, n, n);
  });
}

export function roadGravel() {
  return makeTexture(256, (g, n) => {
    const r = rand(4);
    g.fillStyle = '#7d6d58';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 7000; i++) {
      const v = 90 + Math.floor(r() * 90);
      g.fillStyle = `rgb(${v},${v - 10},${v - 25})`;
      g.fillRect(r() * n, r() * n, 1 + r() * 2, 1 + r() * 2);
    }
    // tyre ruts
    g.fillStyle = 'rgba(40,32,24,0.25)';
    g.fillRect(n * 0.2, 0, n * 0.12, n);
    g.fillRect(n * 0.68, 0, n * 0.12, n);
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

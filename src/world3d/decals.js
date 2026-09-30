// Decals on the machines: model lettering, black-and-yellow hazard chevrons, warning stickers
// and number plates, the details that make plant look real. Each is drawn on a canvas and
// projected onto the named part of the model (so it follows the surface and moves with the
// part), once per model file when it loads. On a Rusty machine they're faded and scratched.
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';

// Sides in the model's own space (machines face +X; +Y is up).
const SIDES = {
  left: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(0, 0, -1),
  front: new THREE.Vector3(1, 0, 0), back: new THREE.Vector3(-1, 0, 0), top: new THREE.Vector3(0, 1, 0),
};

// Per model file (without the tier): which part, which side, where on it (u along, v up, as
// fractions of the part's box), height in metres, and what to draw.
const SPECS = {
  minidigger: [
    { part: 'HouseBody', sides: ['left', 'right'], u: 0.5, v: 0.55, h: 0.11, art: ['model', 'QX 18'] },
    { part: 'BoomBody', sides: ['left', 'right'], u: 0.38, v: 0.55, h: 0.07, art: ['model', 'QX 18'] },
    { part: 'BladeBody', sides: ['front'], u: 0.5, v: 0.5, h: 0.12, wFit: 0.92, art: ['hazard'] },
    { part: 'HouseBody', sides: ['back'], u: 0.5, v: 0.6, h: 0.09, art: ['warning'] },
  ],
  excavator: [
    { part: 'HouseBody', sides: ['left', 'right'], u: 0.4, v: 0.5, h: 0.24, art: ['model', 'QX 75'] },
    { part: 'BoomBody', sides: ['left', 'right'], u: 0.33, v: 0.55, h: 0.26, art: ['model', 'QX 75'] },
    { part: 'Counterweight', sides: ['back'], u: 0.5, v: 0.45, h: 0.2, wFit: 0.85, art: ['hazard'] },
    { part: 'HouseBody', sides: ['left'], u: 0.35, v: 0.6, h: 0.12, art: ['warning'] },
  ],
  dumper: [
    { part: 'Skip', sides: ['left', 'right'], u: 0.5, v: 0.55, h: 0.12, art: ['model', 'QD 15'] },
    { part: 'EngineCover', sides: ['back'], u: 0.5, v: 0.55, h: 0.1, art: ['warning'] },
  ],
  tractor: [
    { part: 'Bonnet', sides: ['left', 'right'], u: 0.55, v: 0.6, h: 0.08, art: ['model', 'FIELDMASTER 70'] },
  ],
  truck: [
    { part: 'Cab', sides: ['left', 'right'], u: 0.5, v: 0.42, h: 0.16, art: ['model', 'WOLDS'] },
    { part: 'Bumper', sides: ['front'], u: 0.5, v: 0.5, h: 0.11, art: ['plate', 'front'] },
    { part: 'Bed', sides: ['back'], u: 0.5, v: 0.28, h: 0.18, wFit: 0.9, art: ['hazard'] },
  ],
  trailer: [
    { part: 'Plate', sides: ['back'], u: 0.5, v: 0.5, h: 0.1, art: ['plate', 'rear'] },
    { part: 'Tailgate', sides: ['back'], u: 0.5, v: 0.72, h: 0.1, wFit: 0.8, art: ['hazard'] },
  ],
  vehicle: [
    { part: 'Tailgate', sides: ['back'], u: 0.5, v: 0.3, h: 0.1, art: ['plate', 'rear'] },
    { part: 'Trim', sides: ['front'], u: 0.5, v: 0.4, h: 0.1, art: ['plate', 'front'] },
  ],
};

const REG = 'QU71 ARY'; // (a made-up registration)

// ---- the artwork, drawn once per kind and tier
const artCache = new Map();
function art([kind, arg], worn) {
  const key = `${kind}|${arg}|${worn}`;
  if (artCache.has(key)) return artCache.get(key);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = (px) => `700 ${px}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
  if (kind === 'model') {
    g.font = font(110);
    const w = Math.ceil(g.measureText(arg).width) + 40;
    c.width = w;
    c.height = 128;
    g.font = font(110);
    g.fillStyle = '#141414';
    g.textBaseline = 'middle';
    g.fillText(arg, 20, 68);
  } else if (kind === 'hazard') {
    c.width = 512;
    c.height = 96;
    g.fillStyle = '#f2b705';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#141414';
    for (let x = -c.height; x < c.width + c.height; x += 64) {
      g.beginPath();
      g.moveTo(x, c.height);
      g.lineTo(x + 32, c.height);
      g.lineTo(x + 32 + c.height, 0);
      g.lineTo(x + c.height, 0);
      g.fill();
    }
  } else if (kind === 'warning') {
    c.width = 256;
    c.height = 128;
    g.fillStyle = '#f2c230';
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = '#141414';
    g.lineWidth = 6;
    g.strokeRect(3, 3, 250, 122);
    g.beginPath();
    g.moveTo(64, 24);
    g.lineTo(108, 104);
    g.lineTo(20, 104);
    g.closePath();
    g.lineWidth = 8;
    g.stroke();
    g.fillStyle = '#141414';
    g.fillRect(60, 50, 8, 30);
    g.fillRect(60, 86, 8, 8);
    for (let i = 0; i < 4; i++) g.fillRect(128, 30 + i * 20, 104 - (i % 2) * 22, 8); // (small print)
  } else if (kind === 'plate') {
    c.width = 520;
    c.height = 112;
    g.fillStyle = arg === 'rear' ? '#f5c518' : '#f4f4f0';
    g.beginPath();
    g.roundRect(2, 2, 516, 108, 10);
    g.fill();
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#111';
    g.font = font(92);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(REG, 260, 60);
  }
  if (worn) wear(g, c.width, c.height, kind);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const result = { tex, aspect: c.width / c.height };
  artCache.set(key, result);
  return result;
}

// Scratches and flaking on a worn machine's decals.
function wear(g, w, h, kind) {
  let s = 12345 + w * 7 + h;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.globalCompositeOperation = 'destination-out';
  const n = kind === 'plate' ? 40 : 160;
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.3 + rnd() * 0.7;
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 1 + rnd() * (kind === 'plate' ? 3 : 9);
    g.beginPath();
    g.ellipse(x, y, r * (1 + rnd() * 2), r, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const materials = new Map();
function decalMaterial(tex, worn) {
  const key = `${tex.uuid}|${worn}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({
      map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      roughness: 0.6, metalness: 0, opacity: worn ? 0.78 : 1,
    }));
  }
  return materials.get(key);
}

// The meshes that make up a named part (the part itself, or the pieces under it).
function partMeshes(scene, name) {
  const node = scene.getObjectByName(name);
  if (!node) return [];
  const out = [];
  node.traverse((o) => { if (o.isMesh && (o === node || o.parent === node || o.parent?.parent === node)) out.push(o); });
  return out;
}

// Drop the triangles of a decal that don't face the way it was projected (so lettering on one
// side of a thin panel doesn't show through, mirrored, on the other).
function keepFacing(geo, normal) {
  const pos = geo.attributes.position;
  const keep = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const tri = new THREE.Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    tri.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (tri.dot(normal) > 0.25) keep.push(i);
  }
  if (keep.length * 3 === pos.count) return;
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.attributes[name];
    const out = new Float32Array(keep.length * 3 * attr.itemSize);
    keep.forEach((i, k) => {
      for (let v = 0; v < 3; v++) for (let d = 0; d < attr.itemSize; d++) out[(k * 3 + v) * attr.itemSize + d] = attr.array[(i + v) * attr.itemSize + d];
    });
    geo.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
  }
}

const ray = new THREE.Raycaster();
const helper = new THREE.Object3D();

// Put the decals on one loaded model (its file name, e.g. "excavator_rusty").
export function addDecals(scene, name) {
  const [type, tier] = name.split('_');
  const specs = SPECS[type];
  if (!specs) return 0;
  const worn = tier === 'rusty' || type === 'vehicle';
  scene.updateMatrixWorld(true);
  let made = 0;
  for (const spec of specs) {
    const meshes = partMeshes(scene, spec.part);
    if (!meshes.length) continue;
    const box = new THREE.Box3();
    for (const m of meshes) box.expandByObject(m);
    const size = box.getSize(new THREE.Vector3());
    const { tex, aspect } = art(spec.art, worn);
    for (const side of spec.sides) {
      const n = SIDES[side];
      // Aim from outside the part at the spot (u along its length or width, v up its height).
      const along = side === 'front' || side === 'back' ? 'z' : 'x';
      const p = new THREE.Vector3(
        along === 'x' ? box.min.x + size.x * spec.u : (n.x > 0 ? box.max.x : box.min.x),
        box.min.y + size.y * spec.v,
        along === 'z' ? box.min.z + size.z * spec.u : (n.z > 0 ? box.max.z : box.min.z),
      );
      if (side === 'top') p.y = box.max.y;
      const origin = p.clone().addScaledVector(n, 2);
      ray.set(origin, n.clone().negate());
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) continue;
      const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : n;
      helper.position.copy(hit.point);
      helper.up.set(0, 1, 0);
      helper.lookAt(hit.point.clone().add(normal));
      const h = spec.h;
      let w = h * aspect;
      if (spec.wFit) w = (along === 'z' ? size.z : size.x) * spec.wFit;
      const target = hit.object;
      const geo = new DecalGeometry(target, hit.point, helper.rotation.clone(), new THREE.Vector3(w, h, 0.4));
      keepFacing(geo, normal);
      if (!geo.attributes.position?.count) continue;
      // (into the part's own space, so the decal moves with it)
      geo.applyMatrix4(new THREE.Matrix4().copy(target.matrixWorld).invert());
      const decal = new THREE.Mesh(geo, decalMaterial(tex, worn));
      decal.name = `Decal_${spec.art[0]}`;
      decal.renderOrder = 2;
      target.add(decal);
      made += 1;
    }
  }
  return made;
}

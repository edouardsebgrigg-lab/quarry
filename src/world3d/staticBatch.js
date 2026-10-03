// Static scenery drawn in batches. A placed prop is a copy of a whole Blender model, so the
// village, the power line, the fences and the depot's block walls came to hundreds of meshes,
// each its own draw call (and again for the sun's shadow). Props that never move or change are
// handed over here once they're placed:
//  - a part that repeats (the same geometry in the same material: a concrete block, a pole's
//    insulator, a cottage's window frames) becomes one InstancedMesh, so a wall of three hundred
//    blocks is a draw or two;
//  - what's left is merged by material (the machines parked in the farm fields, one-off
//    buildings).
// Both stay within a 96 m patch of the map, so what's out of view is still skipped.
// Machines' weathered paint works out "up" from the mesh's own matrix, which an instance doesn't
// have, so weathered parts are only ever merged, never instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PATCH = 96; // m: the size of a merged patch

// Whether a mesh can be drawn as part of a batch: a plain, visible, single-material mesh with
// nothing done to it per frame.
function batchable(o, scene) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.isBatchedMesh) return false;
  if (Array.isArray(o.material) || o.material.transparent || o.morphTargetInfluences) return false;
  if (o.renderOrder !== 0 || !o.frustumCulled || o.layers.mask !== 1 || o.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (o.customDepthMaterial || o.customDistanceMaterial) return false;
  for (let p = o; p && p !== scene; p = p.parent) if (!p.visible) return false;
  return o.matrixWorld.determinant() > 0; // (a mirrored copy would turn its faces inside out)
}

// The vertex layout, which merged geometries must share.
function layout(g) {
  const attrs = Object.keys(g.attributes).sort().map((k) => {
    const a = g.attributes[k];
    const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    return `${k}:${a.itemSize}${a.normalized ? 'n' : ''}${['position', 'normal', 'tangent'].includes(k) ? '' : arr.constructor.name}`;
  });
  return `${g.index ? 'i' : 'n'}|${attrs.join(',')}|${Object.keys(g.morphAttributes).length}`;
}

// A copy of a mesh's geometry moved by `matrix` (its world matrix unless given), with positions
// and normals as floats, so a quantised model survives the transform.
function movedGeometry(mesh, matrix = mesh.matrixWorld) {
  const g = mesh.geometry.clone();
  for (const k of ['position', 'normal', 'tangent']) {
    const a = g.attributes[k];
    if (!a || (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute && !a.normalized)) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  g.applyMatrix4(matrix);
  return g;
}

// Take out the empty groups left behind (they'd still be walked every frame).
function prune(o) {
  for (const c of [...o.children]) prune(c);
  if ((o.type === 'Group' || o.type === 'Object3D') && !o.children.length) o.removeFromParent();
}

// Batch everything under `roots` (already added to `scene` and posed). Returns how many meshes
// went in and how many draws came out.
export function batchStatic(scene, roots) {
  scene.updateMatrixWorld(true);
  const meshes = [];
  for (const root of roots) root?.traverse((o) => { if (batchable(o, scene)) meshes.push(o); });
  const flags = (m) => `${m.material.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
  // (batches stay within a patch of the map: a batch is drawn whole whenever any of it is in
  // view, so a cottage by your yard batched with the village's would draw the village too)
  const centre = new THREE.Vector3();
  const patch = (m) => {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    centre.copy(m.geometry.boundingSphere.center).applyMatrix4(m.matrixWorld);
    return `${Math.floor(centre.x / PATCH)},${Math.floor(centre.z / PATCH)}`;
  };
  const repeats = new Map();
  for (const m of meshes) {
    if (m.material.userData.weather) continue;
    const key = `${m.geometry.uuid}|${flags(m)}|${patch(m)}`;
    if (!repeats.has(key)) repeats.set(key, []);
    repeats.get(key).push(m);
  }
  const done = new Set();
  let draws = 0;
  for (const list of repeats.values()) {
    if (list.length < 2) continue;
    const [first] = list;
    const inst = new THREE.InstancedMesh(first.geometry, first.material, list.length);
    list.forEach((m, i) => { inst.setMatrixAt(i, m.matrixWorld); done.add(m); });
    inst.name = `batch-${first.name}`;
    inst.castShadow = first.castShadow;
    inst.receiveShadow = first.receiveShadow;
    inst.computeBoundingBox();
    inst.computeBoundingSphere();
    inst.matrixAutoUpdate = false;
    scene.add(inst);
    draws++;
  }
  const patches = new Map();
  for (const m of meshes) {
    if (done.has(m)) continue;
    const key = `${flags(m)}|${layout(m.geometry)}|${patch(m)}`;
    if (!patches.has(key)) patches.set(key, []);
    patches.get(key).push(m);
  }
  for (const list of patches.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map((m) => movedGeometry(m)));
    if (!geo) continue;
    const [first] = list;
    const merged = new THREE.Mesh(geo, first.material);
    merged.name = `batch-${first.material.name || 'merged'}`;
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    merged.matrixAutoUpdate = false;
    scene.add(merged);
    for (const m of list) done.add(m);
    draws++;
  }
  for (const m of done) m.removeFromParent();
  for (const root of roots) if (root) prune(root);
  return { meshes: done.size, draws };
}

// A loaded model's small fixed parts merged by material into one mesh per parent: the wheel nuts,
// pin caps, rails, steps and pillars. A machine came to 50 to 180 meshes, each its own draw; this
// leaves a few dozen. Only leaf meshes are merged, into their own parent, so whatever moves
// (a wheel, the boom, the tailgate) still carries its parts; parts the game finds by name
// (`keep`, tested on the name without Blender's ".001") are left as they are.
export function mergeDetails(root, keep) {
  const groups = new Map();
  root.traverse((o) => {
    if (o.children.length || !o.parent || !o.visible || keep.test(o.name.replace(/\.\d+$/, ''))) return;
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || Array.isArray(o.material) || o.material.transparent || o.morphTargetInfluences) return;
    if (o.renderOrder !== 0 || o.customDepthMaterial) return;
    o.updateMatrix();
    if (o.matrix.determinant() <= 0) return;
    const key = `${o.parent.uuid}|${o.material.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${layout(o.geometry)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let merged = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map((m) => movedGeometry(m, m.matrix)));
    if (!geo) continue;
    const [first] = list;
    const mesh = new THREE.Mesh(geo, first.material);
    mesh.name = `${first.parent.name || 'part'} details`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    first.parent.add(mesh);
    for (const m of list) m.removeFromParent();
    merged += list.length - 1;
  }
  return merged; // (how many draws it saved)
}

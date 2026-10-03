import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { batchStatic, mergeDetails } from './staticBatch.js';
import { NAMED_PARTS } from './glbModels.js';

// A placed prop as the game makes one: a group around a model's scene, posed in the world.
function prop(scene, parts, x, z, yaw = 0) {
  const root = new THREE.Group();
  const model = new THREE.Group();
  for (const [geometry, material, y = 0] of parts) {
    const m = new THREE.Mesh(geometry, material);
    m.position.y = y;
    m.castShadow = true;
    model.add(m);
  }
  root.add(model);
  root.position.set(x, 0, z);
  root.rotation.y = yaw;
  scene.add(root);
  return root;
}

const meshesIn = (scene) => {
  const out = [];
  scene.traverseVisible((o) => { if (o.isMesh) out.push(o); });
  return out;
};
const triangles = (scene) => meshesIn(scene).reduce((n, m) => n + (m.geometry.index.count / 3) * (m.isInstancedMesh ? m.count : 1), 0);

describe('static scenery in batches', () => {
  it('draws a wall of the same block as one instanced mesh, each block where it stood', () => {
    const scene = new THREE.Scene();
    const block = new THREE.BoxGeometry(1.6, 0.8, 0.8);
    const concrete = new THREE.MeshStandardMaterial({ name: 'Concrete' });
    const roots = [];
    for (let i = 0; i < 12; i++) roots.push(prop(scene, [[block, concrete, 0.4]], i * 1.6, -5, 0.1 * i));
    scene.updateMatrixWorld(true);
    const where = roots.map((r) => r.children[0].children[0].matrixWorld.clone());
    const before = triangles(scene);
    const out = batchStatic(scene, roots);
    expect(out).toEqual({ meshes: 12, draws: 1 });
    const [inst, ...rest] = meshesIn(scene);
    expect(rest).toHaveLength(0);
    expect(inst.isInstancedMesh).toBe(true);
    expect(inst.count).toBe(12);
    expect(inst.castShadow).toBe(true);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 12; i++) {
      inst.getMatrixAt(i, m);
      m.elements.forEach((v, k) => expect(v).toBeCloseTo(where[i].elements[k], 5));
    }
    expect(triangles(scene)).toBe(before);
    // (the emptied prop groups are gone too, so nothing is left to walk each frame)
    expect(scene.children).toEqual([inst]);
  });

  it('merges one-off parts by material, in world space', () => {
    const scene = new THREE.Scene();
    const paint = new THREE.MeshStandardMaterial({ name: 'Paint' });
    const roots = [
      prop(scene, [[new THREE.BoxGeometry(1, 1, 1), paint, 0.5], [new THREE.CylinderGeometry(0.5, 0.5, 2), paint, 3]], 10, 10),
    ];
    const before = triangles(scene);
    const out = batchStatic(scene, roots);
    expect(out).toEqual({ meshes: 2, draws: 1 });
    const [merged] = meshesIn(scene);
    expect(merged.isInstancedMesh).toBeFalsy();
    merged.geometry.computeBoundingBox();
    const box = merged.geometry.boundingBox;
    expect(box.min.x).toBeCloseTo(9.5);
    expect(box.max.x).toBeCloseTo(10.5);
    expect(box.min.y).toBeCloseTo(0);
    expect(box.max.y).toBeCloseTo(4);
    expect(triangles(scene)).toBe(before);
  });

  it('never instances weathered machine paint (it needs the mesh matrix), only merges it', () => {
    const scene = new THREE.Scene();
    const worn = new THREE.MeshStandardMaterial({ name: 'Paint' });
    worn.userData.weather = { uWeather: { value: [1, 1, 1, 1] } };
    const wheel = new THREE.CylinderGeometry(0.6, 0.6, 0.3);
    const roots = [prop(scene, [[wheel, worn, 0.6], [wheel, worn, 0.6]], 0, 0), prop(scene, [[wheel, worn, 0.6]], 3, 0)];
    batchStatic(scene, roots);
    const list = meshesIn(scene);
    expect(list).toHaveLength(1);
    expect(list[0].isInstancedMesh).toBeFalsy();
  });

  it('leaves alone what changes or would draw wrong: hidden, see-through, mirrored, far apart', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const solid = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 });
    const hidden = prop(scene, [[geo, solid]], 0, 0);
    hidden.visible = false;
    const seeThrough = [prop(scene, [[geo, glass]], 2, 0), prop(scene, [[geo, glass]], 4, 0)];
    const mirrored = prop(scene, [[geo, solid]], 6, 0);
    mirrored.scale.x = -1;
    const lone = new THREE.MeshStandardMaterial();
    const far = [prop(scene, [[new THREE.BoxGeometry(1, 1, 1), lone]], 0, 0), prop(scene, [[new THREE.BoxGeometry(1, 2, 1), lone]], 500, 500)];
    // (the same model in two places a long way apart: batched, it would never be out of view)
    const apart = [prop(scene, [[geo, solid]], -300, 0), prop(scene, [[geo, solid]], 300, 0)];
    const out = batchStatic(scene, [hidden, ...seeThrough, mirrored, ...far, ...apart]);
    expect(out.meshes).toBe(0);
    expect(hidden.parent).toBe(scene);
    expect(meshesIn(scene)).toHaveLength(7);
  });
});

describe("a machine's small parts merged when it loads", () => {
  // A wheel with six nuts and a hub cap, on a body with two steps and a tail light.
  function machine() {
    const steel = new THREE.MeshStandardMaterial({ name: 'Steel' });
    const lamp = new THREE.MeshStandardMaterial({ name: 'TailLight' });
    const root = new THREE.Group();
    const wheel = new THREE.Group();
    wheel.name = 'Wheel0';
    wheel.position.set(1.5, 0.5, 0.9);
    root.add(wheel);
    const nut = new THREE.CylinderGeometry(0.02, 0.02, 0.03);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(nut, steel);
      m.name = i ? `Clean captive wheel nut.00${i}` : 'Clean captive wheel nut';
      m.position.set(Math.cos(i) * 0.1, Math.sin(i) * 0.1, 0.12);
      wheel.add(m);
    }
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1), new THREE.MeshStandardMaterial({ name: 'Rubber' }));
    wheel.add(tyre);
    for (const z of [-0.6, 0.6]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.2), steel);
      step.name = 'Clean access step';
      step.position.set(0.5, 0.4, z);
      root.add(step);
    }
    for (const z of [-0.7, 0.7]) {
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), lamp);
      light.name = 'TailLight';
      light.position.set(-2, 1, z);
      root.add(light);
    }
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1), steel);
    barrel.name = 'BoomRam';
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1), steel);
    rod.name = 'BoomRamRod';
    root.add(barrel, rod);
    return { root, wheel };
  }

  it('turns the nuts on each wheel into one mesh that still turns with the wheel', () => {
    const { root, wheel } = machine();
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    wheel.children.filter((c) => /nut/.test(c.name)).forEach((c) => box.expandByObject(c));
    expect(mergeDetails(root, NAMED_PARTS)).toBe(5 + 1); // (six nuts -> one, two steps -> one)
    const nuts = wheel.children.filter((c) => c.isMesh && c.material.name === 'Steel');
    expect(nuts).toHaveLength(1);
    expect(nuts[0].parent).toBe(wheel);
    root.updateMatrixWorld(true);
    const after = new THREE.Box3().expandByObject(nuts[0]);
    expect(after.min.distanceTo(box.min)).toBeLessThan(1e-5);
    expect(after.max.distanceTo(box.max)).toBeLessThan(1e-5);
    // (the tyre, in its own material, is untouched)
    expect(wheel.children.filter((c) => c.material?.name === 'Rubber')).toHaveLength(1);
  });

  it('leaves alone the parts the game looks up: lights, rams and their rods', () => {
    const { root } = machine();
    mergeDetails(root, NAMED_PARTS);
    expect(root.children.filter((c) => c.name === 'TailLight')).toHaveLength(2);
    expect(root.getObjectByName('BoomRam')).toBeTruthy();
    expect(root.getObjectByName('BoomRamRod')).toBeTruthy();
  });

  it('protects every part name the game code looks up', () => {
    const dir = new URL('.', import.meta.url).pathname;
    const names = new Set(['Body', 'Seat', 'Dash', 'Cab', 'BoomRam', 'StickRam', 'BucketRam', 'TailLight', 'Headlight']);
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))) {
      const src = readFileSync(dir + f, 'utf8');
      for (const m of src.matchAll(/(?:getObjectByName|\bnode|\bopt|\banchor)\(\s*(?:\w+\s*,\s*)?(['`])([^'`]+)\1/g)) {
        names.add(m[2].replace('${i}', '0').replace('${n}', 'BoomRam').replace('${type}', 'buggy'));
      }
    }
    expect(names.size).toBeGreaterThan(20);
    for (const n of names) expect([n, NAMED_PARTS.test(n)]).toEqual([n, true]);
  });
});

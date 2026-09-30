import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Asset exports can silently move an axle or rename a joint while still loading.
// This contract is the original fleet's GLTF hierarchy, before the approved revision.
const rigs = JSON.parse(readFileSync(new URL('../../blender/fleet-rigs.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../../assets/models/manifest.json', import.meta.url)));

function load(name) {
  const data = readFileSync(new URL(`../../assets/models/${name}.glb`, import.meta.url));
  expect(data.toString('ascii', 0, 4)).toBe('glTF');
  expect(data.readUInt32LE(4)).toBe(2);
  expect(data.readUInt32LE(8)).toBe(data.length);
  const size = data.readUInt32LE(12);
  expect(data.readUInt32LE(16)).toBe(0x4e4f534a);
  const doc = JSON.parse(data.toString('utf8', 20, 20 + size));
  const offset = 20 + size;
  const binarySize = data.readUInt32LE(offset);
  expect(data.readUInt32LE(offset + 4)).toBe(0x004e4942);
  expect(offset + 8 + binarySize).toBe(data.length);
  expect(doc.buffers).toHaveLength(1);
  expect(doc.buffers[0].uri).toBeUndefined();
  expect(doc.buffers[0].byteLength).toBeLessThanOrEqual(binarySize);
  for (const view of doc.bufferViews) {
    expect(view.buffer).toBe(0);
    expect((view.byteOffset ?? 0) + view.byteLength).toBeLessThanOrEqual(binarySize);
  }
  for (const image of doc.images) {
    expect(image.uri).toBeUndefined();
    expect(doc.bufferViews[image.bufferView]).toBeDefined();
  }
  return doc;
}

describe('approved fleet asset compatibility', () => {
  for (const [name, contract] of Object.entries(rigs)) {
    it(`${name}: keeps animation pivots and ships complete PBR textures`, () => {
      expect(manifest.models).toContain(name);
      const doc = load(name);
      const parents = new Map();
      for (const node of doc.nodes) for (const child of node.children ?? []) parents.set(child, node.name);
      for (const [part, expected] of Object.entries(contract)) {
        const index = doc.nodes.findIndex((node) => node.name === part);
        expect(index, part).toBeGreaterThanOrEqual(0);
        const node = doc.nodes[index];
        expect(parents.get(index) ?? null, part).toBe(expected.parent);
        for (const [key, fallback] of [['translation', [0, 0, 0]], ['rotation', [0, 0, 0, 1]], ['scale', [1, 1, 1]], ['matrix', null]]) {
          const actual = node[key] ?? fallback;
          if (expected[key] === null) expect(actual).toBeNull();
          else {
            expect(actual).toHaveLength(expected[key].length);
            actual.forEach((value, i) => expect(value, `${part}.${key}[${i}]`).toBeCloseTo(expected[key][i], 5));
          }
        }
      }
      expect(doc.materials.some((m) => m.normalTexture && m.pbrMetallicRoughness?.metallicRoughnessTexture)).toBe(true);
      if (/vehicle_pickup|excavator|truck/.test(name)) {
        expect(doc.materials.some((m) => m.name.startsWith('Review_Glass') && m.alphaMode === 'BLEND'
          && m.pbrMetallicRoughness.baseColorFactor[3] < 0.3)).toBe(true);
      }
    });
  }
});

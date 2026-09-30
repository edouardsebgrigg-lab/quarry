import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Everything in assets/ is downloaded before the game starts, so keep an eye on its size.
// Textures are shrunk with `python3 blender/compress_textures.py` (see docs/models.md).
const MB = 1e6;
const sizeOf = (dir) => readdirSync(dir, { withFileTypes: true })
  .reduce((sum, e) => sum + (e.isDirectory() ? sizeOf(join(dir, e.name)) : statSync(join(dir, e.name)).size), 0);

describe('download size', () => {
  it('keeps the models within budget', () => {
    expect(sizeOf('assets/models') / MB).toBeLessThan(40);
  });

  it('stores no model texture as an uncompressed-alpha PNG it does not need', () => {
    // (JPEG for opaque textures; PNG only where a see-through material uses the alpha)
    for (const f of readdirSync('assets/models').filter((n) => n.endsWith('.glb'))) {
      const b = readFileSync(join('assets/models', f));
      const len = b.readUInt32LE(12);
      const gltf = JSON.parse(b.subarray(20, 20 + len).toString());
      const alphaSources = new Set();
      for (const m of gltf.materials ?? []) {
        const t = m.pbrMetallicRoughness?.baseColorTexture;
        if (t && (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE') alphaSources.add(gltf.textures[t.index].source);
      }
      (gltf.images ?? []).forEach((im, i) => {
        if (im.mimeType === 'image/png') expect(alphaSources.has(i), `${f} image ${i}`).toBe(true);
      });
    }
  });
});

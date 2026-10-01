// Turns a build's models/*.glb into files a strict web host will serve and let the page read:
// each model's glTF JSON with its geometry embedded as base64 (models/<name>.gltf.json; the game
// decodes it itself, see glbModels.js) and its textures as ordinary image files
// (models/tex/<hash>.jpg|png, one file for an image several models share). For hosts that won't
// serve .glb, or block fetches of data: and blob: URLs, such as a claude.ai artifact.
//   VITE_MODEL_EXT=gltf.json npx vite build --outDir <dir> && node docs/handover/web-models.mjs <dir>
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const dir = join(process.argv[2] ?? 'dist', 'models');
mkdirSync(join(dir, 'tex'), { recursive: true });
const pad4 = (n) => (n + 3) & ~3;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const name = file.slice(0, -4);
  const glb = readFileSync(join(dir, file));
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLength));

  // Images out to files
  const imageViews = new Set();
  (gltf.images ?? []).forEach((image, i) => {
    if (image.bufferView === undefined) return;
    const view = gltf.bufferViews[image.bufferView];
    const ext = image.mimeType === 'image/png' ? 'png' : 'jpg';
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const uri = `tex/${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.${ext}`;
    writeFileSync(join(dir, uri), bytes);
    imageViews.add(image.bufferView);
    gltf.images[i] = { ...(image.name ? { name: image.name } : {}), uri };
  });

  // The rest of the buffer, repacked without the image bytes
  const remap = new Map();
  const views = [];
  const parts = [];
  let offset = 0;
  gltf.bufferViews.forEach((view, i) => {
    if (imageViews.has(i)) return;
    const start = view.byteOffset ?? 0;
    parts.push({ offset, bytes: bin.subarray(start, start + view.byteLength) });
    remap.set(i, views.length);
    views.push({ ...view, byteOffset: offset });
    offset = pad4(offset + view.byteLength);
  });
  const packed = Buffer.alloc(offset);
  for (const p of parts) p.bytes.copy(packed, p.offset);
  const re = (i) => {
    if (!remap.has(i)) throw new Error(`${name}: buffer view ${i} is an image but is used by an accessor`);
    return remap.get(i);
  };
  gltf.bufferViews = views;
  for (const a of gltf.accessors ?? []) {
    if (a.bufferView !== undefined) a.bufferView = re(a.bufferView);
    if (a.sparse) {
      a.sparse.indices.bufferView = re(a.sparse.indices.bufferView);
      a.sparse.values.bufferView = re(a.sparse.values.bufferView);
    }
  }
  if (gltf.buffers.length !== 1) throw new Error(`${name}: expected one buffer`);
  gltf.buffers[0] = { byteLength: packed.length, uri: `data:application/octet-stream;base64,${packed.toString('base64')}` };
  writeFileSync(join(dir, `${name}.gltf.json`), JSON.stringify(gltf));
  rmSync(join(dir, file));
  console.log(name, `${(packed.length / 1024).toFixed(0)} KB geometry, ${imageViews.size} textures`);
}

"""Shrink the textures embedded in the game's GLB models, in place.

Every model in assets/models carries its own PNG textures (RGBA, even where nothing is
transparent). This re-encodes them without changing any geometry, rig or material:
  - images used only as colour, metal/roughness or occlusion maps with no real transparency
    become JPEG (quality below); normal maps become high-quality JPEG
  - images whose alpha is really used (a material that isn't OPAQUE samples them) stay PNG,
    re-saved optimised
  - identical images inside a model are stored once
  - nothing is enlarged; anything over MAX_SIZE is scaled down
Run from the repository root:  python3 blender/compress_textures.py [files...]
(no Blender needed; it needs Pillow). It's safe to run twice: JPEGs are left alone.
"""
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageFile

ImageFile.MAXBLOCK = 1 << 24  # (the JPEG optimiser needs the whole image in one block)

MAX_SIZE = 1024
QUALITY = {'base': 86, 'mr': 84, 'occ': 84, 'emis': 86, 'normal': 92}


def read_glb(data):
    magic, version, _ = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2, 'not a glTF 2 binary'
    jlen, jtype = struct.unpack_from('<II', data, 12)
    assert jtype == 0x4E4F534A
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, btype = struct.unpack_from('<II', data, off)
    assert btype == 0x004E4942
    return gltf, data[off + 8:off + 8 + blen]


def write_glb(gltf, binary):
    j = json.dumps(gltf, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    binary += b'\0' * (-len(binary) % 4)
    total = 12 + 8 + len(j) + 8 + len(binary)
    return (struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(j), 0x4E4F534A) + j
            + struct.pack('<II', len(binary), 0x004E4942) + binary)


def image_roles(gltf):
    """For each image: which material slots use it, and whether a non-opaque material samples it as colour."""
    roles = {}
    alpha = set()
    tex = gltf.get('textures', [])
    for m in gltf.get('materials', []):
        pbr = m.get('pbrMetallicRoughness', {})
        slots = [('base', pbr.get('baseColorTexture')), ('mr', pbr.get('metallicRoughnessTexture')),
                 ('normal', m.get('normalTexture')), ('occ', m.get('occlusionTexture')),
                 ('emis', m.get('emissiveTexture'))]
        for role, ref in slots:
            if not ref:
                continue
            src = tex[ref['index']].get('source')
            if src is None:
                continue
            roles.setdefault(src, set()).add(role)
            if role == 'base' and m.get('alphaMode', 'OPAQUE') != 'OPAQUE':
                alpha.add(src)
    return roles, alpha


def encode(img, roles, keep_alpha):
    if max(img.size) > MAX_SIZE:
        s = MAX_SIZE / max(img.size)
        img = img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)
    out = io.BytesIO()
    if keep_alpha:
        img.save(out, 'PNG', optimize=True)
        return out.getvalue(), 'image/png'
    q = max(QUALITY[r] for r in roles) if roles else 86
    img.convert('RGB').save(out, 'JPEG', quality=q, optimize=True, progressive=False,
                            subsampling=0 if 'normal' in roles else 2)
    return out.getvalue(), 'image/jpeg'


def compress(path):
    data = path.read_bytes()
    gltf, binary = read_glb(data)
    images = gltf.get('images', [])
    if not images:
        return len(data), len(data)
    roles, alpha = image_roles(gltf)
    views = gltf['bufferViews']
    image_views = {im['bufferView'] for im in images if 'bufferView' in im}

    # Re-encode each image, then store identical results once.
    encoded = []
    for i, im in enumerate(images):
        v = views[im['bufferView']]
        raw = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        if im.get('mimeType') == 'image/jpeg':
            encoded.append((raw, 'image/jpeg'))
            continue
        img = Image.open(io.BytesIO(raw))
        img.load()
        keep_alpha = False
        if img.mode in ('RGBA', 'LA', 'P') and i in alpha:
            lo = img.convert('RGBA').getchannel('A').getextrema()[0]
            keep_alpha = lo < 250
        encoded.append(encode(img, roles.get(i, {'base'}), keep_alpha))

    # Rebuild the binary: geometry views first (unchanged), then one view per unique image.
    new_views = []
    remap = {}
    chunks = []
    offset = 0

    def add(blob):
        nonlocal offset
        pad = -offset % 4
        if pad:
            chunks.append(b'\0' * pad)
            offset += pad
        chunks.append(blob)
        start = offset
        offset += len(blob)
        return start

    for idx, v in enumerate(views):
        if idx in image_views:
            continue
        raw = binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        nv = dict(v)
        nv['byteOffset'] = add(raw)
        remap[idx] = len(new_views)
        new_views.append(nv)

    seen = {}
    image_remap = {}
    new_images = []
    for i, (blob, mime) in enumerate(encoded):
        h = hashlib.sha1(blob).hexdigest()
        if h in seen:
            image_remap[i] = seen[h]
            continue
        start = add(blob)
        new_views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(blob)})
        im = {k: val for k, val in images[i].items() if k not in ('bufferView', 'mimeType')}
        im.update({'bufferView': len(new_views) - 1, 'mimeType': mime})
        seen[h] = len(new_images)
        image_remap[i] = len(new_images)
        new_images.append(im)

    # Point everything at the new indices.
    for acc in gltf.get('accessors', []):
        if 'bufferView' in acc:
            acc['bufferView'] = remap[acc['bufferView']]
        sp = acc.get('sparse')
        if sp:
            sp['indices']['bufferView'] = remap[sp['indices']['bufferView']]
            sp['values']['bufferView'] = remap[sp['values']['bufferView']]
    for t in gltf.get('textures', []):
        if 'source' in t:
            t['source'] = image_remap[t['source']]
    gltf['bufferViews'] = new_views
    gltf['images'] = new_images
    body = b''.join(chunks)
    gltf['buffers'][0]['byteLength'] = len(body)
    out = write_glb(gltf, body)
    if len(out) > len(data) * 0.97:
        return len(data), len(data)  # (not worth rewriting)
    path.write_bytes(out)
    return len(data), len(out)


def main(argv):
    files = [Path(a) for a in argv] or sorted(Path('assets/models').glob('*.glb'))
    before = after = 0
    for f in files:
        b, a = compress(f)
        before += b
        after += a
        if b != a:
            print(f'{f.name:32s} {b / 1e6:6.2f} MB -> {a / 1e6:6.2f} MB')
    print(f'total {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1:])

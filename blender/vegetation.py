"""Vegetation sprites: grass tufts and weeds modelled as real blades and leaves, rendered from
the side with a transparent background into one atlas (assets/textures/vegetation.png).
The game shows each one on a few crossed cards.

Cells, left to right: green tuft, dry tuft, ragwort (yellow flowers), thistle.
Run:  <python with bpy> blender/vegetation.py [--fast]"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground import srgb, mesh_from_arrays, attr_material, ico  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures', 'vegetation.png')
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', 'veg')
FAST = '--fast' in sys.argv
CELL = 128 if FAST else 512
SIZE = 1.0  # metres covered by one cell (width and height)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


class Builder:
    """Collects triangles with per-vertex colours into one mesh."""

    def __init__(self):
        self.V, self.F, self.C = [], [], []
        self.off = 0

    def add(self, verts, tris, col):
        verts = np.asarray(verts, float)
        self.V.append(verts)
        self.F.append(np.asarray(tris) + self.off)
        col = np.asarray(col, float)
        self.C.append(np.repeat(col[None], len(verts), 0) if col.ndim == 1 else col)
        self.off += len(verts)

    def build(self, name, mat):
        if not self.V:
            return None
        return mesh_from_arrays(name, np.concatenate(self.V), np.concatenate(self.F), np.concatenate(self.C), mat)


def blade(b, rng, base, length, width, azimuth, lean, col, segs=5, droop=0.0):
    """A curved strap from `base`, leaning outwards; tip droops. Darker at the root."""
    d = np.array([math.cos(azimuth), math.sin(azimuth), 0.0])
    side = np.array([-d[1], d[0], 0.0])
    pts = []
    for i in range(segs + 1):
        t = i / segs
        a = lean * t + droop * t * t
        p = np.array(base, float) + d * length * math.sin(a) * t * 0.9 + np.array([0, 0, length * t * math.cos(a * 0.9)])
        pts.append(p)
    verts, cols = [], []
    for i, p in enumerate(pts):
        t = i / segs
        w = width * (1 - t) ** 0.7
        verts += [p - side * w, p + side * w]
        shade = 0.45 + 0.65 * t
        cols += [col * shade, col * shade]
    tris = []
    for i in range(segs):
        a = i * 2
        tris += [[a, a + 1, a + 3], [a, a + 3, a + 2]]
    b.add(verts, tris, np.array(cols))


def leaf(b, base, length, width, azimuth, rise, col, segs=6):
    """A broad pointed leaf (weeds)."""
    d = np.array([math.cos(azimuth), math.sin(azimuth), 0.0])
    side = np.array([-d[1], d[0], 0.0])
    verts, cols = [], []
    for i in range(segs + 1):
        t = i / segs
        p = np.array(base, float) + d * length * t + np.array([0, 0, length * (rise * t - 0.35 * t * t)])
        w = width * math.sin(math.pi * min(1.0, t * 1.1)) * (1 - 0.3 * t)
        verts += [p - side * w, p + side * w]
        cols += [col * (0.6 + 0.4 * t)] * 2
    tris = []
    for i in range(segs):
        a = i * 2
        tris += [[a, a + 1, a + 3], [a, a + 3, a + 2]]
    b.add(verts, tris, np.array(cols))


def stem(b, base, top, radius, col):
    base = np.array(base, float)
    top = np.array(top, float)
    n = 5
    verts = []
    for p, r in ((base, radius), (top, radius * 0.6)):
        for k in range(n):
            a = 2 * math.pi * k / n
            verts.append(p + np.array([math.cos(a) * r, math.sin(a) * r, 0]))
    tris = []
    for k in range(n):
        k2 = (k + 1) % n
        tris += [[k, k2, n + k2], [k, n + k2, n + k]]
    b.add(verts, tris, col)


def blob(b, rng, center, r, col, flat=1.0):
    v0, f0 = ico(1)
    v = v0 * r * np.array([1, 1, flat]) * (1 + 0.15 * rng.standard_normal((len(v0), 1)))
    b.add(v + np.array(center), f0, col)


def tuft(rng, dry):
    b = Builder()
    greens = [srgb(c) for c in ('#5f7a34', '#51692b', '#6f8a3c', '#46602a', '#7c8f45')]
    straws = [srgb(c) for c in ('#b8a46e', '#a8935c', '#c7b582', '#9a8a5a')]
    count = 150 if dry else 190
    for _ in range(count):
        r = abs(rng.normal(0, 0.05))
        a = rng.uniform(0, 2 * math.pi)
        base = (math.cos(a) * r, math.sin(a) * r, 0)
        if dry:
            col = straws[rng.integers(len(straws))] if rng.uniform() < 0.8 else greens[rng.integers(len(greens))] * 1.1
        else:
            col = greens[rng.integers(len(greens))] if rng.uniform() < 0.88 else straws[rng.integers(len(straws))]
        col = col * rng.uniform(0.85, 1.15)
        L = rng.uniform(0.2, 0.55) * (1.1 if dry else 1.0)
        blade(b, rng, base, L, rng.uniform(0.004, 0.008), a + rng.normal(0, 0.4),
              rng.uniform(0.1, 0.5) + r * 3, col, droop=rng.uniform(0.0, 0.7))
    # Seed heads on the dry tuft.
    if dry:
        for _ in range(6):
            a = rng.uniform(0, 2 * math.pi)
            h = rng.uniform(0.55, 0.85)
            x, y = math.cos(a) * rng.uniform(0, 0.12), math.sin(a) * rng.uniform(0, 0.12)
            stem(b, (0, 0, 0), (x, y, h), 0.0025, straws[0] * 0.9)
            for k in range(6):
                blob(b, rng, (x + rng.normal(0, 0.008), y + rng.normal(0, 0.008), h - k * 0.018), 0.007,
                     straws[1] * 0.9, flat=1.6)
    return b


def ragwort(rng):
    b = Builder()
    leafc = srgb('#4a6329')
    for _ in range(9):
        a = rng.uniform(0, 2 * math.pi)
        leaf(b, (0, 0, 0.01), rng.uniform(0.14, 0.24), rng.uniform(0.03, 0.05), a, 0.5, leafc * rng.uniform(0.8, 1.2))
    yellow = srgb('#e8b923')
    for _ in range(5):
        a = rng.uniform(0, 2 * math.pi)
        top = np.array([math.cos(a) * rng.uniform(0, 0.08), math.sin(a) * rng.uniform(0, 0.08), rng.uniform(0.55, 0.8)])
        stem(b, (0, 0, 0), top, 0.004, srgb('#56622f'))
        for _ in range(3):
            leaf(b, top * rng.uniform(0.3, 0.7), 0.08, 0.02, rng.uniform(0, 6.28), 0.3, leafc)
        for _ in range(14):
            p = top + np.array([rng.normal(0, 0.035), rng.normal(0, 0.035), rng.normal(0, 0.012)])
            blob(b, rng, p, rng.uniform(0.009, 0.013), yellow * rng.uniform(0.85, 1.1), flat=0.6)
    for _ in range(40):
        a = rng.uniform(0, 2 * math.pi)
        blade(b, rng, (math.cos(a) * 0.05, math.sin(a) * 0.05, 0), rng.uniform(0.15, 0.35), 0.004, a, 0.5,
              srgb('#5f7a34') * rng.uniform(0.8, 1.1), droop=0.6)
    return b


def thistle(rng):
    b = Builder()
    leafc = srgb('#5d7547')
    for _ in range(8):
        a = rng.uniform(0, 2 * math.pi)
        leaf(b, (0, 0, 0.01), rng.uniform(0.18, 0.28), rng.uniform(0.04, 0.06), a, 0.35, leafc * rng.uniform(0.85, 1.15), segs=8)
    purple = srgb('#9b4f8f')
    for _ in range(3):
        a = rng.uniform(0, 2 * math.pi)
        top = np.array([math.cos(a) * rng.uniform(0.02, 0.1), math.sin(a) * rng.uniform(0.02, 0.1), rng.uniform(0.6, 0.9)])
        stem(b, (0, 0, 0), top, 0.006, srgb('#63744b'))
        for k in range(4):
            t = rng.uniform(0.25, 0.8)
            leaf(b, top * t, 0.12, 0.03, rng.uniform(0, 6.28), 0.2, leafc)
        blob(b, rng, top, 0.025, srgb('#5c6e42'))
        blob(b, rng, top + np.array([0, 0, 0.025]), 0.02, purple, flat=0.8)
    return b


CELLS = [('tuft', lambda rng: tuft(rng, False)), ('dry', lambda rng: tuft(rng, True)),
         ('ragwort', ragwort), ('thistle', thistle)]


def render_cell(name, builder):
    scene = bpy.context.scene
    builder.build(name, attr_material(name + 'Mat', 0.12, 300))
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16 if FAST else 64
    scene.cycles.use_denoising = True
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = CELL
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('Sky')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    scene.world = world
    # Even white light only: the colour stays true (the game adds sunlight itself) and the
    # inside of each clump comes out naturally shadowed.
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = SIZE
    cam.location = (0, -5, SIZE / 2)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    path = os.path.join(TMP, name + '.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def dilate(rgba, steps=12):
    """Spread colour into transparent pixels so edges don't get dark halos when mipmapped."""
    rgb = rgba[..., :3].copy()
    known = rgba[..., 3] > 0.02
    for _ in range(steps):
        acc = np.zeros_like(rgb)
        cnt = np.zeros(known.shape)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            k = np.roll(known, (dy, dx), (0, 1))
            acc += np.roll(rgb, (dy, dx), (0, 1)) * k[..., None]
            cnt += k
        grow = (~known) & (cnt > 0)
        rgb[grow] = acc[grow] / cnt[grow][:, None]
        known = known | grow
    out = rgba.copy()
    out[..., :3] = rgb
    return out


def main():
    os.makedirs(TMP, exist_ok=True)
    rng = np.random.default_rng(21)
    cells = []
    for name, make in CELLS:
        reset()
        path = render_cell(name, make(rng))
        img = bpy.data.images.load(path)
        a = np.array(img.pixels[:]).reshape(CELL, CELL, 4)
        cells.append(dilate(a))
    atlas = np.concatenate(cells, 1)
    img = bpy.data.images.new('vegetation', atlas.shape[1], atlas.shape[0], alpha=True)
    img.pixels.foreach_set(atlas.astype(np.float32).ravel())
    img.filepath_raw = OUT
    img.file_format = 'PNG'
    img.save()
    print(f'saved {OUT}')


if __name__ == '__main__':
    main()

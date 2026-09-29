"""Tree sprites for the countryside around the pit: branching trees with thousands of leaves,
rendered from the side with a transparent background into one atlas
(assets/textures/trees.png). The game shows each on a few crossed cards.

Cells, left to right: oak, poplar, hawthorn bush.
Run:  <python with bpy> blender/trees.py [--fast]"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ground import srgb, attr_material, ico  # noqa: E402
from vegetation import Builder, dilate, reset  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'textures', 'trees.png')
TMP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build', 'trees')
FAST = '--fast' in sys.argv
CELL = 192 if FAST else 768


def perp(d):
    a = np.array([1.0, 0, 0]) if abs(d[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(d, a)
    u /= np.linalg.norm(u)
    return u, np.cross(d, u)


def limb(b, p0, p1, r0, r1, col, sides=6):
    d = p1 - p0
    d = d / np.linalg.norm(d)
    u, v = perp(d)
    verts = []
    for p, r in ((p0, r0), (p1, r1)):
        for k in range(sides):
            a = 2 * math.pi * k / sides
            verts.append(p + (u * math.cos(a) + v * math.sin(a)) * r)
    tris = []
    for k in range(sides):
        k2 = (k + 1) % sides
        tris += [[k, k2, sides + k2], [k, sides + k2, sides + k]]
    b.add(verts, tris, col)


def grow(rng, bark, twigs, p, d, length, radius, level, spec):
    """Recursive branches. Collects twig tips (where leaves go)."""
    segs = 3
    pts = [p]
    dd = d.copy()
    for i in range(segs):
        dd = dd + rng.normal(0, spec['wiggle'], 3)
        dd[2] += spec['up']
        dd /= np.linalg.norm(dd)
        pts.append(pts[-1] + dd * length / segs)
    for i in range(segs):
        r0 = radius * (1 - 0.6 * i / segs)
        r1 = radius * (1 - 0.6 * (i + 1) / segs)
        limb(bark, pts[i], pts[i + 1], r0, r1, spec['bark'] * rng.uniform(0.85, 1.1))
    if level >= spec['levels']:
        twigs.append(pts[-1])
        return
    n = spec['children'][level]
    for _ in range(n):
        t = rng.uniform(spec['start'][level], 1.0)
        seg = min(segs - 1, int(t * segs))
        base = pts[seg] + (pts[seg + 1] - pts[seg]) * (t * segs - seg)
        u, v = perp(dd)
        a = rng.uniform(0, 2 * math.pi)
        spread = spec['spread'][level]
        nd = dd * math.cos(spread) + (u * math.cos(a) + v * math.sin(a)) * math.sin(spread)
        nd /= np.linalg.norm(nd)
        grow(rng, bark, twigs, base, nd, length * spec['ratio'] * rng.uniform(0.75, 1.15),
             radius * 0.55, level + 1, spec)
    if level >= 1:
        twigs.append(pts[-1])


def leaves(rng, b, twigs, spec):
    pal = [srgb(c) for c in spec['leaves']]
    # Dark inner foliage masses, so the crown reads solid with leaves around the outside.
    v0, f0 = ico(2)
    for tip in twigs:
        r = spec['clump'] * rng.uniform(0.9, 1.3)
        v = v0 * r * np.array([1.0, 1.0, 0.75]) * (1 + 0.2 * rng.standard_normal((len(v0), 1)))
        b.add(v + tip, f0, pal[rng.integers(len(pal))] * 0.45)
    for tip in twigs:
        for _ in range(spec['per_twig']):
            c = tip + rng.normal(0, spec['clump'], 3) * np.array([1, 1, 0.7])
            n = rng.normal(0, 1, 3)
            n[2] += 1.2
            n /= np.linalg.norm(n)
            u, v = perp(n)
            s = spec['leaf'] * rng.uniform(0.7, 1.3)
            ang = rng.uniform(0, 2 * math.pi)
            du = u * math.cos(ang) + v * math.sin(ang)
            dv = np.cross(n, du)
            verts = [c - du * s * 0.5, c + dv * s * 0.3, c + du * s * 0.5, c - dv * s * 0.3]
            col = pal[rng.integers(len(pal))] * rng.uniform(0.8, 1.15)
            b.add(verts, [[0, 1, 2], [0, 2, 3]], col)


SPECS = {
    'oak': dict(height=5.0, radius=0.35, levels=3, children=[7, 5, 4], start=[0.45, 0.2, 0.2],
                spread=[0.95, 0.8, 0.7], ratio=0.72, wiggle=0.12, up=0.05, bark=srgb('#4d4439'),
                leaves=['#3f5a26', '#4b6a2c', '#35501f', '#56733a'], per_twig=150, clump=0.7, leaf=0.22,
                trunk_len=4.6, size=16.0),
    'poplar': dict(height=9.0, radius=0.28, levels=3, children=[12, 4, 3], start=[0.15, 0.3, 0.3],
                   spread=[0.35, 0.5, 0.6], ratio=0.4, wiggle=0.06, up=0.25, bark=srgb('#6b6558'),
                   leaves=['#4f6b2e', '#5b7a35', '#46612a', '#6a8540'], per_twig=110, clump=0.5, leaf=0.18,
                   trunk_len=9.0, size=15.0),
    'hawthorn': dict(height=1.2, radius=0.12, levels=3, children=[6, 4, 4], start=[0.1, 0.2, 0.2],
                     spread=[0.8, 0.8, 0.8], ratio=0.7, wiggle=0.2, up=0.03, bark=srgb('#4a4036'),
                     leaves=['#3d5524', '#4a6329', '#344b1e', '#5d6f33', '#8a8a4a'], per_twig=110, clump=0.45,
                     leaf=0.15, trunk_len=1.4, size=7.5),
}


def build_tree(rng, name):
    spec = SPECS[name]
    bark = Builder()
    leaf = Builder()
    twigs = []
    start = np.array([0.0, 0.0, 0.0])
    if name == 'hawthorn':
        # Several stems from the ground.
        for _ in range(5):
            d = np.array([rng.normal(0, 0.4), rng.normal(0, 0.4), 1.0])
            grow(rng, bark, twigs, start, d / np.linalg.norm(d), spec['trunk_len'], spec['radius'], 1, spec)
    else:
        grow(rng, bark, twigs, start, np.array([0, 0, 1.0]), spec['trunk_len'], spec['radius'], 0, spec)
    leaves(rng, leaf, twigs, spec)
    bark.build(name + 'Bark', attr_material(name + 'BarkMat', 0.2, 60))
    leaf.build(name + 'Leaves', attr_material(name + 'LeafMat', 0.1, 40))
    return spec['size']


def render_cell(name, size):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16 if FAST else 48
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
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = size
    cam.location = (0, -30, size / 2)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    path = os.path.join(TMP, name + '.png')
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    os.makedirs(TMP, exist_ok=True)
    rng = np.random.default_rng(5)
    cells = []
    for name in SPECS:
        reset()
        size = build_tree(rng, name)
        img = bpy.data.images.load(render_cell(name, size))
        cells.append(dilate(np.array(img.pixels[:]).reshape(CELL, CELL, 4)))
    atlas = np.concatenate(cells, 1)
    img = bpy.data.images.new('trees', atlas.shape[1], atlas.shape[0], alpha=True)
    img.pixels.foreach_set(atlas.astype(np.float32).ravel())
    img.filepath_raw = OUT
    img.file_format = 'PNG'
    img.save()
    print(f'saved {OUT}')


if __name__ == '__main__':
    main()

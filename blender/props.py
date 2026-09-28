"""Site props: office portacabin, diesel tank, concrete blocks, boulders, traffic cone.
Each prop is exported as its own .glb (origin on the ground at its centre)."""
import math
import bmesh
import numpy as np
from mathutils import Matrix, Vector
import lib
import textures as tex
from lib import bm_box, bm_cylinder, bm_profile, merge, mesh_object, empty, finish, material


def rock_texture(size=512, seed=51):
    n = tex.fractal_noise(size, 2.0, seed)
    m = tex.fractal_noise(size, 1.3, seed + 1)
    c = tex.smoothstep(0.6, 0.9, tex.fractal_noise(size, 2.8, seed + 2))
    base = tex.lerp([0.42, 0.39, 0.35], [0.6, 0.56, 0.5], n)
    base = tex.lerp(base, [0.5, 0.42, 0.32], m * 0.5)
    base = base * (1 - 0.35 * c[..., None])
    return tex.to_rgba(base)


def office():
    root = empty('Office')
    clad = material('Cladding', (0.92, 0.93, 0.9), 'planks', tex.planks, 512, roughness=0.7)
    trim = material('Trim', (0.2, 0.28, 0.36), 'paint_worn', tex.paint_worn, roughness=0.5)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    glass = material('Glass', (0.02, 0.025, 0.03), roughness=0.04, metallic=0.6, vertex_color=False)
    concrete = material('Concrete', (1, 1, 1), 'concrete', tex.concrete, 512, roughness=0.9)
    L, W, H, lift = 7.8, 3.6, 2.7, 0.35
    body = mesh_object('Body', bm_box((L, W, H), (0, 0, lift + H / 2)), clad, root)
    finish(body, 0.03, uv_scale=2.4, dirt_range=(0, 1.2))
    frame = [bm_box((L + 0.1, W + 0.1, 0.12), (0, 0, lift + 0.06)),  # base frame
             bm_box((L + 0.3, W + 0.3, 0.15), (0, 0, lift + H + 0.07))]  # roof
    for x in (-L / 2, L / 2):
        for y in (-W / 2, W / 2):
            frame.append(bm_box((0.14, 0.14, H), (x, y, lift + H / 2)))  # corner posts
    fr = mesh_object('Frame', merge(*frame), trim, root)
    finish(fr, 0.02, dirt_range=(0, 1.2))
    # Windows and door on the front (-Y, which faces +Z / south in the game).
    y = -W / 2 - 0.02
    wins, frames = [], []
    for x in (-2.6, -1.2, 2.2):
        b = bmesh.new()
        b.faces.new([b.verts.new(p) for p in [(x - 0.55, y, lift + 1.0), (x + 0.55, y, lift + 1.0),
                                                (x + 0.55, y, lift + 2.0), (x - 0.55, y, lift + 2.0)]])
        wins.append(b)
        frames += [bm_box((1.24, 0.06, 0.07), (x, y, lift + 0.97)), bm_box((1.24, 0.06, 0.07), (x, y, lift + 2.03)),
                   bm_box((0.07, 0.06, 1.1), (x - 0.59, y, lift + 1.5)), bm_box((0.07, 0.06, 1.1), (x + 0.59, y, lift + 1.5)),
                   bm_box((0.04, 0.06, 1.0), (x, y, lift + 1.5))]
    g = mesh_object('Windows', lib.orient_outward(merge(*wins), (0, 0, 1.5)), glass, root)
    lib.box_uv(g)
    frames.append(bm_box((0.95, 0.06, 2.05), (0.5, y, lift + 1.03)))  # door
    frames.append(bm_box((0.12, 0.08, 0.04), (0.85, y - 0.03, lift + 1.05)))  # handle
    f2 = mesh_object('WindowFrames', merge(*frames), trim, root)
    finish(f2, 0.008, dirt_range=(0, 1.2))
    # Steps, AC unit, downpipe, feet.
    st = [bm_box((1.2, 0.35, 0.05), (0.5, y - 0.2 - k * 0.3, lift - 0.12 - k * 0.12)) for k in range(2)]
    st += [bm_box((0.05, 0.9, 0.05), (0.5 + s * 0.6, y - 0.4, lift + 0.3)) for s in (-1, 1)]  # rails
    st.append(bm_box((0.8, 0.35, 0.6), (-3.2, W / 2 + 0.2, lift + 1.6)))  # AC unit
    st.append(bm_cylinder(0.05, H, 'Z', 10, (L / 2 + 0.1, -W / 2 + 0.2, lift + H / 2)))
    s_obj = mesh_object('Fittings', merge(*st), steel, root)
    finish(s_obj, 0.01, dirt_range=(0, 1.2))
    feet = [bm_box((0.5, 0.5, lift + 0.1), (x, yy, (lift + 0.1) / 2 - 0.05)) for x in (-3.5, 0, 3.5) for yy in (-1.5, 1.5)]
    ft = mesh_object('Feet', merge(*feet), concrete, root)
    finish(ft, 0.02, dirt_range=(-0.1, 0.5))
    return root


def fuel_tank():
    root = empty('FuelTank')
    green = material('TankPaint', (0.03, 0.13, 0.06), 'paint_worn', tex.paint_worn, roughness=0.5)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    black = material('Hose', (0.02, 0.02, 0.02), roughness=0.8, vertex_color=False)
    tank = merge(bm_cylinder(0.8, 3.0, 'X', 32, (0, 0, 1.25)),
                 lib.bm_lathe([(0.8, 1.5), (0.6, 1.62), (0.0, 1.65)], 32, 'X', (0, 0, 1.25)),
                 lib.bm_lathe([(0.0, -1.65), (0.6, -1.62), (0.8, -1.5)], 32, 'X', (0, 0, 1.25)))
    t = mesh_object('Tank', tank, green, root)
    finish(t, 0, dirt_range=(0, 1.5))
    frame = []
    for x in (-1.0, 1.0):
        frame.append(bm_box((0.2, 1.4, 0.5), (x, 0, 0.35)))
    frame += [bm_box((3.2, 0.12, 0.12), (0, s * 0.65, 0.06)) for s in (-1, 1)]
    frame.append(bm_box((0.6, 0.5, 0.8), (1.8, -0.4, 0.45)))  # pump cabinet
    for k in range(6):  # ladder rungs
        frame.append(bm_box((0.04, 0.45, 0.04), (-1.3, 0.85, 0.3 + k * 0.28)))
    frame += [bm_box((0.04, 0.04, 1.8), (-1.3, 0.85 + s * 0.22, 1.0)) for s in (-1, 1)]
    f = mesh_object('Frame', merge(*frame), steel, root)
    finish(f, 0.01, dirt_range=(0, 1.2))
    hose = lib.bm_torus(0.25, 0.03, 'X', 20, 6, (2.12, -0.4, 0.55))
    mesh_object('Hose', hose, black, root).data.shade_smooth()
    return root


def concrete_block():
    """Interlocking 'lego' block, 1.6 x 0.8 x 0.8 m."""
    root = empty('Block')
    concrete = material('Concrete', (1, 1, 1), 'concrete', tex.concrete, 512, roughness=0.9)
    parts = [bm_box((1.6, 0.8, 0.8), (0, 0, 0.4))]
    parts += [bm_cylinder(0.14, 0.08, 'Z', 16, (x, 0, 0.84)) for x in (-0.4, 0.4)]
    b = mesh_object('BlockBody', merge(*parts), concrete, root)
    finish(b, 0.03, uv_scale=1.5, dirt_range=(-0.2, 0.9))
    return root


def boulder(seed):
    """Fractured rock: the convex hull of random points on a squashed ellipsoid gives
    flat broken faces; a subdivision and a little noise take the edge off."""
    root = empty('Boulder')
    rock = material('Rock', (0.85, 0.8, 0.72), 'rock', rock_texture, 512, roughness=0.95)
    rng = np.random.default_rng(seed)
    stretch = Vector((rng.uniform(1.0, 1.5), rng.uniform(0.8, 1.2), rng.uniform(0.6, 0.85)))
    bm = bmesh.new()
    for _ in range(34):
        d = Vector(rng.normal(size=3)).normalized()
        r = rng.uniform(0.8, 1.0)
        bm.verts.new((d.x * stretch.x * r, d.y * stretch.y * r, d.z * stretch.z * r))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * rng.uniform(-0.03, 0.03)
    zmin = min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, -zmin - 0.12), verts=bm.verts)  # sit slightly into the ground
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object('BoulderMesh', bm, rock, root)
    finish(o, 0.02, 1, uv_scale=1.0, smooth_angle=30, dirt_range=(-0.2, 1.0))
    return root


def cone():
    root = empty('Cone')
    orange = material('ConeOrange', (0.95, 0.3, 0.02), roughness=0.6, vertex_color=False)
    white = material('ConeWhite', (0.9, 0.9, 0.9), roughness=0.4, vertex_color=False)
    black = material('ConeBase', (0.03, 0.03, 0.03), roughness=0.8, vertex_color=False)
    mesh_object('Base', bm_box((0.4, 0.4, 0.04), (0, 0, 0.02)), black, root)
    body = lib.bm_lathe([(0.16, 0.04), (0.035, 0.72), (0.0, 0.72)], 20, 'Z')
    mesh_object('ConeBody', body, orange, root).data.shade_smooth()
    band = lib.bm_lathe([(0.113, 0.3), (0.087, 0.45)], 20, 'Z')
    mesh_object('Band', band, white, root).data.shade_smooth()
    return root


PARTS = {
    'office': office,
    'fueltank': fuel_tank,
    'block': concrete_block,
    'boulder1': lambda: boulder(1),
    'boulder2': lambda: boulder(2),
    'boulder3': lambda: boulder(3),
    'cone': cone,
}


def build(part):
    return PARTS[part]()


def PREVIEW(part):
    if part == 'office':
        return dict(target=(0, 0, 1.4), distance=13, angle=-60, elevation=16)
    if part == 'fueltank':
        return dict(target=(0, 0, 1.0), distance=7.5, angle=-50, elevation=18)
    if part == 'cone':
        return dict(target=(0, 0, 0.35), distance=2.2, angle=-50, elevation=20, samples=24)
    return dict(target=(0, 0, 0.5), distance=5, angle=-50, elevation=20, samples=24)

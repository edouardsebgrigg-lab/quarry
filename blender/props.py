"""Site props: office portacabin, diesel tank, concrete blocks, boulders, traffic cone.
Each prop is exported as its own .glb (origin on the ground at its centre)."""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
import lib
import pickup as pickup_model
import handtools
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
    clad = material('Cladding', (0.74, 0.74, 0.69), 'planks', tex.planks, 512, roughness=0.7)
    trim = material('Trim', (0.2, 0.28, 0.36), 'paint_worn', tex.paint_worn, roughness=0.5)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    glass = material('Glass', (0.02, 0.025, 0.03), roughness=0.04, metallic=0.6, vertex_color=False)
    concrete = material('Concrete', (1, 1, 1), 'concrete', tex.concrete, 512, roughness=0.9)
    L, W, H, lift = 7.8, 3.6, 2.7, 0.35
    body = mesh_object('Body', bm_box((L, W, H), (0, 0, lift + H / 2)), clad, root)
    finish(body, 0.03, uv_scale=2.4, dirt_range=(-0.4, 2.2))
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
    frame.append(lib.rounded_box((0.6, 0.5, 0.8), (1.8, -0.4, 0.45), 0.05))  # pump cabinet
    frame.append(lib.rounded_box((0.08, 0.14, 0.26), (1.8, -0.68, 0.55), 0.02))  # nozzle holster
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
    parts = [lib.rounded_box((1.6, 0.8, 0.8), (0, 0, 0.4), 0.035, 2)]
    parts += [lib.bm_lathe([(0.14, 0.8), (0.14, 0.86), (0.12, 0.88), (0.0, 0.88)], 24, 'Z', (x, 0, 0)) for x in (-0.4, 0.4)]
    b = mesh_object('BlockBody', merge(*parts), concrete, root)
    finish(b, 0, uv_scale=1.5, smooth_angle=40, dirt_range=(-0.2, 0.9))
    return root


def boulder(seed):
    """A weathered boulder: a random convex lump, smoothed, then roughened with layered
    noise and cut by a few flat fracture planes (where it split off the rock face)."""
    from mathutils import noise
    root = empty('Boulder')
    rock = material('Rock', (0.74, 0.68, 0.6), 'rock', rock_texture, 512, roughness=0.95)
    rng = np.random.default_rng(seed)
    stretch = Vector((rng.uniform(1.0, 1.5), rng.uniform(0.8, 1.2), rng.uniform(0.6, 0.85)))
    bm = bmesh.new()
    for _ in range(40):
        d = Vector(rng.normal(size=3)).normalized()
        r = rng.uniform(0.85, 1.0)
        bm.verts.new((d.x * stretch.x * r, d.y * stretch.y * r, d.z * stretch.z * r))
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('tmp_rock')
    bm.to_mesh(me)
    bm.free()
    tmp = bpy.data.objects.new('tmp_rock', me)
    bpy.context.scene.collection.objects.link(tmp)
    lib.subdivide(tmp, 2)
    lib.apply_modifiers(tmp)
    bm = bmesh.new()
    bm.from_mesh(tmp.data)
    bpy.data.objects.remove(tmp)
    bm.normal_update()
    off = Vector(rng.uniform(-100, 100, 3))
    for v in bm.verts:
        p = v.co * 1.3 + off
        n = (noise.fractal(p, 0.6, 2.2, 5) * 0.07            # lumps
             + noise.ridged_multi_fractal(p * 3.0, 0.8, 2.0, 3, 0.9, 2.0) * 0.03)  # crusty grain
        v.co += v.normal * n
    # Fracture planes: flatten everything beyond each plane onto it.
    for _ in range(5):
        d = Vector(rng.normal(size=3))
        d.z = abs(d.z) * 0.6 + 0.1
        d.normalize()
        cut = max(v.co.dot(d) for v in bm.verts) * rng.uniform(0.62, 0.8)
        for v in bm.verts:
            h = v.co.dot(d)
            if h > cut:
                # Flattened, with a little roughness left on the broken face.
                v.co -= d * (h - cut) * 0.96
    zmin = min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, -zmin - 0.12), verts=bm.verts)  # sit slightly into the ground
    o = mesh_object('BoulderMesh', bm, rock, root)
    finish(o, 0, uv_scale=1.0, smooth_angle=28, dirt_range=(-0.2, 1.0), weighted=False)
    return root


def cone():
    root = empty('Cone')
    orange = material('ConeOrange', (0.95, 0.3, 0.02), roughness=0.6, vertex_color=False)
    white = material('ConeWhite', (0.9, 0.9, 0.9), roughness=0.4, vertex_color=False)
    black = material('ConeBase', (0.03, 0.03, 0.03), roughness=0.8, vertex_color=False)
    base = lib.rounded_box((0.4, 0.4, 0.04), (0, 0, 0.02), 0.06)
    finish(mesh_object('Base', base, black, root), 0, dirt=False, smooth_angle=60)
    body = lib.bm_lathe([(0.17, 0.035), (0.165, 0.05), (0.04, 0.7), (0.03, 0.72), (0.0, 0.725)], 32, 'Z')
    mesh_object('ConeBody', body, orange, root).data.shade_smooth()
    band = lib.bm_lathe([(0.1155, 0.3), (0.0895, 0.45)], 32, 'Z')
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


# ---------------------------------------------------------------- character props

def _wood(name='Wood'):
    return material(name, (0.4, 0.36, 0.3), 'wood', tex.wood, 512, roughness=0.9)


def _corrugated(length, height, thickness=0.03, pitch=0.28, depth=0.04):
    """Points (x, y) of a corrugated steel sheet running along X, centred on y=0."""
    top, bot = [], []
    x = -length / 2
    k = 0
    while x < length / 2 - 1e-6:
        seg = [(x, 0.0), (x + pitch * 0.15, depth), (x + pitch * 0.5, depth), (x + pitch * 0.65, 0.0)]
        for px, py in seg:
            if px <= length / 2:
                top.append((px, py))
        x += pitch
        k += 1
    top.append((length / 2, 0.0))
    bot = [(px, py - thickness) for px, py in reversed(top)]
    return [(px, py - depth / 2) for px, py in top + bot]


def container():
    """A tired 20 ft shipping container: corrugated walls, doors at the -X end."""
    root = empty('Container')
    paint = material('ContainerPaint', (0.3, 0.085, 0.05), 'rust', tex.rust, roughness=0.7, metallic=0.25)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    L, W, H = 6.06, 2.44, 2.59
    walls = []
    for side in (-1, 1):  # long sides
        pts = _corrugated(L - 0.3, H - 0.3)
        bm = bmesh.new()
        prof = lib.bm_profile(pts, H - 0.3, 'Z', H / 2)
        bmesh.ops.translate(prof, vec=(0, side * (W / 2 - 0.03), 0), verts=prof.verts)
        walls.append(prof)
        bm.free()
    front = lib.bm_profile(_corrugated(W - 0.3, H - 0.3), H - 0.3, 'Z', H / 2)
    bmesh.ops.rotate(front, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Z'), verts=front.verts)
    bmesh.ops.translate(front, vec=(L / 2 - 0.05, 0, 0), verts=front.verts)
    walls.append(front)
    w = mesh_object('Walls', merge(*walls), paint, root)
    finish(w, 0, uv_scale=2.0, dirt_range=(-0.3, 1.6), dirt_color=(0.5, 0.3, 0.18))
    # Frame: corner posts, top and bottom rails, corner castings, roof, floor.
    fr = []
    for x in (-L / 2 + 0.08, L / 2 - 0.08):
        for y in (-W / 2 + 0.08, W / 2 - 0.08):
            fr.append(bm_box((0.16, 0.16, H), (x, y, H / 2)))
            for z in (0.09, H - 0.09):
                fr.append(bm_box((0.18, 0.18, 0.18), (x, y, z)))
    for y in (-W / 2 + 0.08, W / 2 - 0.08):
        fr += [bm_box((L, 0.14, 0.16), (0, y, 0.08)), bm_box((L, 0.12, 0.12), (0, y, H - 0.06))]
    for x in (-L / 2 + 0.08, L / 2 - 0.08):
        fr += [bm_box((0.14, W, 0.16), (x, 0, 0.08)), bm_box((0.12, W, 0.2), (x, 0, H - 0.1))]
    fr.append(bm_box((L - 0.1, W - 0.1, 0.04), (0, 0, H - 0.04)))
    f = mesh_object('Frame', merge(*fr), paint, root)
    finish(f, 0.012, uv_scale=2.0, dirt_range=(-0.3, 1.6), dirt_color=(0.5, 0.3, 0.18))
    # Doors: two leaves with vertical ribs, lock bars and handles.
    doors = []
    for y in (-W / 4, W / 4):
        doors.append(bm_box((0.05, W / 2 - 0.08, H - 0.34), (-L / 2 + 0.05, y, H / 2)))
        for k in range(-2, 3):
            doors.append(bm_box((0.04, 0.05, H - 0.4), (-L / 2 + 0.01, y + k * 0.2, H / 2)))
    d = mesh_object('Doors', merge(*doors), paint, root)
    finish(d, 0.005, uv_scale=2.0, dirt_range=(0, 1.8))
    bars = []
    for y in (-W / 2 + 0.3, -0.25, 0.25, W / 2 - 0.3):
        bars.append(bm_cylinder(0.022, H - 0.25, 'Z', 8, (-L / 2 - 0.04, y, H / 2)))
        bars.append(bm_box((0.05, 0.08, 0.1), (-L / 2 - 0.04, y, 0.3)))
        bars.append(bm_box((0.05, 0.08, 0.1), (-L / 2 - 0.04, y, H - 0.3)))
        bars.append(bm_box((0.06, 0.2, 0.04), (-L / 2 - 0.07, y + 0.1, 1.2)))
    b = mesh_object('LockBars', merge(*bars), steel, root)
    finish(b, 0, dirt_range=(0, 1.8))
    # Hinges on the doors.
    hinges = [lib.rounded_box((0.06, 0.1, 0.14), (-L / 2 - 0.03, y, z), 0.02)
              for y in (-W / 2 + 0.12, W / 2 - 0.12) for z in (0.5, 1.3, 2.1)]
    h = mesh_object('Hinges', merge(*hinges), steel, root)
    finish(h, 0, dirt_range=(0, 1.8))
    return root


def drum(rusty=False):
    """A 200 litre oil drum with rolling hoops."""
    root = empty('Drum')
    if rusty:
        paint = material('DrumRust', (0.9, 0.9, 0.9), 'rust', tex.rust, roughness=0.8, metallic=0.3)
    else:
        paint = material('DrumPaint', (0.06, 0.18, 0.45), 'paint_worn', tex.paint_worn, roughness=0.45, metallic=0.4)
    prof = [(0.0, 0.0), (0.285, 0.0), (0.295, 0.02), (0.285, 0.04), (0.285, 0.27), (0.3, 0.29), (0.285, 0.31),
            (0.285, 0.57), (0.3, 0.59), (0.285, 0.61), (0.285, 0.84), (0.295, 0.86), (0.285, 0.88), (0.0, 0.875)]
    body = lib.bm_lathe(prof, 32, 'Z')
    o = mesh_object('DrumBody', body, paint, root)
    finish(o, 0, uv_scale=0.9, smooth_angle=50, dirt_range=(-0.1, 0.9))
    caps = merge(bm_cylinder(0.03, 0.02, 'Z', 10, (0.17, 0.0, 0.885)), bm_cylinder(0.02, 0.02, 'Z', 8, (-0.17, 0.05, 0.885)))
    c = mesh_object('Bungs', caps, paint, root)
    finish(c, 0, dirt_range=(-0.1, 0.9))
    return root


def tyres():
    """A stack of old truck tyres, not quite straight."""
    root = empty('Tyres')
    rubber = material('Rubber', (1, 1, 1), 'rubber', tex.rubber, 512, roughness=0.9)
    rng = np.random.default_rng(4)
    parts = []
    w = 0.3
    prof = [(0.28, -w / 2), (0.38, -w / 2 - 0.015), (0.5, -w / 2 + 0.01), (0.54, -w / 2 + 0.05), (0.55, 0.0),
            (0.54, w / 2 - 0.05), (0.5, w / 2 - 0.01), (0.38, w / 2 + 0.015), (0.28, w / 2)]
    for k in range(4):
        t = [lib.bm_lathe(prof, 40, 'Z')]
        for i in range(26):  # worn lugs
            a = 2 * math.pi * i / 26
            lug = bm_box((0.05, 0.08, w * 0.7), (0.545, 0, 0))
            bmesh.ops.rotate(lug, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Z'), verts=lug.verts)
            t.append(lug)
        tm = merge(*t)
        tilt = Matrix.Rotation(rng.uniform(-0.05, 0.05), 3, 'X') @ Matrix.Rotation(rng.uniform(-0.05, 0.05), 3, 'Y')
        bmesh.ops.rotate(tm, cent=(0, 0, 0), matrix=tilt, verts=tm.verts)
        bmesh.ops.translate(tm, vec=(rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), w / 2 + 0.01 + k * (w + 0.02)),
                            verts=tm.verts)
        parts.append(tm)
    o = mesh_object('TyreStack', merge(*parts), rubber, root)
    finish(o, 0, uv_scale=0.6, smooth_angle=50, dirt_range=(-0.2, 1.4))
    return root


def pallets():
    """Three wooden pallets stacked a little askew."""
    root = empty('Pallets')
    wood = _wood()
    rng = np.random.default_rng(8)
    parts = []
    for k in range(3):
        z0 = k * 0.145
        dx, dy, rot = rng.uniform(-0.05, 0.05), rng.uniform(-0.05, 0.05), rng.uniform(-0.08, 0.08)
        p = [bm_box((1.2, 0.1, 0.1), (0, y, z0 + 0.072)) for y in (-0.45, 0, 0.45)]
        p += [bm_box((1.2, 0.1, 0.02), (0, y, z0 + 0.01)) for y in (-0.45, 0, 0.45)]
        p += [bm_box((0.1, 1.0, 0.022), (x, 0, z0 + 0.133)) for x in np.linspace(-0.55, 0.55, 7)]
        pm = merge(*p)
        bmesh.ops.rotate(pm, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, 'Z'), verts=pm.verts)
        bmesh.ops.translate(pm, vec=(dx, dy, 0), verts=pm.verts)
        parts.append(pm)
    o = mesh_object('PalletStack', merge(*parts), wood, root)
    finish(o, 0.004, uv_scale=0.8, dirt_range=(-0.1, 0.6))
    return root


def fence():
    """One 3 m bay of post-and-rail fence: a post at x=0 and three rails along +X."""
    root = empty('Fence')
    wood = _wood()
    parts = [bm_box((0.13, 0.13, 1.35), (0, 0, 0.55))]
    for z in (0.35, 0.7, 1.05):
        parts.append(bm_box((3.08, 0.04, 0.11), (1.5, 0.08, z)))
    o = mesh_object('Bay', merge(*parts), wood, root)
    finish(o, 0.008, uv_scale=0.9, dirt_range=(-0.2, 0.8))
    return root


def gate():
    """A galvanised five-bar farm gate (3.6 m, along +X) on its timber hanging post."""
    root = empty('Gate')
    galv = material('Galvanised', (0.7, 0.72, 0.72), 'metal_grime', tex.metal_grime, 512, roughness=0.45, metallic=0.9)
    wood = _wood()
    post = mesh_object('Post', bm_box((0.2, 0.2, 1.8), (0, 0, 0.7)), wood, root)
    finish(post, 0.01, uv_scale=0.9, dirt_range=(-0.2, 0.8))
    L, H, z0 = 3.6, 1.1, 0.12
    bars = []
    for k in range(5):
        z = z0 + H * k / 4
        bars.append(bm_cylinder(0.022, L, 'X', 8, (0.12 + L / 2, 0, z)))
    for x in (0.14, 0.12 + L):
        bars.append(bm_cylinder(0.028, H + 0.04, 'Z', 8, (x, 0, z0 + H / 2)))
    diag = bm_cylinder(0.02, math.hypot(L * 0.55, H), 'X', 8, (0, 0, 0))
    bmesh.ops.rotate(diag, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.atan2(H, L * 0.55), 3, 'Y'), verts=diag.verts)
    bmesh.ops.translate(diag, vec=(0.14 + L * 0.275, 0, z0 + H / 2), verts=diag.verts)
    bars.append(diag)
    bars += [bm_box((0.1, 0.05, 0.05), (0.1, 0, z)) for z in (z0 + 0.1, z0 + H - 0.1)]  # hinges
    g = mesh_object('Bars', merge(*bars), galv, root)
    finish(g, 0, smooth_angle=50, dirt_range=(-0.2, 1.0))
    return root


def portaloo():
    """Portable site toilet: moulded plastic cabin with a pale roof."""
    root = empty('Portaloo')
    body = material('LooBlue', (0.12, 0.3, 0.58), 'plastic', tex.plastic, 256, roughness=0.5)
    roof = material('LooRoof', (0.85, 0.85, 0.8), 'plastic', tex.plastic, 256, roughness=0.5)
    dark = material('Black', (0.02, 0.02, 0.02), roughness=0.8, vertex_color=False)
    shell = [lib.rounded_box((1.1, 1.1, 2.1), (0, 0, 1.12), 0.07), lib.rounded_box((1.22, 1.22, 0.12), (0, 0, 0.06), 0.04)]
    for y in (-0.36, -0.12, 0.12, 0.36):  # moulded ribs on the sides
        shell += [lib.rounded_box((1.14, 0.07, 1.85), (0, y, 1.12), 0.03)]
    s = mesh_object('Shell', merge(*shell), body, root)
    finish(s, 0, uv_scale=1.0, smooth_angle=50, dirt_range=(0, 1.2))
    dome = lib.bm_lathe([(0.62, 0.0), (0.55, 0.12), (0.3, 0.2), (0.0, 0.22)], 24, 'Z', (0, 0, 2.15))
    r = mesh_object('Roof', dome, roof, root)
    finish(r, 0, smooth_angle=60, dirt_range=(0, 1.2))
    bits = [lib.rounded_box((0.05, 0.84, 1.9), (0.56, 0, 1.08), 0.03),  # door
            lib.rounded_box((0.05, 0.12, 0.07), (0.6, 0.3, 1.1), 0.02),  # latch
            bm_cylinder(0.05, 0.6, 'Z', 16, (-0.4, 0.4, 2.3))]  # vent pipe
    d = mesh_object('Bits', merge(*bits), body, root)
    finish(d, 0, smooth_angle=50, dirt_range=(0, 1.2))
    mesh_object('Vent', bm_box((0.03, 0.4, 0.08), (0.58, 0, 1.95)), dark, root)
    return root


def pole():
    """Wooden power pole with a crossarm (along Y) and three insulators on top."""
    root = empty('Pole')
    wood = material('PoleWood', (0.38, 0.3, 0.22), 'wood', tex.wood, 512, roughness=0.9)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    ceramic = material('Insulator', (0.35, 0.22, 0.14), roughness=0.3, vertex_color=False)
    p = mesh_object('Pole', bm_cylinder(0.14, 9.2, 'Z', 12, (0, 0, 4.4), radius2=0.11), wood, root)
    finish(p, 0, uv_scale=0.8, smooth_angle=50, dirt_range=(-0.5, 1.5))
    arm = mesh_object('Arm', bm_box((0.12, 2.0, 0.1), (0, 0, 8.4)), wood, root)
    finish(arm, 0.01, dirt_range=(-0.5, 1.5))
    br = [bm_box((0.04, 0.9, 0.04), (0.08, s * 0.4, 8.1)) for s in (-1, 1)]
    for s in (-1, 1):
        mesh = br[(s + 1) // 2]
        bmesh.ops.rotate(mesh, cent=(0.08, 0, 8.1), matrix=Matrix.Rotation(s * 0.6, 3, 'X'), verts=mesh.verts)
    b = mesh_object('Braces', merge(*br), steel, root)
    finish(b, 0, dirt_range=(-0.5, 1.5))
    ins = merge(*[lib.bm_lathe([(0.05, 0.0), (0.07, 0.03), (0.045, 0.06), (0.065, 0.09), (0.03, 0.14), (0.0, 0.15)], 12, 'Z',
                              (0, y, 8.45)) for y in (-0.8, 0.0, 0.8)])
    mesh_object('Insulators', ins, ceramic, root).data.shade_smooth()
    return root


PARTS.update({
    'container': container,
    'drum': lambda: drum(False),
    'drumrust': lambda: drum(True),
    'tyres': tyres,
    'pallets': pallets,
    'pickup': lambda: pickup_model.build(),
    'fence': fence,
    'gate': gate,
    'portaloo': portaloo,
    'pole': pole,
    **handtools.PARTS,
})

_PREVIEWS = {
    'container': dict(target=(0, 0, 1.3), distance=11, angle=-130, elevation=15),
    'pickup': pickup_model.PREVIEW,
    'gate': dict(target=(1.8, 0, 0.7), distance=6, angle=-60, elevation=15, samples=24),
    'fence': dict(target=(1.5, 0, 0.6), distance=5, angle=-60, elevation=15, samples=24),
    'portaloo': dict(target=(0, 0, 1.2), distance=5, angle=-35, elevation=15, samples=24),
    'pole': dict(target=(0, 0, 5.0), distance=14, angle=-50, elevation=10, samples=24),
    **handtools.PREVIEWS,
}


def build(part):
    return PARTS[part]()


def PREVIEW(part):
    if part in _PREVIEWS:
        return _PREVIEWS[part]
    if part == 'office':
        return dict(target=(0, 0, 1.4), distance=13, angle=-60, elevation=16)
    if part == 'fueltank':
        return dict(target=(0, 0, 1.0), distance=7.5, angle=-50, elevation=18)
    if part == 'cone':
        return dict(target=(0, 0, 0.35), distance=2.2, angle=-50, elevation=20, samples=24)
    return dict(target=(0, 0, 0.5), distance=5, angle=-50, elevation=20, samples=24)

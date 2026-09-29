"""An old two-wheel-drive tractor (1960s-70s style): long bonnet, big rear wheels with
chevron tyres, flat mudguards, a sprung seat and a roofed safety frame, a drawbar hitch.

Origin = on the ground halfway between the axles; it faces +X. Named nodes the game uses:
Wheel0..Wheel3 (front-left, front-right, rear-left, rear-right; each at its axle centre),
SteeringWheel (turns about its column), Interior (seat, dash, levers).
Front axle x 0.93 (tyre radius 0.36), rear axle x -0.9 (tyre radius 0.65); the hitch pin
is at (-1.32, 0, 0.5). These match TRACTOR in src/world3d/truckPhysics.js."""
import math
import bmesh
from mathutils import Matrix
import lib
from lib import bm_box, bm_cylinder, bm_lathe, merge, mesh_object, empty, finish

FRONT_X, REAR_X = 0.93, -0.9
FRONT_R, REAR_R = 0.36, 0.65
FRONT_Y, REAR_Y = 0.63, 0.68
FRONT_W, REAR_W = 0.16, 0.32
HITCH = (-1.32, 0.0, 0.5)
DIRT = (0.0, 1.2)


def paints(tier):
    m = lib.standard_materials(tier)
    if tier == 'rusty':  # faded red, gone to rust in places
        m['paint'] = lib.material('TractorPaint', (0.45, 0.07, 0.04), 'paint_worn', lib.tex.paint_worn, roughness=0.7, metallic=0.1)
        m['rust'] = lib.material('Rust', (1, 1, 1), 'rust', lib.tex.rust, roughness=0.85, metallic=0.2)
        m['metal'] = lib.material('Castings', (0.2, 0.2, 0.2), 'metal_grime', lib.tex.metal_grime, 512, roughness=0.7, metallic=0.5)
    else:  # a tidier blue one
        m['paint'] = lib.material('TractorPaint', (0.08, 0.22, 0.55), 'paint_worn', lib.tex.paint_worn, roughness=0.45, metallic=0.1)
        m['rust'] = m['paint']
        m['metal'] = lib.material('Castings', (0.55, 0.56, 0.58), 'paint_worn', lib.tex.paint_worn, roughness=0.5, metallic=0.3)
    m['rim'] = lib.material('Rims', (0.5, 0.45, 0.4) if tier == 'rusty' else (0.85, 0.85, 0.82), 'paint_worn',
                            lib.tex.paint_worn, roughness=0.55, metallic=0.2)
    return m


def tyre(r, w, lugs, chevron):
    """A tractor tyre spun round Y: a rounded carcass with tread bars (angled for the rear)."""
    prof = [(r * 0.62, -w / 2), (r * 0.8, -w / 2 - 0.01), (r - 0.06, -w / 2 + 0.01), (r - 0.035, -w / 2 + 0.04),
            (r - 0.03, 0), (r - 0.035, w / 2 - 0.04), (r - 0.06, w / 2 - 0.01), (r * 0.8, w / 2 + 0.01), (r * 0.62, w / 2)]
    parts = [bm_lathe(prof, 40)]
    for i in range(lugs):
        for side in ((-1, 1) if chevron else (0,)):
            a = 2 * math.pi * (i + (0.5 if side > 0 else 0)) / lugs
            if chevron:
                lug = bm_box((0.07, w * 0.5, 0.06), (0, side * w * 0.24, 0))
                bmesh.ops.rotate(lug, cent=(0, side * w * 0.02, 0), matrix=Matrix.Rotation(side * 0.55, 3, 'Z'), verts=lug.verts)
            else:
                lug = bm_box((0.03, w * 0.8, 0.02), (0, 0, 0))
            bmesh.ops.translate(lug, vec=(0, 0, r - 0.02), verts=lug.verts)
            bmesh.ops.rotate(lug, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Y'), verts=lug.verts)
            parts.append(lug)
    return merge(*parts)


def rim(r, w, side):
    s = side
    prof = [(r * 0.64, s * w * 0.45), (r * 0.6, s * w * 0.3), (r * 0.5, s * w * 0.1), (r * 0.22, s * w * 0.18),
            (r * 0.15, s * w * 0.3), (0.0, s * w * 0.3)]
    disc = bm_lathe(prof, 32)
    nuts = [bm_cylinder(0.018, 0.04, 'Y', 6, (math.cos(a) * r * 0.18, s * w * 0.32, math.sin(a) * r * 0.18))
            for a in [2 * math.pi * k / 6 for k in range(6)]]
    return merge(disc, *nuts)


def wheel(name, x, y, r, w, m, root, rear):
    node = empty(name, (x, y, r), root)
    side = 1 if y > 0 else -1
    t = mesh_object(name + '_Tyre', tyre(r, w, 22 if rear else 26, rear), m['rubber'], node)
    finish(t, 0, uv_scale=0.6, smooth_angle=40, dirt_range=(-r, r * 0.3))
    ri = mesh_object(name + '_Rim', rim(r, w, side), m['rim'], node)
    finish(ri, 0.004, uv_scale=0.6, dirt_range=(-r, r))
    return node


def body(m, root):
    # Bonnet: a rounded box tapering a little toward the grille.
    rings = []
    for x, half_w, top in ((0.2, 0.3, 1.22), (0.7, 0.3, 1.24), (1.25, 0.29, 1.22), (1.58, 0.28, 1.18)):
        rings.append((x, lib.section(half_w, half_w - 0.02, 0.8, top, 0.03, 0.09)))
    bonnet = mesh_object('Bonnet', lib.loft(rings), m['paint'], root)
    finish(bonnet, 0, uv_scale=1.2, smooth_angle=45, dirt_range=(0.5, 1.3))
    # Grille and front weight frame.
    front = [bm_box((0.05, 0.5, 0.36), (1.6, 0, 0.98))]
    for k in range(7):
        front.append(bm_box((0.02, 0.46, 0.015), (1.63, 0, 0.84 + k * 0.045)))
    fr = mesh_object('Grille', merge(*front), m['black'], root)
    finish(fr, 0, dirt=False)
    lamps = [bm_cylinder(0.06, 0.04, 'X', 16, (1.64, s * 0.2, 1.08)) for s in (1, -1)]
    lp = mesh_object('Headlamps', merge(*lamps), m['light'], root)
    finish(lp, 0, dirt=False)
    # Engine block and sump, transmission housing, the rear axle and its trumpets: castings.
    cast = [lib.rounded_box((1.3, 0.46, 0.4), (0.9, 0, 0.6), 0.06),
            lib.rounded_box((1.25, 0.52, 0.5), (-0.35, 0, 0.72), 0.08),
            bm_cylinder(0.12, 1.1, 'Y', 20, (REAR_X, 0, REAR_R)),
            lib.rounded_box((0.18, 0.3, 0.22), (1.5, 0, 0.62), 0.04),  # front axle support
            bm_box((0.12, 1.2, 0.1), (FRONT_X, 0, FRONT_R + 0.02))]  # front axle beam
    for s in (1, -1):
        cast.append(bm_cylinder(0.055, 0.18, 'Y', 12, (FRONT_X, s * 0.55, FRONT_R)))  # stub axles
    c = mesh_object('Castings', merge(*cast), m['metal'], root)
    finish(c, 0, uv_scale=1.2, smooth_angle=40, dirt_range=(0.0, 1.0))
    # Fuel tank behind the bonnet, the dash, the exhaust and air cleaner.
    tank = mesh_object('Tank', lib.rounded_box((0.3, 0.5, 0.3), (0.05, 0, 1.12), 0.08), m['paint'], root)
    finish(tank, 0, uv_scale=1.0, dirt_range=(0.6, 1.4))
    ex = merge(bm_cylinder(0.035, 0.7, 'Z', 12, (1.15, -0.2, 1.55)), bm_cylinder(0.05, 0.08, 'Z', 12, (1.15, -0.2, 1.9)))
    e = mesh_object('Exhaust', ex, m['rust'], root)
    finish(e, 0, dirt=False)
    air = mesh_object('AirCleaner', bm_cylinder(0.05, 0.25, 'Z', 12, (1.0, 0.18, 1.35), radius2=0.035), m['black'], root)
    finish(air, 0, dirt=False)
    # Mudguards: flat-topped arcs over the rear wheels, with a lamp on each.
    guards = []
    for s in (1, -1):
        y = s * REAR_Y
        pts_o, pts_i = [], []
        for i in range(17):
            a = math.radians(15 + i * 150 / 16)
            pts_o.append((REAR_X + math.cos(a) * (REAR_R + 0.08), REAR_R + math.sin(a) * (REAR_R + 0.08)))
            pts_i.append((REAR_X + math.cos(a) * (REAR_R + 0.05), REAR_R + math.sin(a) * (REAR_R + 0.05)))
        guards.append(lib.bm_profile(pts_o + list(reversed(pts_i)), 0.42, 'Y', y))
        guards.append(bm_box((0.5, 0.42, 0.03), (REAR_X, y, REAR_R * 2 + 0.1)))
    gd = mesh_object('Mudguards', merge(*guards), m['paint'], root)
    finish(gd, 0.006, uv_scale=1.0, dirt_range=(0.2, 1.5))
    gl = [bm_box((0.08, 0.1, 0.07), (REAR_X - 0.25, s * (REAR_Y + 0.12), REAR_R * 2 + 0.16)) for s in (1, -1)]
    mesh_object('RearLamps', merge(*gl), m['red'], root)
    # Drawbar and the three-point linkage arms.
    hx, _, hz = HITCH
    hitch = [bm_box((0.5, 0.12, 0.05), (hx + 0.25, 0, hz)), bm_cylinder(0.025, 0.14, 'Z', 10, (hx + 0.04, 0, hz))]
    for s in (1, -1):
        arm = bm_box((0.7, 0.05, 0.06), (0, 0, 0))
        bmesh.ops.rotate(arm, cent=(0, 0, 0), matrix=Matrix.Rotation(0.25, 3, 'Y'), verts=arm.verts)
        bmesh.ops.translate(arm, vec=(REAR_X - 0.4, s * 0.3, 0.55), verts=arm.verts)
        hitch.append(arm)
    hitch.append(bm_box((0.1, 0.1, 0.35), (REAR_X - 0.2, 0, 0.85)))  # top link bracket
    ht = mesh_object('Hitch', merge(*hitch), m['metal'], root)
    finish(ht, 0.004, dirt=False)
    # Step plates.
    steps = [bm_box((0.35, 0.18, 0.02), (-0.2, s * 0.42, 0.45)) for s in (1, -1)]
    st = mesh_object('Steps', merge(*steps), m['black'], root)
    finish(st, 0, dirt=False)


def cab_frame(m, root):
    """A roofed safety frame: two posts behind the seat, two ahead of it."""
    parts = []
    for x in (-1.2, 0.02):
        for s in (1, -1):
            parts.append(lib.rounded_box((0.06, 0.06, 1.3), (x, s * 0.5, 1.72), 0.02))
    parts.append(lib.rounded_box((1.4, 1.14, 0.06), (-0.58, 0, 2.39), 0.03))  # roof
    f = mesh_object('CabFrame', merge(*parts), m['black'], root)
    finish(f, 0, dirt_range=(0.8, 2.4))


def interior(m, root):
    inside = empty('Interior', (0, 0, 0), root)
    seat = merge(bm_box((0.4, 0.44, 0.08), (-0.9, 0, 1.28)), bm_box((0.08, 0.44, 0.32), (-1.08, 0, 1.46)),
                 bm_cylinder(0.03, 0.3, 'Z', 8, (-0.88, 0, 1.1)))
    st = mesh_object('Seat', seat, m['seat'], inside)
    finish(st, 0.02, 2, dirt=False)
    dash = merge(lib.rounded_box((0.12, 0.44, 0.3), (-0.12, 0, 1.25), 0.03),
                 bm_cylinder(0.035, 0.2, 'X', 12, (-0.2, 0.1, 1.33)),
                 bm_cylinder(0.035, 0.2, 'X', 12, (-0.2, -0.1, 1.33)))
    for s in (1, -1):  # gear and hydraulic levers
        dash = merge(dash, bm_cylinder(0.012, 0.45, 'Z', 8, (-0.55, s * 0.28, 1.25)))
    d = mesh_object('Dash', dash, m['black'], inside)
    finish(d, 0.004, dirt=False)
    # Steering column and wheel (the wheel is its own node so the game can turn it).
    col = bm_cylinder(0.025, 0.55, 'Z', 10, (0, 0, 0))
    bmesh.ops.rotate(col, cent=(0, 0, 0), matrix=Matrix.Rotation(-0.55, 3, 'Y'), verts=col.verts)
    bmesh.ops.translate(col, vec=(-0.3, 0, 1.45), verts=col.verts)
    c = mesh_object('Column', col, m['black'], inside)
    finish(c, 0, dirt=False)
    sw = empty('SteeringWheel', (-0.44, 0, 1.68), inside)
    sw.rotation_euler = (0, -0.55, 0)  # square to the column
    rim_ = bm_torus_flat(0.19, 0.016)
    spokes = [bm_box((0.18, 0.02, 0.012), (0.09 * math.cos(a), 0.09 * math.sin(a), 0)) for a in (0, 2.1, 4.2)]
    for sp, a in zip(spokes, (0, 2.1, 4.2)):
        bmesh.ops.rotate(sp, cent=(0.09 * math.cos(a), 0.09 * math.sin(a), 0), matrix=Matrix.Rotation(a, 3, 'Z'), verts=sp.verts)
    w = mesh_object('SteeringRim', merge(rim_, *spokes), m['black'], sw)
    finish(w, 0, smooth_angle=60, dirt=False)


def bm_torus_flat(major, minor):
    """A torus lying flat (round Z)."""
    return lib.bm_torus(major, minor, 'Z', 32, 8)


def build(tier):
    m = paints(tier)
    root = empty('Tractor')
    body(m, root)
    cab_frame(m, root)
    interior(m, root)
    wheel('Wheel0', FRONT_X, FRONT_Y, FRONT_R, FRONT_W, m, root, False)
    wheel('Wheel1', FRONT_X, -FRONT_Y, FRONT_R, FRONT_W, m, root, False)
    wheel('Wheel2', REAR_X, REAR_Y, REAR_R, REAR_W, m, root, True)
    wheel('Wheel3', REAR_X, -REAR_Y, REAR_R, REAR_W, m, root, True)
    return root


PREVIEW = dict(target=(0.2, 0, 1.0), distance=6.5, angle=35, elevation=14, ground_z=0.0)

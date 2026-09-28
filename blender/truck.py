"""Rigid haul truck (cab-over tipper), ~6.6 m long.

Origin = the physics body centre used by the game. Ground is at z = -1.3.
Named nodes the game uses: Wheel0..Wheel3 (centred on the axle, spin about Y),
BedPivot (tipping hinge, rotate about Y), Cab (outer cab), Interior (driver's view).
Wheel order matches TRUCK_SHAPE in src/world3d/truckPhysics.js:
0 front-left, 1 front-right, 2 rear-left, 3 rear-right (left = +Y in Blender)."""
import math
import bmesh
from mathutils import Vector, Matrix
import lib
from lib import bm_box, bm_cylinder, bm_profile, bm_lathe, merge, mesh_object, empty, finish

WHEELS = [(2.1, 1.05), (2.1, -1.05), (-2.0, 1.05), (-2.0, -1.05)]
WHEEL_Z = -0.75
TYRE_R = 0.55
TYRE_W = 0.45
BED_PIVOT = (-3.1, 0.0, 0.05)
DIRT = (-1.3, 0.4)


def tyre_mesh():
    r, w = TYRE_R, TYRE_W
    # Rounded tyre carcass, spun around the axle (Y). Profile: (radius, y) from outer edge inward.
    prof = [(0.33, -w / 2), (0.42, -w / 2 - 0.01), (0.5, -w / 2 + 0.01), (r - 0.04, -w / 2 + 0.04),
            (r - 0.03, 0), (r - 0.04, w / 2 - 0.04), (0.5, w / 2 - 0.01), (0.42, w / 2 + 0.01), (0.33, w / 2)]
    carcass = bm_lathe(prof, 40)
    # Chevron tread lugs.
    lugs = []
    n = 22
    for i in range(n):
        for side in (-1, 1):
            a = 2 * math.pi * (i + (0.5 if side > 0 else 0)) / n
            lug = bm_box((0.1, w * 0.42, 0.05), (0, side * w * 0.22, 0))
            bmesh.ops.rotate(lug, cent=(0, 0, 0), matrix=Matrix.Rotation(side * 0.35, 3, 'Z'), verts=lug.verts)
            bmesh.ops.translate(lug, vec=(0, 0, r - 0.03), verts=lug.verts)
            bmesh.ops.rotate(lug, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Y'), verts=lug.verts)
            lugs.append(lug)
    return merge(carcass, *lugs)


def rim_mesh(side):
    # Steel rim: dished disc with a hub and 8 wheel nuts, facing outward (side = +1 left, -1 right).
    s = side
    prof = [(0.34, s * 0.2), (0.33, s * 0.1), (0.3, s * 0.08), (0.18, s * 0.12), (0.12, s * 0.16), (0.0, s * 0.16)]
    disc = bm_lathe(prof, 32)
    hub = bm_cylinder(0.09, 0.12, 'Y', 16, (0, s * 0.2, 0))
    nuts = [bm_cylinder(0.022, 0.05, 'Y', 6, (math.cos(a) * 0.14, s * 0.16, math.sin(a) * 0.14))
            for a in [2 * math.pi * k / 8 for k in range(8)]]
    return merge(disc, hub, *nuts)


def build_wheel(name, x, y, mats, parent):
    wheel = empty(name, (x, y, WHEEL_Z), parent)
    side = 1 if y > 0 else -1
    tyre = mesh_object(name + '_Tyre', tyre_mesh(), mats['rubber'], wheel)
    finish(tyre, bevel_width=0, uv_scale=0.6, smooth_angle=40, dirt_range=DIRT)
    rim = mesh_object(name + '_Rim', rim_mesh(side), mats['paint2'], wheel)
    finish(rim, bevel_width=0.006, uv_scale=0.6, dirt_range=DIRT)
    return wheel


def arc_panel(cx, cz, r_in, r_out, a0, a1, width, y, steps=14):
    pts = [(cx + math.cos(a) * r_out, cz + math.sin(a) * r_out) for a in [a0 + (a1 - a0) * i / steps for i in range(steps + 1)]]
    pts += [(cx + math.cos(a) * r_in, cz + math.sin(a) * r_in) for a in [a1 - (a1 - a0) * i / steps for i in range(steps + 1)]]
    return bm_profile(pts, width, 'Y', y)


def build(tier):
    mats = lib.standard_materials(tier)
    root = empty('Truck')

    # ---------- chassis
    parts = []
    for y in (0.42, -0.42):
        parts.append(bm_box((6.0, 0.12, 0.3), (-0.05, y, -0.4)))
    for x in (-2.8, -1.6, -0.4, 0.8, 1.9, 2.9):
        parts.append(bm_box((0.12, 0.84, 0.18), (x, 0, -0.38)))
    parts.append(bm_box((0.22, 2.3, 0.22), (3.3, 0, -0.28)))  # front bumper
    parts.append(bm_box((0.18, 2.1, 0.12), (-3.05, 0, -0.5)))  # rear crossbar
    parts.append(bm_cylinder(0.26, 0.7, 'X', 20, (1.1, 0.78, -0.42)))  # fuel tank
    parts.append(bm_box((0.55, 0.45, 0.4), (1.1, -0.8, -0.45)))  # battery box
    for x in (2.1, -2.0):  # axles
        parts.append(bm_cylinder(0.08, 2.0, 'Y', 12, (x, 0, WHEEL_Z)))
        parts.append(bm_box((0.9, 0.1, 0.1), (x, 0.42, -0.62)))  # leaf springs
        parts.append(bm_box((0.9, 0.1, 0.1), (x, -0.42, -0.62)))
    # Tipping ram (sits under the bed).
    parts.append(bm_cylinder(0.11, 1.0, 'Z', 16, (0.9, 0, -0.05)))
    chassis = mesh_object('Chassis', merge(*parts), mats['steel'], root)
    finish(chassis, 0.015, dirt_range=DIRT)

    # Hinge brackets at the back, tail lights.
    tail = mesh_object('TailLights', merge(bm_box((0.05, 0.25, 0.12), (-3.15, 0.85, -0.42)),
                                           bm_box((0.05, 0.25, 0.12), (-3.15, -0.85, -0.42))), mats['red'], root)
    finish(tail, 0.01, dirt=False)

    # ---------- mudguards
    guards = []
    for x, y in WHEELS:
        if x > 0:
            guards.append(arc_panel(x, WHEEL_Z, 0.64, 0.68, math.radians(15), math.radians(165), 0.52, y))
        else:
            guards.append(bm_box((1.3, 0.55, 0.04), (x, y, -0.05)))
            guards.append(bm_box((0.04, 0.55, 0.5), (x - 0.62, y, -0.3)))  # mud flap
    mud = mesh_object('Mudguards', merge(*guards), mats['paint2'], root)
    finish(mud, 0.01, dirt_range=DIRT)

    # ---------- cab (outer shell)
    cab_prof = [(1.55, -0.12), (3.2, -0.12), (3.25, 0.38), (3.14, 0.58), (2.98, 1.48), (2.86, 1.6), (1.62, 1.6), (1.55, 1.52)]
    shell = bm_profile(cab_prof, 2.3, 'Y')
    cab = mesh_object('Cab', shell, mats['paint'], root)
    lib.bevel(cab, 0.06, 3)
    finish(cab, 0, dirt_range=DIRT)

    # Glass: windscreen, side windows, rear window (slightly proud of the shell).
    glass = []
    ws = bmesh.new()
    v = [ws.verts.new(p) for p in [(3.155, 1.0, 0.64), (3.155, -1.0, 0.64), (3.0, -1.0, 1.42), (3.0, 1.0, 1.42)]]
    ws.faces.new(v)
    glass.append(ws)
    for s in (1, -1):
        sw = bmesh.new()
        pts = [(1.75, 0.62), (2.95, 0.62), (2.84, 1.42), (1.75, 1.42)] if s > 0 else [(1.75, 0.62), (1.75, 1.42), (2.84, 1.42), (2.95, 0.62)]
        vv = [sw.verts.new((x, s * 1.158, z)) for x, z in pts]
        sw.faces.new(vv)
        glass.append(sw)
    rw = bmesh.new()
    vv = [rw.verts.new(p) for p in [(1.545, -0.7, 0.85), (1.545, 0.7, 0.85), (1.545, 0.7, 1.35), (1.545, -0.7, 1.35)]]
    rw.faces.new(vv)
    glass.append(rw)
    g = mesh_object('CabGlass', lib.orient_outward(merge(*glass), (2.3, 0, 0.8)), mats['glass'], root)
    g.data.shade_smooth()
    lib.box_uv(g)

    # Cab details: grille, lights, mirrors, beacon, door seams, steps, exhaust, sun visor.
    det = []
    for z in (0.06, 0.16, 0.26):
        det.append(bm_box((0.04, 1.3, 0.05), (3.27, 0, z)))
    det.append(bm_box((1.9, 0.02, 0.02), (2.3, 1.16, 0.56)))  # window line
    det.append(bm_box((1.9, 0.02, 0.02), (2.3, -1.16, 0.56)))
    for s in (1, -1):
        det.append(bm_box((0.02, 0.02, 1.3), (1.72, s * 1.16, 0.4)))  # door seam
        det.append(bm_box((0.18, 0.04, 0.04), (2.0, s * 1.17, 0.45)))  # handle
        det.append(bm_box((0.06, 0.35, 0.06), (3.05, s * 1.32, 1.0)))  # mirror arm
        det.append(bm_box((0.06, 0.06, 0.6), (3.05, s * 1.48, 0.85)))
        det.append(bm_box((0.08, 0.22, 0.38), (3.05, s * 1.5, 0.85)))  # mirror
        det.append(bm_box((0.3, 0.3, 0.04), (2.85, s * 1.0, -0.55)))  # step
        det.append(bm_box((0.3, 0.3, 0.04), (2.85, s * 1.0, -0.25)))
    det.append(bm_box((0.35, 2.2, 0.04), (3.05, 0, 1.62)))  # sun visor
    cabdet = mesh_object('CabDetails', merge(*det), mats['black'], root)
    finish(cabdet, 0.008, dirt=False)

    lights = []
    for s in (1, -1):
        lights.append(bm_box((0.04, 0.28, 0.16), (3.27, s * 0.88, 0.2)))
        lights.append(bm_cylinder(0.06, 0.08, 'Z', 12, (2.2, s * 0.9, 1.66)))  # roof spotlights
    hl = mesh_object('Headlights', merge(*lights), mats['light'], root)
    finish(hl, 0.01, dirt=False)
    beacon = mesh_object('Beacon', merge(bm_cylinder(0.09, 0.14, 'Z', 16, (1.9, 0, 1.68)),
                                         bm_cylinder(0.07, 0.05, 'Z', 16, (1.9, 0, 1.78))), mats['amber'], root)
    finish(beacon, 0, dirt=False)
    exhaust = merge(bm_cylinder(0.065, 1.9, 'Z', 16, (1.45, -1.0, 0.55)),
                    bm_cylinder(0.08, 0.5, 'Z', 16, (1.45, -1.0, 0.9)))  # heat shield
    ex = mesh_object('Exhaust', exhaust, mats['chrome'], root)
    finish(ex, 0, dirt=False)

    # ---------- interior (what you see from the driver's seat)
    inside = []
    inside.append(bm_box((1.5, 2.1, 0.05), (2.35, 0, 0.02)))  # floor
    inside.append(bm_box((0.35, 2.1, 0.45), (3.0, 0, 0.42)))  # dashboard
    inside.append(bm_box((0.18, 2.1, 0.08), (3.06, 0, 0.66)))  # dash top
    for s in (1, -1):
        inside.append(bm_box((1.35, 0.05, 0.55), (2.35, s * 1.1, 0.3)))  # door insides
        inside.append(bm_box((0.07, 0.07, 0.92), (3.06, s * 1.08, 1.03)))  # A pillars
        inside.append(bm_box((0.1, 0.07, 1.0), (1.62, s * 1.08, 1.05)))  # B pillars
    inside.append(bm_box((1.3, 2.1, 0.04), (2.25, 0, 1.56)))  # headliner
    inside.append(bm_box((0.05, 2.1, 0.8), (1.6, 0, 0.4)))  # rear wall lower
    inside.append(bm_cylinder(0.035, 0.45, 'X', 10, (2.82, 0.5, 0.62)))  # steering column
    interior = mesh_object('Interior', merge(*inside), mats['black'], root)
    finish(interior, 0.01, dirt=False)
    wheel = lib.bm_torus(0.19, 0.022, 'X', 28, 8, (2.62, 0.5, 0.78))
    bmesh.ops.rotate(wheel, cent=(2.62, 0.5, 0.78), matrix=Matrix.Rotation(-0.5, 3, 'Y'), verts=wheel.verts)
    sw = mesh_object('SteeringWheel', wheel, mats['black'], interior)
    sw.data.shade_smooth()
    seat = merge(bm_box((0.5, 0.5, 0.14), (2.25, 0.5, 0.42)), bm_box((0.12, 0.5, 0.65), (1.95, 0.5, 0.78)))
    st = mesh_object('Seat', seat, mats['seat'], interior)
    finish(st, 0.04, 3, dirt=False)

    # ---------- tipping bed (pivot at the rear hinge)
    pivot = empty('BedPivot', BED_PIVOT, root)
    L = 4.3
    u = [(-1.2, 1.02), (-1.12, -0.04), (1.12, -0.04), (1.2, 1.02), (1.12, 1.02), (1.04, 0.1), (-1.04, 0.1), (-1.12, 1.02)]
    bed = [bm_profile(u, L, 'X', L / 2)]
    # Headboard + cab protector canopy.
    bed.append(bm_box((0.1, 2.36, 1.6), (L + 0.02, 0, 0.78)))
    bed.append(bm_box((0.75, 2.36, 0.08), (L + 0.38, 0, 1.6)))
    # Ribs along the sides and under the floor.
    for i in range(6):
        x = 0.35 + i * 0.72
        for s in (1, -1):
            bed.append(bm_box((0.08, 0.08, 1.0), (x, s * 1.2, 0.5)))
        bed.append(bm_box((0.1, 2.1, 0.12), (x, 0, -0.1)))
    for s in (1, -1):
        bed.append(bm_cylinder(0.05, L, 'X', 12, (L / 2, s * 1.2, 1.04)))  # top rails
        bed.append(bm_box((0.2, 0.12, 0.25), (0.1, s * 0.42, -0.08)))  # hinge brackets
    # Tailgate.
    bed.append(bm_box((0.08, 2.2, 0.95), (-0.02, 0, 0.52)))
    bed.append(bm_cylinder(0.04, 2.3, 'Y', 10, (-0.04, 0, 1.0)))
    b = mesh_object('Bed', merge(*bed), mats['paint'], pivot)
    finish(b, 0.015, dirt_range=(-1.35, 0.5))

    # ---------- wheels
    for i, (x, y) in enumerate(WHEELS):
        build_wheel(f'Wheel{i}', x, y, mats, root)

    return root


PREVIEW = dict(target=(0, 0, -0.4), distance=10.5, angle=35, elevation=16, ground_z=-1.3)

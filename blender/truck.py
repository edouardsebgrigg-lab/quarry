"""Rigid haul truck (cab-over tipper), ~6.6 m long.

Origin = the physics body centre used by the game. Ground is at z = -1.3.
Named nodes the game uses: Wheel0..Wheel3 (centred on the axle, spin about Y),
BedPivot (tipping hinge, rotate about Y), Cab (outer cab), Interior (driver's view).
Wheel order matches TRUCK_SHAPE in src/world3d/truckPhysics.js:
0 front-left, 1 front-right, 2 rear-left, 3 rear-right (left = +Y in Blender)."""
import math
import bmesh
from mathutils import Vector, Matrix  # noqa: F401
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


CAB_W = 1.15      # half width
CAB_REAR = 1.55
CAB_RADIUS = 0.16  # rounding of the vertical corners


def cab_front(z):
    """X of the cab front at height z (a slightly raked, bulged face)."""
    pts = [(-0.12, 3.2), (0.38, 3.25), (0.58, 3.16), (1.48, 2.98), (1.62, 2.9)]
    for (z0, x0), (z1, x1) in zip(pts, pts[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return x0 + (x1 - x0) * max(0, t)
    return pts[-1][1]


def cab_shell():
    st = []
    for z, inset in ((-0.12, 0), (0.1, 0), (0.38, 0), (0.58, 0), (1.0, 0), (1.44, 0), (1.52, 0.012),
                     (1.57, 0.035), (1.605, 0.075), (1.625, 0.13), (1.635, 0.2)):
        st.append((z, lib.plan_rect(CAB_REAR + inset, cab_front(z) - inset, CAB_W - inset,
                                    max(0.04, CAB_RADIUS - inset * 0.4), 5)))
    return lib.loft_z(st)


def cab_glass():
    glass, seals = [], []
    # Windscreen on the raked front.
    z0, z1 = 0.66, 1.42
    bot = Vector((cab_front(z0), 0, z0))
    top = Vector((cab_front(z1), 0, z1))
    V = (top - bot).normalized()
    U = Vector((0, 1, 0))
    n = U.cross(V).normalized()
    L = (top - bot).length
    mid = (top + bot) / 2
    glass.append(lib.panel(lib.rounded_rect(2 * CAB_W - 0.36, L, 0.07), mid + n * 0.006, U, V))
    seals.append(lib.panel(lib.rounded_rect(2 * CAB_W - 0.3, L + 0.06, 0.08), mid + n * 0.003, U, V))
    # Side windows (door glass) on the flat sides.
    for s in (1, -1):
        U = Vector((1, 0, 0))  # facing is fixed afterwards by orient_outward
        V = Vector((0, 0, 1))
        c = Vector((2.34, s * (CAB_W + 0.004), 1.02))
        pane = lib.panel(lib.rounded_rect(1.08, 0.74, 0.06), c, U, V)
        seal = lib.panel(lib.rounded_rect(1.14, 0.8, 0.07), c - Vector((0, s * 0.002, 0)), U, V)
        glass.append(pane)
        seals.append(seal)
    # Rear window.
    glass.append(lib.panel(lib.rounded_rect(1.3, 0.45, 0.06), (CAB_REAR - 0.004, 0, 1.12), (0, -1, 0), (0, 0, 1)))
    centre = (2.3, 0, 0.8)
    return lib.orient_outward(merge(*glass), centre), lib.orient_outward(merge(*seals), centre)


def build(tier):
    mats = lib.standard_materials(tier)
    root = empty('Truck')

    # ---------- chassis
    parts = []
    for y in (0.42, -0.42):
        parts.append(bm_box((6.0, 0.12, 0.3), (-0.05, y, -0.4)))
    for x in (-2.8, -1.6, -0.4, 0.8, 1.9, 2.9):
        parts.append(bm_box((0.12, 0.84, 0.18), (x, 0, -0.38)))

    parts.append(bm_box((0.18, 2.1, 0.12), (-3.05, 0, -0.5)))  # rear crossbar
    parts.append(bm_cylinder(0.26, 0.7, 'X', 20, (1.1, 0.78, -0.42)))  # fuel tank
    parts.append(lib.rounded_box((0.55, 0.45, 0.4), (1.1, -0.8, -0.45), 0.04))  # battery box
    for x in (0.9, 1.3):  # fuel tank straps
        parts.append(lib.bm_torus(0.265, 0.012, 'X', 24, 6, (x, 0.78, -0.42)))
    for x in (2.1, -2.0):  # axles
        parts.append(bm_cylinder(0.08, 2.0, 'Y', 12, (x, 0, WHEEL_Z)))
        parts.append(bm_box((0.9, 0.1, 0.1), (x, 0.42, -0.62)))  # leaf springs
        parts.append(bm_box((0.9, 0.1, 0.1), (x, -0.42, -0.62)))
    # Tipping ram (sits under the bed).
    parts.append(bm_cylinder(0.11, 0.43, 'Z', 16, (0.9, 0, -0.335)))  # (top stays under the bed floor)
    chassis = mesh_object('Chassis', merge(*parts), mats['steel'], root)
    bumper = [lib.rounded_box((0.26, 2.4, 0.28), (3.33, 0, -0.3), 0.06),
              lib.rounded_box((0.1, 0.5, 0.1), (3.47, 0.75, -0.36), 0.03),   # towing eyes
              lib.rounded_box((0.1, 0.5, 0.1), (3.47, -0.75, -0.36), 0.03)]
    bp = mesh_object('Bumper', merge(*bumper), mats['paint2'], root)
    finish(bp, 0, uv_scale=1.0, smooth_angle=50, dirt_range=DIRT)
    finish(chassis, 0.02, 2, dirt_range=DIRT)

    # Hinge brackets at the back, tail lights.
    tail = mesh_object('TailLights', merge(bm_box((0.05, 0.25, 0.12), (-3.15, 0.85, -0.42)),
                                           bm_box((0.05, 0.25, 0.12), (-3.15, -0.85, -0.42))), mats['red'], root)
    finish(tail, 0.01, dirt=False)

    # ---------- mudguards: rolled arches over every wheel, mud flaps behind the rear ones
    guards = []
    for x, y in WHEELS:
        guards.append(arc_panel(x, WHEEL_Z, 0.64, 0.68, math.radians(12), math.radians(168), 0.54, y, 20))
        guards.append(arc_panel(x, WHEEL_Z, 0.6, 0.68, math.radians(12), math.radians(168), 0.03, y + (0.27 if y > 0 else -0.27), 20))
        if x < 0:
            guards.append(bm_box((0.03, 0.5, 0.45), (x - 0.72, y, -0.62)))  # mud flap
    mud = mesh_object('Mudguards', merge(*guards), mats['paint2'], root)
    finish(mud, 0.008, dirt_range=DIRT)

    # ---------- cab (outer shell): lofted in plan so corners and the roof edge are rounded
    cab = mesh_object('Cab', cab_shell(), mats['paint'], root)
    finish(cab, 0.012, 2, uv_scale=1.4, smooth_angle=40, dirt_range=DIRT)

    # Glass, set into the cab surfaces, with black rubber seals round each pane.
    glass, seals = cab_glass()
    g = mesh_object('CabGlass', glass, mats['glass'], root)
    lib.box_uv(g)
    se = mesh_object('CabSeals', seals, mats['black'], root)
    lib.box_uv(se)

    # Cab details: grille, lights, mirrors, beacon, door seams, steps, exhaust, sun visor.
    det = []
    det.append(bm_box((0.05, 1.36, 0.36), (3.235, 0, 0.16)))  # grille recess
    for s in (1, -1):
        y = s * (CAB_W + 0.002)
        det.append(bm_box((0.008, 0.005, 1.35), (1.74, y, 0.5)))  # door shut lines
        det.append(bm_box((0.008, 0.005, 1.1), (2.95, y, 0.35)))
        det.append(bm_box((1.21, 0.005, 0.008), (2.35, y, -0.08)))
        det.append(bm_box((0.18, 0.04, 0.04), (2.0, s * 1.17, 0.45)))  # handle
        det.append(bm_cylinder(0.022, 0.36, 'Y', 10, (3.0, s * 1.32, 1.12)))  # mirror arms
        det.append(bm_cylinder(0.022, 0.36, 'Y', 10, (3.0, s * 1.32, 0.62)))
        det.append(bm_cylinder(0.022, 0.52, 'Z', 10, (3.0, s * 1.49, 0.87)))
        det.append(lib.rounded_box((0.1, 0.26, 0.42), (3.02, s * 1.56, 0.88), 0.04))  # mirror head
        det.append(lib.rounded_box((0.08, 0.2, 0.16), (3.1, s * 1.5, 0.52), 0.03))  # kerb mirror
        det.append(lib.rounded_box((0.32, 0.3, 0.04), (2.85, s * 1.0, -0.55), 0.015))  # steps
        det.append(lib.rounded_box((0.32, 0.3, 0.04), (2.85, s * 1.0, -0.25), 0.015))
    visor = lib.rounded_box((0.36, 2.24, 0.05), (0, 0, 0), 0.02)
    bmesh.ops.rotate(visor, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-10), 3, 'Y'), verts=visor.verts)
    bmesh.ops.translate(visor, vec=(3.0, 0, 1.6), verts=visor.verts)
    det.append(visor)
    cabdet = mesh_object('CabDetails', merge(*det), mats['black'], root)
    finish(cabdet, 0.008, dirt=False)
    grille = [bm_box((0.03, 1.3, 0.035), (3.265, 0, z)) for z in (0.04, 0.11, 0.18, 0.25)]
    gr = mesh_object('Grille', merge(*grille), mats['paint2'], root)
    finish(gr, 0.006, dirt=False)

    lights = []
    for s in (1, -1):
        lights.append(bm_box((0.05, 0.3, 0.17), (3.245, s * 0.86, 0.2)))
        lights.append(bm_cylinder(0.06, 0.08, 'Z', 12, (2.2, s * 0.9, 1.66)))  # roof spotlights
    hl = mesh_object('Headlights', merge(*lights), mats['light'], root)
    finish(hl, 0.02, 3, dirt=False)
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
    bed.append(lib.rounded_box((0.78, 2.4, 0.08), (L + 0.38, 0, 1.6), 0.03))
    for k in range(4):  # stiffening ribs on the headboard and canopy
        y = -0.9 + k * 0.6
        bed.append(lib.rounded_box((0.08, 0.08, 1.5), (L + 0.1, y, 0.8), 0.02))
        bed.append(lib.rounded_box((0.7, 0.07, 0.06), (L + 0.38, y, 1.66), 0.02))
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
    finish(b, 0.02, 2, dirt_range=(-1.35, 0.5))

    # ---------- wheels
    for i, (x, y) in enumerate(WHEELS):
        build_wheel(f'Wheel{i}', x, y, mats, root)

    return root


PREVIEW = dict(target=(0, 0, -0.4), distance=10.5, angle=35, elevation=16, ground_z=-1.3)

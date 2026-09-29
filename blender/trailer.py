"""A farm tipping trailer (about 4 t): steel bed on a single axle, an A-frame drawbar, a
tailgate hung from the top so it swings open as the bed tips back.

Origin = on the ground under the axle; it faces +X (the drawbar end). Named nodes the game
uses: Wheel0 (left), Wheel1 (right) at the axle centre, BedPivot (the tipping hinge at the
back of the chassis; the game turns it about Y), TailgatePivot (inside BedPivot, at the top
of the tailgate; the game keeps it hanging). The drawbar eye is at (3.3, 0, 0.5); the bed
floor is at z 1.0 from x -1.7 to 2.1. These match TRAILER in src/world3d/trailerPhysics.js."""
import math
import bmesh
from mathutils import Matrix
import lib
from lib import bm_box, bm_cylinder, merge, mesh_object, empty, finish
import tractor

WHEEL_R = 0.45
WHEEL_W = 0.3
WHEEL_Y = 0.8
BED = (-1.7, 2.1)  # x from, to
BED_W = 0.95  # half width
FLOOR_Z = 1.0
SIDE_H = 0.6
EYE = (3.3, 0.0, 0.5)
DIRT = (0.0, 1.2)


def paints(tier):
    m = lib.standard_materials(tier)
    if tier == 'used':
        m['paint'] = lib.material('Paint', (0.55, 0.06, 0.04), 'paint_worn', lib.tex.paint_worn, roughness=0.5, metallic=0.1)
    m['chassis'] = lib.material('Chassis', (0.08, 0.08, 0.085), 'paint_worn', lib.tex.paint_worn, roughness=0.6, metallic=0.3)
    m['rim'] = lib.material('Rims', (0.5, 0.45, 0.4) if tier == 'rusty' else (0.8, 0.8, 0.78), 'paint_worn',
                            lib.tex.paint_worn, roughness=0.55, metallic=0.2)
    return m


def chassis(m, root):
    x0, x1 = BED
    parts = []
    for s in (1, -1):
        parts.append(lib.rounded_box((x1 - x0, 0.1, 0.16), ((x0 + x1) / 2, s * 0.55, FLOOR_Z - 0.14), 0.02))  # rails
        parts.append(bm_box((0.16, 0.12, 0.3), (0, s * 0.55, WHEEL_R + 0.12)))  # axle brackets
    for x in (x0 + 0.1, -0.6, 0.6, x1 - 0.1):
        parts.append(bm_box((0.08, 1.2, 0.1), (x, 0, FLOOR_Z - 0.14)))  # cross members
    parts.append(bm_cylinder(0.05, 2 * WHEEL_Y - 0.1, 'Y', 12, (0, 0, WHEEL_R)))  # axle
    # A-frame drawbar from the front of the rails to the eye.
    ex, _, ez = EYE
    for s in (1, -1):
        a = (x1 - 0.1, s * 0.5, FLOOR_Z - 0.16)
        b = (ex - 0.12, s * 0.04, ez)
        d = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        length = math.sqrt(sum(c * c for c in d))
        bar = bm_box((length, 0.08, 0.1), (0, 0, 0))
        yaw = math.atan2(d[1], d[0])
        pitch = math.atan2(d[2], math.hypot(d[0], d[1]))
        bmesh.ops.rotate(bar, cent=(0, 0, 0), matrix=Matrix.Rotation(-pitch, 3, 'Y'), verts=bar.verts)
        bmesh.ops.rotate(bar, cent=(0, 0, 0), matrix=Matrix.Rotation(yaw, 3, 'Z'), verts=bar.verts)
        bmesh.ops.translate(bar, vec=((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), verts=bar.verts)
        parts.append(bar)
    parts.append(lib.rounded_box((0.2, 0.14, 0.08), (ex - 0.06, 0, ez), 0.03))  # the eye block
    # Parking jack, folded up beside the drawbar.
    parts.append(bm_cylinder(0.035, 0.55, 'Z', 10, (ex - 0.7, 0.2, ez + 0.1)))
    parts.append(bm_box((0.14, 0.14, 0.02), (ex - 0.7, 0.2, ez - 0.18)))
    # Tipping ram under the front of the bed.
    parts.append(bm_cylinder(0.06, 0.5, 'Z', 14, (x1 - 0.5, 0, FLOOR_Z - 0.35)))
    c = mesh_object('Chassis', merge(*parts), m['chassis'], root)
    finish(c, 0.004, uv_scale=1.0, dirt_range=DIRT)
    eye = mesh_object('Eye', lib.bm_torus(0.045, 0.018, 'Z', 16, 6, (ex + 0.05, 0, ez)), m['steel'], root)
    finish(eye, 0, dirt=False)
    lamps = [bm_box((0.06, 0.18, 0.1), (x0 - 0.04, s * 0.78, FLOOR_Z - 0.15)) for s in (1, -1)]
    mesh_object('TailLamps', merge(*lamps), m['red'], root)
    plate = mesh_object('Plate', bm_box((0.02, 0.5, 0.12), (x0 - 0.05, 0, FLOOR_Z - 0.2)), m['chrome'], root)
    finish(plate, 0, dirt=False)


def bed(m, root):
    x0, x1 = BED
    pivot = empty('BedPivot', (x0, 0, FLOOR_Z), root)
    L = x1 - x0
    t = 0.03
    parts = [bm_box((L, 2 * BED_W, t), (L / 2, 0, t / 2))]  # floor
    for s in (1, -1):
        parts.append(bm_box((L, t, SIDE_H), (L / 2, s * (BED_W - t / 2), SIDE_H / 2)))  # sides
        parts.append(bm_cylinder(0.025, L, 'X', 10, (L / 2, s * BED_W, SIDE_H)))  # rolled top rails
        for k in range(1, 6):  # side stiffeners
            parts.append(bm_box((0.05, 0.04, SIDE_H), (k * L / 6, s * (BED_W + 0.02), SIDE_H / 2)))
    parts.append(bm_box((t, 2 * BED_W, SIDE_H + 0.25), (L - t / 2, 0, (SIDE_H + 0.25) / 2)))  # headboard
    parts.append(bm_cylinder(0.025, 2 * BED_W, 'Y', 10, (L, 0, SIDE_H + 0.25)))
    for k in range(1, 4):  # headboard ribs
        parts.append(bm_box((0.04, 0.05, SIDE_H + 0.25), (L + 0.02, -BED_W + k * BED_W / 2, (SIDE_H + 0.25) / 2)))
    parts.append(bm_box((L, 2 * BED_W, 0.06), (L / 2, 0, -0.04)))  # floor bearers
    b = mesh_object('Bed', merge(*parts), m['paint'], pivot)
    finish(b, 0.004, uv_scale=1.2, dirt_range=(-1.0, 0.8))
    # Tailgate, hung from the top of the back.
    gate_pivot = empty('TailgatePivot', (0, 0, SIDE_H), pivot)
    gate = [bm_box((t, 2 * BED_W - 0.02, SIDE_H), (-t / 2, 0, -SIDE_H / 2))]
    for k in range(1, 4):
        gate.append(bm_box((0.04, 0.05, SIDE_H), (-0.04, -BED_W + k * BED_W / 2, -SIDE_H / 2)))
    g = mesh_object('Tailgate', merge(*gate), m['paint'], gate_pivot)
    finish(g, 0.004, uv_scale=1.2, dirt_range=(-1.0, 0.2))


def build(tier):
    m = paints(tier)
    root = empty('Trailer')
    chassis(m, root)
    bed(m, root)
    tractor.wheel('Wheel0', 0.0, WHEEL_Y, WHEEL_R, WHEEL_W, m, root, False)
    tractor.wheel('Wheel1', 0.0, -WHEEL_Y, WHEEL_R, WHEEL_W, m, root, False)
    return root


def pose(root, tip=0.5):
    """Show it tipping (after export)."""
    import bpy
    bpy.data.objects['BedPivot'].rotation_euler = (0, -tip, 0)  # the front lifts
    bpy.data.objects['TailgatePivot'].rotation_euler = (0, tip, 0)  # the gate keeps hanging


PREVIEW = dict(target=(0.6, 0, 1.0), distance=8.0, angle=-40, elevation=16, ground_z=0.0)

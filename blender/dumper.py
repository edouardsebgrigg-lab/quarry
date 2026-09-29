"""Tracked site dumper (~1 t class): rubber tracks, a front skip that tips forward, the driver
sitting on the engine at the back under a roll-over bar.

Origin = ground centre between the tracks; it faces +X. Named nodes the game uses:
TrackWheelL0/L1, TrackWheelR0/R1 (rear sprocket, front idler: turned by the game),
SkipPivot (the skip's hinge at its front bottom edge: the game turns it about Y to tip),
Interior (seat and levers). The skip floor is at z 0.62, from x 0.05 to 1.05."""
import math
import bmesh
from mathutils import Matrix
import lib
from lib import bm_box, bm_cylinder, merge, mesh_object, empty, finish
import minidigger as md

TRACK_Y = 0.36
TRACK_W = 0.25
TRACK_HALF = 0.62
TRACK_R = 0.18
SKIP_HINGE = (1.12, 0.6)  # x, z of the tipping hinge (front bottom of the skip)
DIRT = (0.0, 0.9)


def paints(tier):
    m = lib.standard_materials(tier)
    if tier == 'used':
        m['paint'] = lib.material('Paint', (0.92, 0.45, 0.03), 'paint_worn', lib.tex.paint_worn, roughness=0.45)
    m['frame'] = lib.material('Frame', (0.06, 0.06, 0.065), 'paint_worn', lib.tex.paint_worn, roughness=0.6, metallic=0.3)
    m['track'] = lib.material('RubberTrack', (0.55, 0.55, 0.55), 'rubber', lib.tex.rubber, 512, roughness=0.95)
    return m


def undercarriage(m, root):
    # Reuse the mini digger's rubber track shape, at this machine's size.
    saved = (md.TRACK_Y, md.TRACK_W, md.TRACK_HALF, md.TRACK_R)
    md.TRACK_Y, md.TRACK_W, md.TRACK_HALF, md.TRACK_R = TRACK_Y, TRACK_W, TRACK_HALF, TRACK_R
    try:
        tracks = mesh_object('TrackBand', merge(md.track_band(TRACK_Y), md.track_band(-TRACK_Y)), m['track'], root)
        shoe = mesh_object('TrackShoe', md.track_shoe(), m['track'], root)
    finally:
        md.TRACK_Y, md.TRACK_W, md.TRACK_HALF, md.TRACK_R = saved
    finish(tracks, 0, uv_scale=0.4, smooth_angle=30, dirt_range=(-0.1, 0.5))
    finish(shoe, 0.003, uv_scale=0.4, dirt_range=(-0.1, 0.5))
    steel = []
    for s in (1, -1):
        y = s * TRACK_Y
        steel.append(lib.rounded_box((2 * TRACK_HALF - 0.1, 0.14, 0.15), (0, y, TRACK_R), 0.04))
        for x in (-0.3, 0.0, 0.3):
            steel.append(bm_cylinder(0.05, 0.16, 'Y', 12, (x, y, 0.09)))
        for k, x in enumerate((-TRACK_HALF, TRACK_HALF)):
            parts = [bm_cylinder(TRACK_R - 0.02, 0.17, 'Y', 24, (0, 0, 0)), bm_cylinder(0.06, 0.21, 'Y', 12, (0, 0, 0))]
            for j in range(8 if k == 0 else 5):
                a = 2 * math.pi * j / (8 if k == 0 else 5)
                t = bm_box((0.05, 0.1, 0.05), (0, 0, TRACK_R - 0.02)) if k == 0 else bm_cylinder(0.02, 0.19, 'Y', 8, (0, 0, 0.1))
                bmesh.ops.rotate(t, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Y'), verts=t.verts)
                parts.append(t)
            w = mesh_object(f'TrackWheel{"L" if s > 0 else "R"}{k}', merge(*parts), m['steel'], root, (x, y, TRACK_R))
            finish(w, 0.006, dirt_range=(-0.3, 0.3))
    steel.append(lib.rounded_box((1.5, 0.5, 0.16), (0, 0, 0.36), 0.04))  # chassis between the tracks
    # Front frame out to the skip hinge, and a cradle the skip rests on.
    hx, hz = SKIP_HINGE
    for s in (1, -1):
        steel.append(lib.rounded_box((hx - 0.2, 0.08, 0.12), ((hx + 0.2) / 2, s * 0.3, 0.44), 0.03))
        steel.append(lib.rounded_box((0.1, 0.08, hz - 0.36), (hx, s * 0.3, (hz + 0.36) / 2 - 0.02), 0.03))
    steel.append(bm_cylinder(0.04, 0.72, 'Y', 12, (hx, 0, hz - 0.03)))  # hinge tube
    steel.append(lib.rounded_box((0.08, 0.7, 0.08), (0.25, 0, 0.5), 0.02))  # cradle cross member
    fr = mesh_object('Chassis', merge(*steel), m['frame'], root)
    finish(fr, 0.006, dirt_range=DIRT)


def body(m, root):
    # Engine box at the back, with the seat on top; a step and the levers in front of it.
    eng = [lib.rounded_box((0.7, 0.9, 0.52), (-0.55, 0, 0.7), 0.08)]
    e = mesh_object('EngineCover', merge(*eng), m['paint'], root)
    finish(e, 0, uv_scale=1.2, smooth_angle=50, dirt_range=DIRT)
    det = [bm_box((0.02, 0.5, 0.015), (-0.905, 0, 0.55 + k * 0.05)) for k in range(5)]  # grille at the back
    det.append(bm_cylinder(0.022, 0.3, 'Z', 10, (-0.75, -0.32, 1.1)))  # exhaust
    det.append(bm_box((0.3, 0.8, 0.03), (-0.05, 0, 0.46)))  # footplate
    d = mesh_object('BodyDetails', merge(*det), m['black'], root)
    finish(d, 0, dirt=False)
    # Roll bar behind the seat.
    bar = []
    for s in (1, -1):
        bar.append(lib.rounded_box((0.06, 0.06, 1.1), (-0.85, s * 0.42, 1.45), 0.02))
    bar.append(lib.rounded_box((0.06, 0.9, 0.06), (-0.85, 0, 2.0), 0.02))
    b = mesh_object('RollBar', merge(*bar), m['frame'], root)
    finish(b, 0, dirt_range=(0.0, 2.0))
    bc = mesh_object('Beacon', bm_cylinder(0.05, 0.08, 'Z', 12, (-0.85, 0, 2.07)), m['amber'], root)
    finish(bc, 0, dirt=False)

    inside = empty('Interior', (0, 0, 0), root)
    seat = merge(bm_box((0.4, 0.44, 0.1), (-0.55, 0, 1.01)), bm_box((0.1, 0.44, 0.42), (-0.75, 0, 1.25)))
    st = mesh_object('Seat', seat, m['seat'], inside)
    finish(st, 0.03, 3, dirt=False)
    lev = [bm_cylinder(0.012, 0.55, 'Z', 8, (-0.12, s * 0.12, 0.72)) for s in (1, -1)]
    lev.append(bm_box((0.12, 0.34, 0.2), (-0.15, 0, 0.55)))  # lever box
    lv = mesh_object('Levers', merge(*lev), m['black'], inside)
    finish(lv, 0.004, dirt=False)
    kn = [bm_cylinder(0.022, 0.05, 'Z', 12, (-0.12, s * 0.12, 1.0)) for s in (1, -1)]
    mesh_object('Knobs', merge(*kn), m['red'], inside)


def skip(m, root):
    """The skip: a steel hopper, open at the top, sloping up at the front so it pours
    when tipped. Built round its hinge (the front bottom edge)."""
    hx, hz = SKIP_HINGE
    pivot = empty('SkipPivot', (hx, 0, hz), root)
    # Side profile (x, z) relative to the hinge: back wall, floor, sloping front.
    back_x, floor_z = -1.08, 0.02
    prof_outer = [(back_x, 0.55), (back_x, floor_z), (-0.1, floor_z), (0.18, 0.5)]
    wt = 0.025
    w = 0.46  # half width inside
    walls = []
    # Floor and sloping front as one bent plate; back plate; two side plates.
    walls.append(bm_box((abs(back_x) - 0.1, 2 * w, wt), ((back_x - 0.1) / 2, 0, floor_z)))
    front_len = math.hypot(0.28, 0.48)
    fp = bm_box((front_len, 2 * w, wt), (0, 0, 0))
    bmesh.ops.rotate(fp, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.atan2(0.48, 0.28), 3, 'Y'), verts=fp.verts)
    bmesh.ops.translate(fp, vec=(0.04, 0, floor_z + 0.24), verts=fp.verts)
    walls.append(fp)
    walls.append(bm_box((wt, 2 * w, 0.53), (back_x, 0, floor_z + 0.265)))
    for s in (1, -1):
        bm = bmesh.new()
        vs = [bm.verts.new((x, s * w, z)) for x, z in prof_outer]
        bm.faces.new(vs if s > 0 else list(reversed(vs)))
        ext = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
        verts = [v for v in ext['geom'] if isinstance(v, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(0, s * wt, 0), verts=verts)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        walls.append(bm)
    # Rolled top rim and two lugs at the hinge.
    walls.append(bm_cylinder(0.022, 2 * w + 0.06, 'Y', 10, (back_x, 0, 0.56)))
    for s in (1, -1):
        walls.append(bm_cylinder(0.02, abs(back_x) + 0.2, 'X', 10, ((back_x + 0.18) / 2, s * (w + 0.02), 0.52)))
        walls.append(bm_box((0.1, 0.05, 0.12), (0.0, s * 0.3, -0.03)))
    sk = mesh_object('Skip', merge(*walls), m['paint'], pivot)
    finish(sk, 0.008, uv_scale=1.2, dirt_range=(-0.6, 0.6))
    # Tipping ram under the skip.
    ram = merge(bm_cylinder(0.045, 0.34, 'X', 12, (-0.5, 0, -0.1)), bm_cylinder(0.025, 0.2, 'X', 12, (-0.3, 0, -0.08)))
    r = mesh_object('SkipRam', ram, m['frame'], root)
    r.location = (hx, 0, hz)
    finish(r, 0, dirt=False)


def build(tier):
    m = paints(tier)
    root = empty('Dumper')
    undercarriage(m, root)
    body(m, root)
    skip(m, root)
    return root


def pose(root, tip=0.0):
    import bpy
    bpy.data.objects['SkipPivot'].rotation_euler = (0, tip, 0)


PREVIEW = dict(target=(0.1, 0, 0.8), distance=5.0, angle=35, elevation=15, ground_z=0.0)

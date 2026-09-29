"""Mini digger (~1.5 t class): rubber tracks, a dozer blade, an open four-post canopy.

Origin = ground centre between the tracks. Named nodes the game uses (as on the excavator):
House (swings about Z), Boom, Stick, Bucket (pivots; the game turns them about Blender -Y),
BucketLink, the rams (BoomRam/BoomRamRod, StickRam/StickRamRod, BucketRam/BucketRamRod),
TrackWheelL0/L1 and TrackWheelR0/R1 (rear sprocket, front idler), Blade (the dozer blade,
on a pivot the game can raise and lower), Interior (seat and controls).
The arm matches MINI_ARM in src/world3d/excavatorArm.js: house floor 0.42 m up, boom foot
at house (0.5, 0, 0.3), boom 1.75 m, stick 1.1 m."""
import math
import bmesh
from mathutils import Matrix
import lib
from lib import bm_box, bm_cylinder, bm_profile, bm_lathe, bm_torus, merge, mesh_object, empty, finish
from excavator import box_beam

TRACK_Y = 0.43  # track centre lines
TRACK_W = 0.23
TRACK_HALF = 0.58  # centre to sprocket / idler axles
TRACK_R = 0.2
HOUSE_Z = 0.42
BOOM_PIVOT = (0.5, 0.3)  # in house (x, z)
BOOM = 1.75
STICK = 1.1
LINK_LEN = 0.19
LINK_RATIO = 0.55
LINK_OFFSET = 1.9
BUCKET_C = (0.2, 0.02)  # centre of the bucket's curve, in bucket space (x, z)
BUCKET_R = 0.22
BUCKET_W = 0.36
DIRT = (0.0, 0.8)


def paints(tier):
    m = lib.standard_materials(tier)
    m['canopy'] = lib.material('Canopy', (0.05, 0.05, 0.055), 'paint_worn', lib.tex.paint_worn, roughness=0.6, metallic=0.3)
    m['track'] = lib.material('RubberTrack', (0.55, 0.55, 0.55), 'rubber', lib.tex.rubber, 512, roughness=0.95)
    return m


def stadium(s):
    """Point and outward normal (x, z) at distance s round the track loop."""
    straight = 2 * TRACK_HALF
    arc = math.pi * TRACK_R
    total = 2 * straight + 2 * arc
    s %= total
    if s < straight:
        return (-TRACK_HALF + s, 0.0), (0.0, -1.0)
    s -= straight
    if s < arc:
        a = -math.pi / 2 + s / TRACK_R
        return (TRACK_HALF + math.cos(a) * TRACK_R, TRACK_R + math.sin(a) * TRACK_R), (math.cos(a), math.sin(a))
    s -= arc
    if s < straight:
        return (TRACK_HALF - s, 2 * TRACK_R), (0.0, 1.0)
    s -= straight
    a = math.pi / 2 + s / TRACK_R
    return (-TRACK_HALF + math.cos(a) * TRACK_R, TRACK_R + math.sin(a) * TRACK_R), (math.cos(a), math.sin(a))


SHOES = 44  # lugs round each track; the game copies TrackShoe this many times


def track_band(y):
    """The rubber belt itself: a smooth band round the loop (the lugs are separate, so they can move)."""
    total = 4 * TRACK_HALF + 2 * math.pi * TRACK_R
    n = 72
    t = 0.04
    bm = bmesh.new()
    rings = []
    for i in range(n):
        (x, z), (nx, nz) = stadium(i * total / n)
        ring = []
        for off, w in ((0.0, -1), (0.0, 1), (t, 1), (t, -1)):  # inner face on the wheels, outer face t above
            ring.append(bm.verts.new((x + nx * off, y + w * TRACK_W / 2, z + nz * off)))
        rings.append(ring)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new([a[j], a[k], b[k], b[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def track_shoe():
    """One chevron lug on the outside of the belt (local +Z is outward, like the excavator's shoe)."""
    pitch = (4 * TRACK_HALF + 2 * math.pi * TRACK_R) / SHOES
    parts = []
    for side in (-1, 1):
        lug = bm_box((pitch * 0.45, TRACK_W * 0.5, 0.026), (0, side * TRACK_W * 0.24, 0.053))
        bmesh.ops.rotate(lug, cent=(0, side * TRACK_W * 0.24, 0.053), matrix=Matrix.Rotation(side * 0.5, 3, 'Z'), verts=lug.verts)
        parts.append(lug)
    return merge(*parts)


def undercarriage(m, root):
    steel = []
    for s in (1, -1):
        y = s * TRACK_Y
        steel.append(lib.rounded_box((2 * TRACK_HALF - 0.1, 0.13, 0.16), (0, y, TRACK_R), 0.04))  # track frame
        for x in (-0.3, 0.0, 0.3):  # bottom rollers
            steel.append(bm_cylinder(0.055, 0.15, 'Y', 12, (x, y, 0.1)))
        # Sprocket (rear, with the drive motor) and idler (front): turned by the game.
        for k, x in enumerate((-TRACK_HALF, TRACK_HALF)):
            parts = [bm_cylinder(TRACK_R - 0.02, 0.16, 'Y', 24, (0, 0, 0)), bm_cylinder(0.07, 0.2, 'Y', 12, (0, 0, 0))]
            for j in range(8 if k == 0 else 5):
                a = 2 * math.pi * j / (8 if k == 0 else 5)
                if k == 0:
                    tooth = bm_box((0.05, 0.1, 0.05), (0, 0, TRACK_R - 0.02))
                else:
                    tooth = bm_cylinder(0.02, 0.18, 'Y', 8, (0, 0, 0.11))
                bmesh.ops.rotate(tooth, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Y'), verts=tooth.verts)
                parts.append(tooth)
            side = 'L' if s > 0 else 'R'
            w = mesh_object(f'TrackWheel{side}{k}', merge(*parts), m['steel'], root, (x, y, TRACK_R))
            finish(w, 0.006, dirt_range=(-0.3, 0.3))
        steel.append(bm_cylinder(0.11, 0.12, 'Y', 16, (-TRACK_HALF, y - s * 0.12, TRACK_R)))  # drive motor
    steel.append(lib.rounded_box((0.75, 0.72, 0.18), (0, 0, 0.3), 0.05))  # centre frame
    steel.append(bm_cylinder(0.34, 0.06, 'Z', 32, (0, 0, HOUSE_Z - 0.03)))  # slew ring
    frame = mesh_object('Undercarriage', merge(*steel), m['steel'], root)
    finish(frame, 0.008, dirt_range=DIRT)
    tracks = mesh_object('TrackBand', merge(track_band(TRACK_Y), track_band(-TRACK_Y)), m['track'], root)
    finish(tracks, 0, uv_scale=0.4, smooth_angle=30, dirt_range=(-0.1, 0.5))
    shoe = mesh_object('TrackShoe', track_shoe(), m['track'], root)
    finish(shoe, 0.003, uv_scale=0.4, dirt_range=(-0.1, 0.5))

    # Dozer blade on two arms from a pivot on the frame; the game can lift it about Y.
    pivot = empty('Blade', (0.38, 0, 0.3), root)
    prof = [(0.44, -0.3), (0.52, -0.29), (0.56, -0.16), (0.53, -0.04), (0.49, -0.02), (0.5, -0.15), (0.47, -0.27)]
    blade = [bm_profile(prof, 1.12, 'Y')]
    for s in (1, -1):
        blade.append(bm_box((0.42, 0.06, 0.08), (0.24, s * 0.3, -0.12)))  # arms
    blade.append(bm_cylinder(0.05, 0.7, 'Y', 12, (0, 0, 0)))  # pivot tube
    b = mesh_object('BladeBody', merge(*blade), m['paint'], pivot)
    finish(b, 0.01, 2, dirt_range=(-0.4, 0.3))
    ram = merge(bm_cylinder(0.035, 0.28, 'X', 12, (0.2, 0, 0.07)), bm_cylinder(0.018, 0.16, 'X', 12, (0.38, 0, 0.03)))
    r = mesh_object('BladeRam', ram, m['paint2'], pivot)
    finish(r, 0, dirt=False)


def house(m, root):
    h = empty('House', (0, 0, HOUSE_Z), root)
    parts = [lib.rounded_box((1.1, 0.95, 0.08), (-0.1, 0, 0.04), 0.03)]  # deck
    hood = mesh_object('Deck', merge(*parts), m['paint2'], h)
    finish(hood, 0, uv_scale=1.4, dirt_range=(-0.5, 0.8))

    # Engine under the seat, and the counterweight curving round the back (tail swing 0.72 m).
    def tail(inset):
        pts = []
        for i in range(21):
            a = math.radians(115 + i * 130 / 20)
            pts.append((math.cos(a) * (0.72 - inset), math.sin(a) * (0.72 - inset) * 0.72))
        pts += [(0.12 - inset, -0.4 + inset), (0.12 - inset, 0.4 - inset)]
        return pts
    rings = []
    for z, inset in ((0.07, 0.03), (0.09, 0.0), (0.5, 0.0), (0.56, 0.02), (0.6, 0.06), (0.62, 0.12)):
        rings.append((z, tail(inset)))
    body = mesh_object('HouseBody', lib.loft_z(rings), m['paint'], h)
    finish(body, 0, uv_scale=1.2, smooth_angle=50, dirt_range=(-0.5, 0.9))
    det = [bm_box((0.45, 0.02, 0.015), (-0.35, 0.36, 0.25 + k * 0.05)) for k in range(4)]  # engine vents
    det.append(bm_cylinder(0.025, 0.25, 'Z', 10, (-0.45, -0.25, 0.72)))  # exhaust stub
    d = mesh_object('HouseDetails', merge(*det), m['black'], h)
    finish(d, 0, dirt=False)
    # Boom mount at the front.
    mount = merge(bm_box((0.3, 0.06, 0.45), (0.45, 0.13, 0.25)), bm_box((0.3, 0.06, 0.45), (0.45, -0.13, 0.25)),
                  bm_box((0.26, 0.3, 0.1), (0.38, 0, 0.05)))
    mo = mesh_object('BoomMount', mount, m['paint'], h)
    finish(mo, 0.01, dirt_range=(-0.5, 0.8))

    # Canopy: four posts and a roof.
    posts = []
    for x, y in ((-0.5, 0.42), (-0.5, -0.42), (0.28, 0.44), (0.28, -0.44)):
        posts.append(lib.rounded_box((0.06, 0.05, 1.7), (x, y, 0.95), 0.015))
    posts.append(lib.rounded_box((1.0, 0.98, 0.07), (-0.1, 0, 1.82), 0.03))  # roof
    posts.append(lib.rounded_box((0.08, 0.9, 0.05), (-0.5, 0, 1.2), 0.015))  # rear bar
    c = mesh_object('Canopy', merge(*posts), m['canopy'], h)
    finish(c, 0, uv_scale=1.0, dirt_range=(-0.5, 2.0))
    lt = mesh_object('WorkLight', bm_box((0.06, 0.12, 0.08), (0.34, 0.3, 1.78)), m['light'], h)
    finish(lt, 0.005, dirt=False)
    bc = mesh_object('Beacon', bm_cylinder(0.05, 0.08, 'Z', 12, (-0.3, 0.3, 1.9)), m['amber'], h)
    finish(bc, 0, dirt=False)

    # Operator: seat on the engine, joystick consoles, travel levers, floor plate.
    inside = empty('Interior', (0, 0, 0), h)
    seat = merge(bm_box((0.42, 0.44, 0.1), (-0.12, 0, 0.67)), bm_box((0.1, 0.44, 0.5), (-0.33, 0, 0.95)))
    st = mesh_object('Seat', seat, m['seat'], inside)
    finish(st, 0.03, 3, dirt=False)
    con = []
    for s in (1, -1):
        con.append(bm_box((0.34, 0.1, 0.22), (-0.05, s * 0.3, 0.65)))
        con.append(bm_cylinder(0.014, 0.16, 'Z', 8, (0.05, s * 0.3, 0.83)))
    for s in (1, -1):  # travel levers in front of the seat
        con.append(bm_cylinder(0.012, 0.5, 'Z', 8, (0.26, s * 0.08, 0.42)))
    con.append(bm_box((0.35, 0.6, 0.02), (0.22, 0, 0.12)))  # floor plate
    cc = mesh_object('Controls', merge(*con), m['black'], inside)
    finish(cc, 0.004, dirt=False)
    knobs = [bm_cylinder(0.03, 0.06, 'Z', 12, (0.05, s * 0.3, 0.93)) for s in (1, -1)]
    knobs += [bm_cylinder(0.022, 0.05, 'Z', 12, (0.26, s * 0.08, 0.68)) for s in (1, -1)]
    mesh_object('Knobs', merge(*knobs), m['red'], inside)
    return h


RAMS = {
    'BoomRam': ('house', (0.6, 0.0), 'boom', (1.17, -0.06), 0.055, 0.03),
    'StickRam': ('boom', (0.49, 0.36), 'stick', (-0.19, 0.18), 0.05, 0.028),
    'BucketRam': ('stick', (0.106, 0.16), 'link', (LINK_LEN, 0.0), 0.042, 0.024),
}


def _rot(p, a):
    return (p[0] * math.cos(a) - p[1] * math.sin(a), p[0] * math.sin(a) + p[1] * math.cos(a))


def ram_range(name):
    """Shortest and longest pin-to-pin distance over each joint's range."""
    _, bpin, _, rpin, *_ = RAMS[name]
    ds = []
    for i in range(61):
        t = i / 60
        if name == 'BoomRam':
            q = _rot(rpin, -0.8 + 1.8 * t)
            q = (BOOM_PIVOT[0] + q[0], BOOM_PIVOT[1] + q[1])
        elif name == 'StickRam':
            q = _rot(rpin, -2.55 + 2.25 * t)
            q = (BOOM + q[0], q[1])
        else:
            q = _rot(rpin, LINK_RATIO * (-3.0 + 4.3 * t) + LINK_OFFSET)
            q = (STICK + q[0], q[1])
        ds.append(math.hypot(q[0] - bpin[0], q[1] - bpin[1]))
    return min(ds), max(ds)


def build_rams(m, h, boom, stick, link):
    parents = {'house': h, 'boom': boom, 'stick': stick, 'link': link}
    for name, (bp, bpin, rp, rpin, rb, rr) in RAMS.items():
        dmin, dmax = ram_range(name)
        barrel_len = dmin - 0.06
        rod_len = min(dmin - 0.05, dmax - barrel_len + 0.12)
        barrel = merge(
            bm_torus(rb * 0.55, rb * 0.3, 'Y', 12, 6, (0, 0, 0)),
            bm_lathe([(0.0, rb * 0.6), (rb * 0.85, rb * 0.6), (rb, rb * 0.8), (rb, barrel_len - 0.03),
                      (rb * 1.14, barrel_len - 0.025), (rb * 1.14, barrel_len), (rr * 1.3, barrel_len + 0.005),
                      (0.0, barrel_len + 0.005)], 16, 'X'))
        bo = mesh_object(name, barrel, m['paint2'], parents[bp])
        bo.location = (bpin[0], 0, bpin[1])
        finish(bo, 0, smooth_angle=50, dirt=False)
        rod = merge(bm_torus(rr * 0.9, rr * 0.45, 'Y', 12, 6, (0, 0, 0)),
                    bm_cylinder(rr, rod_len, 'X', 12, (rod_len / 2 + rr * 0.8, 0, 0)))
        ro = mesh_object(name + 'Rod', rod, m['chrome'], parents[rp])
        ro.location = (rpin[0], 0, rpin[1])
        finish(ro, 0, smooth_angle=50, dirt=False)


def aim_rams():
    import bpy
    bpy.context.view_layer.update()
    for name in RAMS:
        for obj, other in ((bpy.data.objects[name], bpy.data.objects[name + 'Rod']),
                           (bpy.data.objects[name + 'Rod'], bpy.data.objects[name])):
            target = obj.parent.matrix_world.inverted() @ other.matrix_world.translation
            d = target - obj.location
            obj.rotation_euler = (0, -math.atan2(d.z, d.x), 0)
        bpy.context.view_layer.update()


def arm(m, h):
    boom_pivot = empty('Boom', (BOOM_PIVOT[0], 0, BOOM_PIVOT[1]), h)
    top = [(-0.1, 0.11), (0.44, 0.24), (0.87, 0.3), (1.36, 0.2), (1.83, 0.09)]
    bottom = [(-0.1, -0.13), (0.44, -0.06), (0.92, 0.05), (1.26, -0.01), (1.83, -0.1)]
    boom = [box_beam(top, bottom, 0.085, -0.1, 1.83, 0.035)]
    boom.append(bm_cylinder(0.09, 0.2, 'Y', 16, (0, 0, 0)))
    boom.append(bm_cylinder(0.08, 0.2, 'Y', 16, (BOOM, 0, 0)))
    b = mesh_object('BoomBody', merge(*boom), m['paint'], boom_pivot)
    finish(b, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-1.0, 1.5))

    stick_pivot = empty('Stick', (BOOM, 0, 0), boom_pivot)
    stick = [box_beam([(-0.19, 0.13), (0.5, 0.085), (1.15, 0.055)], [(-0.19, -0.085), (0.5, -0.075), (1.15, -0.055)],
                      0.065, -0.19, 1.15, 0.025, 16)]
    stick.append(bm_cylinder(0.06, 0.17, 'Y', 12, (STICK, 0, 0)))
    s = mesh_object('StickBody', merge(*stick), m['paint'], stick_pivot)
    finish(s, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-1.5, 1.5))

    bucket_pivot = empty('Bucket', (STICK, 0, 0), stick_pivot)
    link_obj = empty('BucketLink', (STICK, 0, 0), stick_pivot)
    lb = merge(lib.rounded_box((LINK_LEN + 0.06, 0.14, 0.05), (LINK_LEN / 2, 0, 0), 0.02),
               bm_cylinder(0.035, 0.16, 'Y', 10, (LINK_LEN, 0, 0)))
    lo = mesh_object('LinkBar', lb, m['steel'], link_obj)
    finish(lo, 0, smooth_angle=50, dirt=False)
    link_obj.rotation_euler = (0, -LINK_OFFSET, 0)
    build_rams(m, h, boom_pivot, stick_pivot, link_obj)

    cx, cz = BUCKET_C
    R = BUCKET_R
    outer = [(cx + math.cos(a) * R, cz + math.sin(a) * R) for a in [math.radians(170 + i * 10) for i in range(22)]]
    inner = [(cx + math.cos(a) * (R - 0.025), cz + math.sin(a) * (R - 0.025)) for a in [math.radians(380 - i * 10) for i in range(22)]]
    shell = bm_profile(outer + inner, BUCKET_W, 'Y')
    sides = [bm_profile(outer, 0.02, 'Y', s_ * BUCKET_W / 2) for s_ in (1, -1)]
    lugs = [bm_box((0.12, 0.03, 0.12), (0.03, s_ * 0.07, 0.05)) for s_ in (1, -1)]
    bkt = mesh_object('BucketBody', merge(shell, *sides, *lugs), m['paint2'], bucket_pivot)
    finish(bkt, 0.005, dirt_range=(-0.4, 0.4))
    tip = math.radians(380)
    tx, tz = cx + math.cos(tip) * R, cz + math.sin(tip) * R
    teeth = []
    for k in range(3):
        y = -0.12 + k * 0.12
        t = bm_profile([(0, -0.015), (0.08, 0.0), (0, 0.015)], 0.045, 'Y', y)
        bmesh.ops.rotate(t, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.radians(110), 3, 'Y'), verts=t.verts)
        bmesh.ops.translate(t, vec=(tx, 0, tz), verts=t.verts)
        teeth.append(t)
    tt = mesh_object('Teeth', merge(*teeth), m['steel'], bucket_pivot)
    finish(tt, 0.003, dirt=False)


def build(tier):
    m = paints(tier)
    root = empty('MiniDigger')
    undercarriage(m, root)
    h = house(m, root)
    arm(m, h)
    return root


def pose(root, boom=0.5, stick=-1.7, bucket=-1.2):
    import bpy
    for name, a in (('Boom', boom), ('Stick', stick), ('Bucket', bucket)):
        bpy.data.objects[name].rotation_euler = (0, -a, 0)
    bpy.data.objects['BucketLink'].rotation_euler = (0, -(LINK_RATIO * bucket + LINK_OFFSET), 0)
    aim_rams()


PREVIEW = dict(target=(0.5, 0, 0.9), distance=6.2, angle=40, elevation=14, ground_z=0.0)

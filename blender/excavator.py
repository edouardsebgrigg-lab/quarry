"""Tracked excavator (~8 t class).

Origin = ground centre between the tracks. Named nodes the game uses:
House (swings about Z), Boom (pivot, rotates about -Y in Blender = Z in the game),
Stick (pivot at the boom tip), Bucket (pivot at the stick tip), Cab, Interior.
Pivot positions match the placeholder model in src/world3d/models.js:
house at z 1.05; boom pivot at house (0.9, -0.35, 1.1); boom 3.6 m; stick 2.6 m."""
import math
import bmesh
from mathutils import Matrix, Vector
import lib
from lib import bm_box, bm_cylinder, bm_profile, bm_lathe, bm_torus, merge, mesh_object, empty, finish, section

TRACK_Y = 1.2
TRACK_HALF = 1.75  # distance from centre to sprocket / idler axles
TRACK_R = 0.42
DIRT = (0.0, 1.6)


def stadium(s):
    """Point and outward normal (x, z) at distance s around the track loop."""
    straight = 2 * TRACK_HALF
    arc = math.pi * TRACK_R
    total = 2 * straight + 2 * arc
    s %= total
    if s < straight:  # bottom, rear to front
        return (-TRACK_HALF + s, 0.0), (0.0, -1.0)
    s -= straight
    if s < arc:  # front curve, bottom to top
        a = -math.pi / 2 + s / TRACK_R
        return (TRACK_HALF + math.cos(a) * TRACK_R, TRACK_R + math.sin(a) * TRACK_R), (math.cos(a), math.sin(a))
    s -= arc
    if s < straight:  # top, front to rear
        return (TRACK_HALF - s, 2 * TRACK_R), (0.0, 1.0)
    s -= straight
    a = math.pi / 2 + s / TRACK_R
    return (-TRACK_HALF + math.cos(a) * TRACK_R, TRACK_R + math.sin(a) * TRACK_R), (math.cos(a), math.sin(a))


def track_chain(y):
    total = 4 * TRACK_HALF + 2 * math.pi * TRACK_R
    n = 52
    pitch = total / n
    parts = []
    for i in range(n):
        (x, z), (nx, nz) = stadium(i * pitch)
        theta = math.atan2(nx, nz)
        shoe = merge(bm_box((pitch * 0.92, 0.55, 0.05), (0, 0, -0.03)),
                     bm_box((0.035, 0.55, 0.05), (0, 0, 0.02)))  # grouser bar
        bmesh.ops.rotate(shoe, cent=(0, 0, 0), matrix=Matrix.Rotation(theta, 3, 'Y'), verts=shoe.verts)
        bmesh.ops.translate(shoe, vec=(x, y, z), verts=shoe.verts)
        parts.append(shoe)
    return merge(*parts)


def undercarriage(mats, root):
    steel = []
    for s in (1, -1):
        y = s * TRACK_Y
        steel.append(lib.rounded_box((3.2, 0.3, 0.34), (0, y, 0.45), 0.08))  # track frame
        steel.append(lib.rounded_box((2.6, 0.62, 0.03), (0, y, 0.87), 0.012))  # track guard on top
        for x in (-TRACK_HALF, TRACK_HALF):  # sprocket / idler
            steel.append(bm_cylinder(TRACK_R - 0.07, 0.34, 'Y', 24, (x, y, TRACK_R)))
            steel.append(bm_cylinder(0.12, 0.42, 'Y', 12, (x, y, TRACK_R)))
        for k in range(10):  # sprocket teeth
            a = 2 * math.pi * k / 10
            tooth = bm_box((0.1, 0.12, 0.08), (0, 0, TRACK_R - 0.04))
            bmesh.ops.rotate(tooth, cent=(0, 0, 0), matrix=Matrix.Rotation(a, 3, 'Y'), verts=tooth.verts)
            bmesh.ops.translate(tooth, vec=(-TRACK_HALF, y, TRACK_R), verts=tooth.verts)
            steel.append(tooth)
        for x in (-1.0, -0.35, 0.35, 1.0):  # bottom rollers
            steel.append(bm_cylinder(0.11, 0.3, 'Y', 12, (x, y, 0.16)))
        steel.append(bm_cylinder(0.08, 0.2, 'Y', 12, (0, y, 0.76)))  # top carrier roller
    # Centre frame joining the tracks, slew ring.
    steel.append(lib.rounded_box((1.6, 2.1, 0.36), (0, 0, 0.55), 0.08))
    steel.append(bm_cylinder(0.85, 0.18, 'Z', 32, (0, 0, 0.83)))
    frame = mesh_object('Undercarriage', merge(*steel), mats['steel'], root)
    finish(frame, 0.015, dirt_range=DIRT)

    chains = mesh_object('Tracks', merge(track_chain(TRACK_Y), track_chain(-TRACK_Y)), mats['steel'], root)
    finish(chains, 0.006, uv_scale=0.5, dirt_range=(0.0, 1.0))

    # Dozer blade at the front.
    blade_prof = [(2.25, 0.0), (2.42, 0.02), (2.5, 0.25), (2.45, 0.55), (2.33, 0.55), (2.36, 0.25), (2.3, 0.08)]
    blade = [bm_profile(blade_prof, 2.6, 'Y')]
    for s in (1, -1):
        blade.append(bm_box((0.9, 0.12, 0.14), (1.85, s * 0.7, 0.42)))
    b = mesh_object('Blade', merge(*blade), mats['paint'], root)
    finish(b, 0.02, 3, dirt_range=DIRT)


def house_body(mats, house):
    body = []
    body.append(lib.rounded_box((2.9, 2.5, 0.2), (-0.35, 0, 0.09), 0.05))  # deck
    body.append(lib.rounded_box((1.7, 2.5, 0.98), (-1.05, 0, 0.6), 0.16))  # engine cover (rear)
    body.append(lib.rounded_box((1.35, 0.85, 0.78), (0.55, -0.85, 0.54), 0.1))  # tool box / tank (right front)
    hood = mesh_object('HouseBody', merge(*body), mats['paint'], house)
    finish(hood, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-1.0, 1.4))
    # Engine cover panel lines and a lifting handle.
    lines = [bm_box((0.008, 2.3, 0.004), (x, 0, 1.092)) for x in (-1.45, -0.65)]
    lines += [bm_box((0.8, 0.008, 0.004), (-1.05, y, 1.092)) for y in (-1.05, 1.05)]
    ln = mesh_object('PanelLines', merge(*lines), mats['black'], house)
    finish(ln, 0, dirt=False)

    # Rounded counterweight at the back: a D shape in plan with rolled top and bottom edges.
    def d_shape(inset):
        pts = []
        for i in range(25):
            a = math.pi * (i / 24 - 0.5)
            pts.append((-1.85 - math.cos(a) * (0.45 - inset) + inset, math.sin(a) * (1.25 - inset)))
        pts += [(-1.6 - inset * 0.2, 1.25 - inset), (-1.6 - inset * 0.2, -1.25 + inset)]
        return pts
    rings = []
    for z, inset in ((0.08, 0.06), (0.1, 0.02), (0.14, 0.0), (0.9, 0.0), (0.96, 0.02), (1.0, 0.06), (1.02, 0.12)):
        rings.append((z, d_shape(inset)))
    c = mesh_object('Counterweight', lib.loft_z(rings), mats['paint2'], house)
    finish(c, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-1.0, 1.4))

    det = []
    for k in range(7):  # engine vents
        det.append(bm_box((0.9, 0.05, 0.03), (-1.1, -1.26, 0.35 + k * 0.08)))
    for k in range(6):  # hood grille on top
        det.append(bm_box((0.05, 1.0, 0.02), (-1.5 + k * 0.14, -0.5, 1.1)))
    for s in (1, -1):  # handrails
        det.append(bm_cylinder(0.025, 1.4, 'X', 8, (-1.05, s * 1.15, 1.35)))
        for x in (-1.7, -0.4):
            det.append(bm_cylinder(0.025, 0.25, 'Z', 8, (x, s * 1.15, 1.22)))
    det.append(bm_box((0.3, 0.3, 0.05), (0.35, -1.1, 0.95)))  # step on the tool box
    d = mesh_object('HouseDetails', merge(*det), mats['black'], house)
    finish(d, 0.005, dirt=False)
    ex = mesh_object('Exhaust', merge(bm_cylinder(0.06, 0.55, 'Z', 12, (-0.6, -0.9, 1.3))), mats['chrome'], house)
    finish(ex, 0, dirt=False)

    # Swing bosses where the boom mounts.
    boss = merge(bm_box((0.6, 0.18, 0.55), (0.95, -0.12, 0.75)), bm_box((0.6, 0.18, 0.55), (0.95, -0.58, 0.75)))
    bo = mesh_object('BoomMount', boss, mats['paint'], house)
    finish(bo, 0.02, dirt_range=(-1.0, 1.4))


def cab(mats, house):
    # Cab on the left front of the house, floor at z 0.18, roof at 1.85.
    y0 = 0.72
    w = 0.98

    def front(z):
        pts = [(0.18, 1.18), (0.75, 1.22), (1.75, 1.05), (1.9, 0.95)]
        for (z0, x0), (z1, x1) in zip(pts, pts[1:]):
            if z <= z1:
                return x0 + (x1 - x0) * max(0.0, (z - z0) / (z1 - z0))
        return pts[-1][1]

    rings = []
    for z, inset in ((0.18, 0.0), (0.75, 0.0), (1.7, 0.0), (1.78, 0.015), (1.83, 0.045), (1.86, 0.09), (1.875, 0.15)):
        ring = lib.plan_rect(-0.12 + inset, front(z) - inset, w / 2 - inset, max(0.03, 0.1 - inset * 0.5), 5)
        rings.append((z, [(x, y + y0) for x, y in ring]))
    shell = mesh_object('Cab', lib.loft_z(rings), mats['paint'], house)
    finish(shell, 0.008, 2, uv_scale=1.4, smooth_angle=40, dirt_range=(-1.0, 1.4))

    glass, seals = [], []
    yl, yr = y0 + w / 2, y0 - w / 2
    z0, z1 = 0.8, 1.7
    bot = Vector((front(z0), y0, z0))
    top = Vector((front(z1), y0, z1))
    V = (top - bot).normalized()
    U = Vector((0, 1, 0))
    n = U.cross(V).normalized()
    L = (top - bot).length
    mid = (top + bot) / 2
    glass.append(lib.panel(lib.rounded_rect(w - 0.16, L, 0.05), mid + n * 0.006, U, V))
    seals.append(lib.panel(lib.rounded_rect(w - 0.1, L + 0.06, 0.06), mid + n * 0.003, U, V))
    for y, sgn in ((yl, 1), (yr, -1)):  # big side windows; the door glass on the left
        pts = [(0.02, 0.72), (1.08, 0.72), (1.04, 1.1), (0.95, 1.7), (0.02, 1.7)]
        for pp, off, into in ((pts, 0.005, glass), ([(p[0] + (-0.03 if p[0] < 0.5 else 0.03), p[1] + (-0.03 if p[1] < 1.2 else 0.03)) for p in pts], 0.003, seals)):
            bm = bmesh.new()
            bm.faces.new([bm.verts.new((x, y + sgn * off, z)) for x, z in pp])
            into.append(bm)
    glass.append(lib.panel(lib.rounded_rect(w - 0.2, 0.7, 0.05), (-0.125, y0, 1.3), (0, -1, 0), (0, 0, 1)))
    centre = (0.55, y0, 1.0)
    g = mesh_object('CabGlass', lib.orient_outward(merge(*glass), centre), mats['glass'], house)
    lib.box_uv(g)
    se = mesh_object('CabSeals', lib.orient_outward(merge(*seals), centre), mats['black'], house)
    lib.box_uv(se)

    # Frame pillars, wiper, work lights, beacon, mirror.
    det = []
    det.append(bm_box((0.012, 0.02, 0.5), (front(1.1) + 0.02, y0 + 0.38, 1.1)))  # wiper, parked at the side
    det.append(bm_box((0.008, 0.004, 1.0), (1.0, yl + 0.002, 0.7)))  # door shut line
    det.append(lib.rounded_box((0.3, 0.06, 0.06), (0.55, yl + 0.35, 1.84), 0.02))  # rain guard
    det.append(bm_box((0.05, 0.05, 0.45), (1.05, yl + 0.1, 1.55)))  # mirror arm
    det.append(lib.rounded_box((0.06, 0.2, 0.28), (1.08, yl + 0.18, 1.72), 0.025))
    det.append(bm_box((0.2, 0.04, 0.04), (0.35, yl + 0.01, 1.05)))  # door handle
    fr = mesh_object('CabFrame', merge(*det), mats['black'], house)
    finish(fr, 0.005, dirt=False)
    lights = [bm_box((0.08, 0.2, 0.12), (1.0, y0 + s * 0.3, 1.92)) for s in (1, -1)]
    lt = mesh_object('WorkLights', merge(*lights), mats['light'], house)
    finish(lt, 0.01, dirt=False)
    bc = mesh_object('Beacon', bm_cylinder(0.08, 0.15, 'Z', 16, (0.1, y0, 1.95)), mats['amber'], house)
    finish(bc, 0, dirt=False)

    # Interior: roof, pillars from inside, seat, joystick consoles, floor.
    inside = [bm_box((1.25, w - 0.05, 0.04), (0.55, y0, 1.8)),  # headliner
              bm_box((1.25, w - 0.05, 0.04), (0.55, y0, 0.22))]  # floor
    for x in (1.14, -0.05):
        for y in (y0 + w / 2 - 0.06, y0 - w / 2 + 0.06):
            inside.append(bm_box((0.06, 0.06, 1.6), (x, y, 1.0)))
    inside.append(bm_box((0.05, w - 0.05, 0.55), (1.16, y0, 0.48)))  # front lower panel
    for s in (1, -1):
        inside.append(bm_box((0.4, 0.14, 0.3), (0.35, y0 + s * 0.36, 0.55)))  # consoles
        inside.append(bm_cylinder(0.02, 0.2, 'Z', 8, (0.45, y0 + s * 0.36, 0.8)))  # joysticks
    interior = mesh_object('Interior', merge(*inside), mats['black'], house)
    finish(interior, 0.008, dirt=False)
    knobs = [lib.bm_cylinder(0.04, 0.08, 'Z', 12, (0.45, y0 + s * 0.36, 0.93)) for s in (1, -1)]
    mesh_object('Joysticks', merge(*knobs), mats['red'], interior)
    seat = merge(bm_box((0.5, 0.5, 0.14), (0.25, y0, 0.55)), bm_box((0.12, 0.5, 0.7), (-0.02, y0, 0.95)))
    st = mesh_object('Seat', seat, mats['seat'], interior)
    finish(st, 0.04, 3, dirt=False)


def cylinder_between(a, b, r_barrel, r_rod, split=0.6):
    """A hydraulic ram from a to b (x, z points in the XZ plane at y=0)."""
    a, b = Vector((a[0], 0, a[1])), Vector((b[0], 0, b[1]))
    d = b - a
    length = d.length
    Ls = length * split
    barrel = merge(
        bm_lathe([(0.0, 0.0), (r_barrel * 0.8, 0.0), (r_barrel, 0.03), (r_barrel, Ls - 0.05), (r_barrel * 1.12, Ls - 0.04),
                  (r_barrel * 1.12, Ls), (r_rod * 1.3, Ls + 0.01), (0.0, Ls + 0.01)], 20, 'X'),
        bm_torus(r_barrel * 0.55, r_barrel * 0.28, 'Y', 16, 6, (-r_barrel * 0.6, 0, 0)))  # mounting eye
    rod = merge(bm_cylinder(r_rod, length * (1 - split) + 0.1, 'X', 16, (Ls + (length - Ls) / 2 - 0.05, 0, 0)),
                bm_torus(r_rod * 0.9, r_rod * 0.45, 'Y', 16, 6, (length, 0, 0)))
    ang = math.atan2(d.z, d.x)
    for part in (barrel, rod):
        bmesh.ops.rotate(part, cent=(0, 0, 0), matrix=Matrix.Rotation(-ang, 3, 'Y'), verts=part.verts)
        bmesh.ops.translate(part, vec=a, verts=part.verts)
    return barrel, rod


def smooth_curve(pts, x):
    """Catmull-Rom through (x, z) points, sampled at x."""
    for i in range(len(pts) - 1):
        if x <= pts[i + 1][0] or i == len(pts) - 2:
            p0 = pts[max(0, i - 1)]
            p1, p2 = pts[i], pts[i + 1]
            p3 = pts[min(len(pts) - 1, i + 2)]
            t = (x - p1[0]) / (p2[0] - p1[0])
            t = min(1, max(0, t))
            return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t * t
                          + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t ** 3)


def box_beam(top, bottom, half_w, x0, x1, r=0.06, n=28):
    """A welded box-section arm: lofted along X between a top and bottom curve,
    with rounded corners and slightly tapered, closed ends."""
    st = []
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        zt, zb = smooth_curve(top, x), smooth_curve(bottom, x)
        end = min(i, n - i)
        k = 1.0 if end > 1 else (0.93 if end == 1 else 0.82)
        mid = (zt + zb) / 2
        st.append((x, section(half_w * k, half_w * k, mid + (zb - mid) * k, mid + (zt - mid) * k, r, r)))
    return lib.loft(st)


def arm(mats, house):
    boom_pivot = empty('Boom', (0.9, -0.35, 1.1), house)
    # Banana-shaped boom from (0,0) to (3.6,0).
    top = [(-0.2, 0.22), (0.9, 0.5), (1.8, 0.62), (2.8, 0.42), (3.75, 0.18)]
    bottom = [(-0.2, -0.26), (0.9, -0.12), (1.9, 0.1), (2.6, -0.02), (3.75, -0.2)]
    boom = [box_beam(top, bottom, 0.2, -0.2, 3.75, 0.07)]
    boom.append(bm_cylinder(0.2, 0.46, 'Y', 20, (0, 0, 0)))  # foot pin boss
    boom.append(bm_cylinder(0.17, 0.44, 'Y', 20, (3.6, 0, 0)))  # tip boss
    b = mesh_object('BoomBody', merge(*boom), mats['paint'], boom_pivot)
    finish(b, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-1.5, 3.0))
    # Boom ram underneath and stick ram on top.
    rams_barrel, rams_rod = [], []
    for a, bpt, rb, rr in (((0.2, -0.45), (1.8, -0.02), 0.11, 0.06), ((1.1, 0.72), (3.45, 0.5), 0.1, 0.055)):
        barrel, rod = cylinder_between(a, bpt, rb, rr)
        rams_barrel.append(barrel)
        rams_rod.append(rod)
    rb_obj = mesh_object('BoomRams', merge(*rams_barrel), mats['paint2'], boom_pivot)
    finish(rb_obj, 0, smooth_angle=50, dirt=False)
    rr_obj = mesh_object('BoomRods', merge(*rams_rod), mats['chrome'], boom_pivot)
    finish(rr_obj, 0, smooth_angle=50, dirt=False)

    stick_pivot = empty('Stick', (3.6, 0, 0), boom_pivot)
    stick = [box_beam([(-0.45, 0.3), (1.2, 0.2), (2.7, 0.13)], [(-0.45, -0.2), (1.2, -0.18), (2.7, -0.13)],
                      0.15, -0.45, 2.7, 0.05, 20)]
    stick.append(bm_cylinder(0.13, 0.36, 'Y', 16, (2.6, 0, 0)))
    s = mesh_object('StickBody', merge(*stick), mats['paint'], stick_pivot)
    finish(s, 0, uv_scale=1.4, smooth_angle=50, dirt_range=(-3.0, 3.0))
    barrel, rod = cylinder_between((-0.3, 0.42), (2.2, 0.3), 0.09, 0.05)
    mesh_object('StickRam', barrel, mats['paint2'], stick_pivot).data.shade_smooth()
    mesh_object('StickRod', rod, mats['chrome'], stick_pivot).data.shade_smooth()
    link = merge(bm_box((0.4, 0.34, 0.08), (2.35, 0, 0.3)), bm_box((0.08, 0.34, 0.3), (2.52, 0, 0.18)))
    lk = mesh_object('Linkage', link, mats['steel'], stick_pivot)
    finish(lk, 0.01, dirt=False)

    bucket_pivot = empty('Bucket', (2.6, 0, 0), stick_pivot)
    # Curved shell: an arc around (0.45, 0.05), opening upward in local space.
    cx, cz = 0.45, 0.05
    outer = [(cx + math.cos(a) * 0.5, cz + math.sin(a) * 0.5) for a in [math.radians(170 + i * 10) for i in range(22)]]
    inner = [(cx + math.cos(a) * 0.45, cz + math.sin(a) * 0.45) for a in [math.radians(380 - i * 10) for i in range(22)]]
    shell = bm_profile(outer + inner, 0.9, 'Y')
    sides = []
    for s_ in (1, -1):
        pts = [(cx + math.cos(a) * 0.5, cz + math.sin(a) * 0.5) for a in [math.radians(170 + i * 10) for i in range(22)]]
        sides.append(bm_profile(pts, 0.04, 'Y', s_ * 0.45))
    lugs = [bm_box((0.25, 0.06, 0.25), (0.05, s_ * 0.15, 0.1)) for s_ in (1, -1)]
    bkt = mesh_object('BucketBody', merge(shell, *sides, *lugs), mats['paint2'], bucket_pivot)
    finish(bkt, 0.01, dirt_range=(-0.6, 0.6))
    # Teeth along the cutting edge.
    tip_a = math.radians(380)
    tx, tz = cx + math.cos(tip_a) * 0.5, cz + math.sin(tip_a) * 0.5
    teeth = []
    for k in range(5):
        y = -0.36 + k * 0.18
        t = bm_profile([(0, -0.03), (0.16, 0.0), (0, 0.03)], 0.08, 'Y', y)
        bmesh.ops.rotate(t, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.radians(110), 3, 'Y'), verts=t.verts)
        bmesh.ops.translate(t, vec=(tx, 0, tz), verts=t.verts)
        teeth.append(t)
    tt = mesh_object('Teeth', merge(*teeth), mats['steel'], bucket_pivot)
    finish(tt, 0.005, dirt=False)
    return boom_pivot, stick_pivot, bucket_pivot


def build(tier):
    mats = lib.standard_materials(tier)
    root = empty('Excavator')
    undercarriage(mats, root)
    house = empty('House', (0, 0, 1.05), root)
    house_body(mats, house)
    cab(mats, house)
    arm(mats, house)
    return root


def pose(root, boom=0.55, stick=-1.6, bucket=-1.3):
    """Set the arm angles like the game does (game Z rotation = Blender -Y rotation)."""
    import bpy
    for name, a in (('Boom', boom), ('Stick', stick), ('Bucket', bucket)):
        bpy.data.objects[name].rotation_euler = (0, -a, 0)


PREVIEW = dict(target=(0.8, 0, 1.4), distance=12, angle=40, elevation=16, ground_z=0.0)

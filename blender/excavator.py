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
from lib import bm_box, bm_cylinder, bm_profile, merge, mesh_object, empty, finish

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
        steel.append(bm_box((3.2, 0.3, 0.32), (0, y, 0.45)))  # track frame
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
    steel.append(bm_box((1.6, 2.1, 0.35), (0, 0, 0.55)))
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
    finish(b, 0.01, dirt_range=DIRT)


def house_body(mats, house):
    body = []
    body.append(bm_box((2.9, 2.5, 0.18), (-0.35, 0, 0.09)))  # deck
    engine = bm_box((1.7, 2.5, 0.95), (-1.05, 0, 0.62))  # engine hood (rear)
    body.append(engine)
    body.append(bm_box((1.35, 0.85, 0.75), (0.55, -0.85, 0.55)))  # tool box / tank (right front)
    hood = mesh_object('HouseBody', merge(*body), mats['paint'], house)
    lib.bevel(hood, 0.08, 3)
    finish(hood, 0, dirt_range=(-1.0, 1.4))

    # Rounded counterweight at the back.
    arc = [(-1.85 - math.sin(a) * 0.45, math.cos(a) * 1.25) for a in [math.pi * (i / 16 - 0.5) for i in range(17)]]
    arc = [(-1.85, -1.25)] + arc[1:-1] + [(-1.85, 1.25)]
    cw = bm_profile(arc, 0.95, 'Z', 0.55)
    c = mesh_object('Counterweight', cw, mats['paint2'], house)
    finish(c, 0.05, 3, dirt_range=(-1.0, 1.4))

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
    prof = [(-0.1, 0.18), (1.18, 0.18), (1.22, 0.75), (1.05, 1.75), (0.92, 1.85), (0.0, 1.85), (-0.12, 1.75)]
    shell = mesh_object('Cab', bm_profile(prof, w, 'Y', y0), mats['paint'], house)
    lib.bevel(shell, 0.05, 3)
    finish(shell, 0, dirt_range=(-1.0, 1.4))

    glass = []
    def quad(pts):
        b = bmesh.new()
        b.faces.new([b.verts.new(p) for p in pts])
        glass.append(b)
    yl, yr = y0 + w / 2 + 0.005, y0 - w / 2 - 0.005
    quad([(1.235, yl - 0.08, 0.8), (1.235, yr + 0.08, 0.8), (1.07, yr + 0.08, 1.72), (1.07, yl - 0.08, 1.72)])  # front
    for y in (yl, yr):
        quad([(0.05, y, 0.75), (1.12, y, 0.75), (1.0, y, 1.72), (0.05, y, 1.72)])  # sides
    quad([(-0.13, yl - 0.1, 0.9), (-0.13, yr + 0.1, 0.9), (-0.13, yr + 0.1, 1.65), (-0.13, yl - 0.1, 1.65)])  # rear
    g = mesh_object('CabGlass', lib.orient_outward(merge(*glass), (0.55, y0, 1.0)), mats['glass'], house)
    lib.box_uv(g)

    # Frame pillars, wiper, work lights, beacon, mirror.
    det = []
    for x, z0, z1 in ((1.2, 0.75, 1.75), (-0.1, 0.2, 1.8)):
        for y in (yl, yr):
            det.append(bm_box((0.07, 0.07, z1 - z0), (x, y, (z0 + z1) / 2)))
    det.append(bm_box((0.04, 0.02, 0.45), (1.16, y0 + 0.38, 1.05)))  # wiper, parked at the side
    det.append(bm_box((0.05, 0.05, 0.45), (1.05, yl + 0.1, 1.55)))  # mirror arm
    det.append(bm_box((0.05, 0.2, 0.28), (1.08, yl + 0.18, 1.72)))
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
    barrel = bm_cylinder(r_barrel, length * split, 'X', 16, (length * split / 2, 0, 0))
    rod = bm_cylinder(r_rod, length * (1 - split) + 0.1, 'X', 12, (length * split + (length * (1 - split)) / 2 - 0.05, 0, 0))
    ang = math.atan2(d.z, d.x)
    for part in (barrel, rod):
        bmesh.ops.rotate(part, cent=(0, 0, 0), matrix=Matrix.Rotation(-ang, 3, 'Y'), verts=part.verts)
        bmesh.ops.translate(part, vec=a, verts=part.verts)
    return barrel, rod


def arm(mats, house):
    boom_pivot = empty('Boom', (0.9, -0.35, 1.1), house)
    # Banana-shaped boom from (0,0) to (3.6,0).
    top = [(-0.2, 0.22), (0.9, 0.5), (1.8, 0.62), (2.8, 0.42), (3.75, 0.18)]
    bottom = [(3.75, -0.2), (2.6, -0.02), (1.9, 0.12), (0.9, -0.12), (-0.2, -0.26)]
    boom = [bm_profile(top + bottom, 0.4, 'Y')]
    boom.append(bm_cylinder(0.2, 0.46, 'Y', 20, (0, 0, 0)))  # foot pin boss
    boom.append(bm_cylinder(0.17, 0.44, 'Y', 20, (3.6, 0, 0)))  # tip boss
    b = mesh_object('BoomBody', merge(*boom), mats['paint'], boom_pivot)
    finish(b, 0.03, dirt_range=(-1.5, 3.0))
    # Boom ram underneath and stick ram on top.
    rams_barrel, rams_rod = [], []
    for a, bpt, rb, rr in (((0.2, -0.45), (1.8, -0.02), 0.11, 0.06), ((1.1, 0.72), (3.45, 0.5), 0.1, 0.055)):
        barrel, rod = cylinder_between(a, bpt, rb, rr)
        rams_barrel.append(barrel)
        rams_rod.append(rod)
    rb_obj = mesh_object('BoomRams', merge(*rams_barrel), mats['paint2'], boom_pivot)
    finish(rb_obj, 0, dirt=False)
    rr_obj = mesh_object('BoomRods', merge(*rams_rod), mats['chrome'], boom_pivot)
    finish(rr_obj, 0, dirt=False)

    stick_pivot = empty('Stick', (3.6, 0, 0), boom_pivot)
    stick = [bm_profile([(-0.45, 0.3), (1.2, 0.2), (2.7, 0.13), (2.7, -0.13), (1.2, -0.18), (-0.45, -0.2)], 0.3, 'Y')]
    stick.append(bm_cylinder(0.13, 0.36, 'Y', 16, (2.6, 0, 0)))
    s = mesh_object('StickBody', merge(*stick), mats['paint'], stick_pivot)
    finish(s, 0.025, dirt_range=(-3.0, 3.0))
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

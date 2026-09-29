"""The owner's old pickup (a static prop): a 1970s-style single-cab pickup with faded paint.

The body is lofted from cross-sections, so panels have rounded shoulders, the cab leans in
towards the roof and the wheel arches are real cut-outs with flared lips. X forward, Y left,
Z up; the origin sits on the ground under the middle of the truck."""
import math
import bmesh
from mathutils import Matrix
import lib
import textures as tex
from lib import (bm_box, bm_cylinder, bm_lathe, bm_torus, merge, mesh_object, empty, finish, material,
                 section, loft, panel, rounded_rect)

W = 0.9            # half width of the body
WB = 1.55          # wheel centres at x = +/- WB
R_TYRE = 0.36
ARCH_R = 0.47
ARCH_Z = 0.4       # wheel centre height
BELT = 1.06        # beltline: where the cab glass area starts
ROOF = 1.8
RUST = (0.42, 0.26, 0.16)   # grime colour: rusty brown along the sills


def arch_bottom(x, base):
    """Underside height of the body at x, lifted over the wheel arches."""
    zb = base
    for cx in (-WB, WB):
        dx = x - cx
        if abs(dx) < ARCH_R:
            zb = max(zb, ARCH_Z + math.sqrt(ARCH_R ** 2 - dx ** 2))
    return zb


def stations_between(x0, x1, step, extra=()):
    xs = set(round(x0 + (x1 - x0) * i / max(1, round((x1 - x0) / step)), 4)
             for i in range(max(1, round((x1 - x0) / step)) + 1))
    for cx in (-WB, WB):  # dense sampling around the arches
        for i in range(-12, 13):
            x = cx + ARCH_R * i / 12
            if x0 <= x <= x1:
                xs.add(round(x, 4))
    xs.update(x for x in extra if x0 <= x <= x1)
    return sorted(xs)


def front_body():
    """Doors, front wings and bonnet, from behind the cab to the nose."""
    st = []
    for x in stations_between(-0.4, 2.62, 0.25, extra=(1.3, 1.45, 2.45, 2.55)):
        # Bonnet drops gently towards the nose.
        zt = BELT + 0.02 if x < 1.35 else BELT + 0.02 - (x - 1.35) * 0.055
        st.append((x, section(W, W - 0.02, arch_bottom(x, 0.5), zt, rb=0.07, rt=0.1)))
    # Rounded nose.
    for x, k in ((2.66, 0.985), (2.69, 0.96), (2.7, 0.93)):
        zt = BELT + 0.02 - (x - 1.35) * 0.055
        st.append((x, section(W * k, (W - 0.02) * k, 0.5 + (1 - k) * 0.6, zt - (1 - k) * 0.5, rb=0.07, rt=0.1)))
    return loft(st)


def bed_body():
    """The bed's lower box (floor level), with the rear arch cut in."""
    st = [(x, section(W, W - 0.01, arch_bottom(x, 0.52), 0.84, rb=0.07, rt=0.03))
          for x in stations_between(-2.62, -0.36, 0.25)]
    return loft(st)


def cab_body():
    """The cab above the beltline: leans in to the roof, raked windscreen."""
    def roof_at(x):
        if x <= 0.8:
            return ROOF
        return ROOF - (x - 0.8) * (ROOF - 1.12) / 0.56
    st = []
    for x in (-0.38, -0.36, -0.32, 0.0, 0.4, 0.8, 1.0, 1.2, 1.34, 1.36):
        zt = roof_at(x)
        if x < -0.3:
            zt -= (-0.3 - x) * 1.2  # soften the back edge of the roof
        st.append((x, section(W - 0.02, W - 0.17, BELT - 0.03, zt, rb=0.01, rt=0.1)))
    return loft(st)


def side_plane_y(z):
    """Half-width of the cab's leaning side at height z (to lay windows on it)."""
    z0, z1 = BELT - 0.03 + 0.01, ROOF - 0.1
    t = min(1, max(0, (z - z0) / (z1 - z0)))
    return (W - 0.02) + ((W - 0.17) - (W - 0.02)) * t


def glass_parts():
    glass, seals = [], []
    # Side windows: a polygon on the leaning side plane (front edge follows the A-pillar).
    lo, hi = BELT + 0.05, ROOF - 0.14
    ya, yb = side_plane_y(lo), side_plane_y(hi)
    for s in (1, -1):
        def pt(x, z):
            y = side_plane_y(z) + 0.004
            return (x, s * y, z)
        outline = [(-0.24, lo), (1.2, lo), (0.86, hi), (-0.24, hi)]
        for pts, off, into in ((outline, 0.004, glass), (
                [(-0.27, lo - 0.03), (1.25, lo - 0.03), (0.88, hi + 0.03), (-0.27, hi + 0.03)], 0.002, seals)):
            b = bmesh.new()
            vs = [b.verts.new(pt(x, z)) for x, z in pts]
            for v in vs:
                v.co.y += s * off
            b.faces.new(vs)
            into.append(b)
    # Windscreen on the raked front of the cab.
    import mathutils
    top = mathutils.Vector((0.8, 0, ROOF))
    bot = mathutils.Vector((1.36, 0, 1.12))
    V = (top - bot).normalized()
    U = mathutils.Vector((0, 1, 0))
    n = U.cross(V).normalized()  # outward normal (points forward/up)
    L = (top - bot).length
    mid = (top + bot) / 2
    glass.append(panel(rounded_rect(2 * (W - 0.3), L - 0.14, 0.06), mid + n * 0.006, U, V))
    seals.append(panel(rounded_rect(2 * (W - 0.27), L - 0.08, 0.07), mid + n * 0.003, U, V))
    # Rear window.
    glass.append(panel(rounded_rect(1.1, 0.42, 0.07), (-0.385, 0, 1.44), (0, -1, 0), (0, 0, 1)))
    seals.append(panel(rounded_rect(1.16, 0.48, 0.08), (-0.382, 0, 1.44), (0, -1, 0), (0, 0, 1)))
    centre = (0.5, 0, 1.3)
    return lib.orient_outward(merge(*glass), centre), lib.orient_outward(merge(*seals), centre)


def wheel(x, y, mats, root, hub=None):
    """One wheel. With `hub` (an empty at the axle centre) the parts are children of it, so the
    game can steer and spin it; otherwise they're placed on the body."""
    s = 1 if y > 0 else -1
    w = 0.23
    prof = [(0.22, -w / 2), (0.3, -w / 2 - 0.012), (0.345, -w / 2 + 0.005), (0.36, -w / 2 + 0.03),
            (R_TYRE, -w / 2 + 0.05), (R_TYRE, w / 2 - 0.05), (0.36, w / 2 - 0.03), (0.345, w / 2 - 0.005),
            (0.3, w / 2 + 0.012), (0.22, w / 2)]
    tyre = [bm_lathe(prof, 48)]
    # Road tread: blocks around the crown.
    for i in range(36):
        a = 2 * math.pi * i / 36
        for k, yy in enumerate((-0.055, 0.055)):
            blk = bm_box((0.045, 0.085, 0.014), (0, yy, R_TYRE + 0.004))
            bmesh.ops.rotate(blk, cent=(0, 0, 0), matrix=Matrix.Rotation(a + k * math.pi / 36, 3, 'Y'), verts=blk.verts)
            tyre.append(blk)
    t = mesh_object('Tyre', merge(*tyre), mats['rubber'], hub or root)
    if not hub:
        bmesh_to_place(t, x, y)
    finish(t, 0, uv_scale=0.5, smooth_angle=50, dirt_range=(0.0, 0.7))
    # Pressed-steel wheel: dished disc, rim lips, five nuts and a chrome hub cap.
    rim_prof = [(0.23, s * 0.105), (0.24, s * 0.1), (0.225, s * 0.08), (0.215, s * 0.0), (0.18, s * 0.02),
                (0.13, s * 0.06), (0.1, s * 0.07), (0.0, s * 0.07)]
    rim = [bm_lathe(rim_prof, 40)]
    for k in range(5):
        a = 2 * math.pi * k / 5
        rim.append(bm_cylinder(0.014, 0.03, 'Y', 6, (math.cos(a) * 0.075, s * 0.08, math.sin(a) * 0.075)))
    r = mesh_object('Rim', merge(*rim), mats['rim'], hub or root)
    if not hub:
        bmesh_to_place(r, x, y)
    finish(r, 0.004, uv_scale=0.5, smooth_angle=40, dirt_range=(0.0, 0.7))
    cap = bm_lathe([(0.06, s * 0.08), (0.055, s * 0.1), (0.035, s * 0.115), (0.0, s * 0.12)], 24)
    c = mesh_object('HubCap', cap, mats['chrome'], hub or root)
    if not hub:
        bmesh_to_place(c, x, y)
    c.data.shade_smooth()


def bmesh_to_place(obj, x, y):
    obj.location = (x, y, ARCH_Z - 0.04)


def build(drivable=False):
    """The pickup. `drivable` makes the version the game drives: wheels on their own nodes
    (Wheel0..3: front-left, front-right, rear-left, rear-right), the tailgate on a hinge
    (TailgatePivot, turns about Y), a dashboard and steering wheel inside, and the bed left
    empty for loads."""
    root = empty('Pickup')
    mats = {
        'paint': material('PickupPaint', (0.2, 0.34, 0.44), 'paint_worn', tex.paint_worn, roughness=0.55, metallic=0.15),
        'faded': material('PickupFaded', (0.28, 0.4, 0.48), 'paint_worn', tex.paint_worn, roughness=0.7, metallic=0.1),
        'rust': material('PickupRust', (1, 1, 1), 'rust', tex.rust, roughness=0.85, metallic=0.2),
        'rim': material('RimPaint', (0.8, 0.8, 0.76), 'paint_worn', tex.paint_worn, roughness=0.5, metallic=0.3),
        'steel': material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7),
        'chrome': material('Chrome', (0.8, 0.8, 0.8), roughness=0.18, metallic=1.0, vertex_color=False),
        'rubber': material('Rubber', (1, 1, 1), 'rubber', tex.rubber, 512, roughness=0.9),
        'glass': material('Glass', (0.02, 0.025, 0.03), roughness=0.05, metallic=0.6, vertex_color=False),
        'black': material('Black', (0.015, 0.015, 0.016), roughness=0.75, vertex_color=False),
        'lamp': material('Lamp', (0.9, 0.9, 0.85), roughness=0.08, metallic=0.2, vertex_color=False),
        'tail': material('Tail', (0.55, 0.03, 0.02), roughness=0.15, vertex_color=False),
        'amber': material('Amber', (0.9, 0.45, 0.05), roughness=0.15, vertex_color=False),
        'box': material('Toolbox', (0.55, 0.06, 0.04), 'paint_worn', tex.paint_worn, roughness=0.5, metallic=0.3),
        'can': material('Jerrycan', (0.12, 0.22, 0.1), 'paint_worn', tex.paint_worn, roughness=0.6, metallic=0.3),
    }

    # ---- body panels
    body = mesh_object('Body', merge(front_body(), bed_body()), mats['paint'], root)
    finish(body, 0.012, 2, uv_scale=1.4, smooth_angle=40, dirt_range=(0.4, 0.95), dirt_color=RUST)
    cab = mesh_object('Cab', cab_body(), mats['faded'], root)
    finish(cab, 0.01, 2, uv_scale=1.4, smooth_angle=40, dirt_range=(0.9, 1.4))

    # Arch lips: a rolled flare round each wheel opening, both sides.
    flares = []
    for cx in (-WB, WB):
        for s in (1, -1):
            pts_o = [(cx + math.cos(a) * (ARCH_R + 0.05), ARCH_Z + math.sin(a) * (ARCH_R + 0.05))
                     for a in [math.radians(4 + i * 172 / 20) for i in range(21)]]
            pts_i = [(cx + math.cos(a) * ARCH_R, ARCH_Z + math.sin(a) * ARCH_R)
                     for a in [math.radians(176 - i * 172 / 20) for i in range(21)]]
            flares.append(lib.bm_profile(pts_o + pts_i, 0.05, 'Y', s * (W - 0.005)))
    fl = mesh_object('ArchFlares', merge(*flares), mats['paint'], root)
    finish(fl, 0.012, 2, uv_scale=1.0, smooth_angle=40, dirt_range=(0.4, 1.0), dirt_color=RUST)

    # Wheel-well liners so you can't see through the arches.
    liners = []
    for cx in (-WB, WB):
        pts = [(cx + math.cos(a) * (ARCH_R - 0.01), ARCH_Z + math.sin(a) * (ARCH_R - 0.01))
               for a in [math.radians(i * 180 / 16) for i in range(17)]]
        pts += [(cx + math.cos(a) * (ARCH_R - 0.04), ARCH_Z + math.sin(a) * (ARCH_R - 0.04))
                for a in [math.radians(180 - i * 180 / 16) for i in range(17)]]
        liners.append(lib.bm_profile(pts, 2 * W - 0.04, 'Y'))
        liners.append(bm_box((2 * ARCH_R, 0.04, 0.5), (cx, 0.62, 0.62)))
        liners.append(bm_box((2 * ARCH_R, 0.04, 0.5), (cx, -0.62, 0.62)))
    lin = mesh_object('WheelWells', merge(*liners), mats['black'], root)
    finish(lin, 0, dirt=False)

    # ---- bed: walls, floor, tailgate
    walls = []
    for s in (1, -1):
        walls.append(bm_box((2.26, 0.05, 0.26), (-1.49, s * (W - 0.025), 0.97)))
        walls.append(bm_box((2.28, 0.1, 0.04), (-1.49, s * (W - 0.05), 1.1)))  # top cap
    walls.append(bm_box((0.05, 2 * W, 0.28), (-0.39, 0, 0.97)))
    walls.append(bm_box((0.1, 2 * W, 0.04), (-0.4, 0, 1.1)))
    wl = mesh_object('BedWalls', merge(*walls), mats['paint'], root)
    finish(wl, 0.015, 2, uv_scale=1.4, dirt_range=(0.6, 1.1), dirt_color=RUST)
    floor = [bm_box((2.2, 2 * W - 0.12, 0.02), (-1.49, 0, 0.845))]
    for k in range(7):  # ribbed floor
        floor.append(bm_box((2.2, 0.035, 0.02), (-1.49, -0.66 + k * 0.22, 0.86)))
    fl2 = mesh_object('BedFloor', merge(*floor), mats['rust'], root)
    finish(fl2, 0.004, uv_scale=0.8, dirt=False)
    tg = merge(bm_box((0.05, 2 * W - 0.02, 0.5), (-2.64, 0, 0.84)),
               bm_box((0.02, 0.3, 0.06), (-2.67, 0, 1.0)))  # handle recess
    bmesh.ops.rotate(tg, cent=(-2.64, 0, 0.6), matrix=Matrix.Rotation(math.radians(-5), 3, 'Y'), verts=tg.verts)
    if drivable:
        hinge = (-2.665, 0.0, 0.6)
        bmesh.ops.translate(tg, vec=(-hinge[0], 0, -hinge[2]), verts=tg.verts)
        pivot = empty('TailgatePivot', hinge, root)
        t = mesh_object('Tailgate', tg, mats['paint'], pivot)
    else:
        t = mesh_object('Tailgate', tg, mats['paint'], root)
    finish(t, 0.012, 2, uv_scale=1.2, dirt_range=(0.5, 1.2), dirt_color=RUST)

    # ---- glass and seals
    glass, seals = glass_parts()
    g = mesh_object('Glass', glass, mats['glass'], root)
    lib.box_uv(g)
    se = mesh_object('Seals', seals, mats['black'], root)
    lib.box_uv(se)

    # ---- front: grille, lamps, bumper
    front = []
    front.append(bm_box((0.04, 1.12, 0.26), (2.69, 0, 0.8)))  # grille back
    fr = mesh_object('GrilleBack', merge(*front), mats['black'], root)
    finish(fr, 0.005, dirt=False)
    chrome = []
    for z in (0.7, 0.76, 0.82, 0.88):
        chrome.append(bm_box((0.03, 1.1, 0.018), (2.71, 0, z)))
    for y in (-0.56, 0.56):
        chrome.append(bm_box((0.035, 0.03, 0.29), (2.71, y, 0.8)))
    chrome += [bm_box((0.035, 1.15, 0.03), (2.71, 0, z)) for z in (0.655, 0.945)]
    for s in (1, -1):  # headlamp bezels
        chrome.append(bm_torus(0.085, 0.014, 'X', 24, 8, (2.7, s * 0.71, 0.82)))
    # Front bumper with wrap-round ends, rear step bumper.
    chrome.append(bm_box((0.11, 1.7, 0.15), (2.78, 0, 0.5)))
    for s in (1, -1):
        end = bm_box((0.3, 0.1, 0.15), (0, 0, 0))
        bmesh.ops.rotate(end, cent=(0, 0, 0), matrix=Matrix.Rotation(s * math.radians(-35), 3, 'Z'), verts=end.verts)
        bmesh.ops.translate(end, vec=(2.66, s * 0.9, 0.5), verts=end.verts)
        chrome.append(end)
    chrome.append(bm_box((0.1, 1.72, 0.14), (-2.74, 0, 0.5)))
    for s in (1, -1):  # mirror stalks and heads, door handles
        chrome.append(bm_cylinder(0.012, 0.2, 'Y', 8, (1.22, s * (W + 0.08), 1.12)))
        chrome.append(bm_cylinder(0.01, 0.2, 'Z', 8, (1.22, s * (W + 0.17), 1.2)))
        chrome.append(bm_box((0.03, 0.12, 0.17), (1.22, s * (W + 0.18), 1.32)))
        chrome.append(bm_box((0.14, 0.02, 0.03), (0.02, s * (W + 0.008), 0.99)))
    ch = mesh_object('Chrome', merge(*chrome), mats['chrome'], root)
    finish(ch, 0.012, 2, smooth_angle=40, dirt_range=(0.3, 1.0))
    lamps = [bm_lathe([(0.075, 0.0), (0.07, 0.02), (0.045, 0.035), (0.0, 0.04)], 24, 'X', (2.69, s * 0.71, 0.82))
             for s in (1, -1)]
    mesh_object('Headlamps', merge(*lamps), mats['lamp'], root).data.shade_smooth()
    ind = [bm_box((0.03, 0.14, 0.05), (2.7, s * 0.71, 0.66)) for s in (1, -1)]
    ind += [bm_box((0.05, 0.02, 0.04), (2.35, s * (W + 0.002), 0.83)) for s in (1, -1)]  # side markers
    it = mesh_object('Indicators', merge(*ind), mats['amber'], root)
    finish(it, 0.006, dirt=False)
    tails = [bm_box((0.03, 0.12, 0.2), (-2.625, s * (W - 0.07), 0.95)) for s in (1, -1)]
    tl = mesh_object('TailLights', merge(*tails), mats['tail'], root)
    finish(tl, 0.006, dirt=False)

    # ---- trim lines: door shut lines, bonnet gaps, wipers, bumper step
    trim = []
    for s in (1, -1):
        y = s * (W + 0.001)
        trim.append(bm_box((0.008, 0.004, 0.46), (-0.28, y, 0.8)))   # door rear
        trim.append(bm_box((0.008, 0.004, 0.46), (1.28, y, 0.8)))    # door front
        trim.append(bm_box((1.56, 0.004, 0.008), (0.5, y, 0.57)))    # door bottom
        trim.append(bm_box((1.25, 0.008, 0.004), (2.0, s * 0.64, BELT + 0.02 - 0.65 * 0.055 + 0.004)))  # bonnet
        trim.append(bm_box((0.012, 0.012, 0.36), (0.95, s * (side_plane_y(1.45) + 0.006), 1.43)))  # vent window bar
    trim.append(bm_box((0.008, 1.3, 0.004), (2.62, 0, BELT + 0.02 - 1.27 * 0.055 + 0.002)))
    for s in (0.25, -0.35):  # wipers, parked
        wp = bm_box((0.012, 0.5, 0.012), (1.33, s, 1.15))
        trim.append(wp)
    trim.append(bm_box((0.2, 0.5, 0.02), (-2.74, 0, 0.58)))  # step pad on the rear bumper
    tr = mesh_object('Trim', merge(*trim), mats['black'], root)
    finish(tr, 0, dirt=False)

    # ---- under: chassis rails, axles, exhaust, tank
    under = [bm_box((5.0, 0.08, 0.14), (0, s * 0.45, 0.42)) for s in (1, -1)]
    under += [bm_cylinder(0.05, 1.6, 'Y', 10, (x, 0, ARCH_Z - 0.04)) for x in (-WB, WB)]
    under.append(bm_cylinder(0.12, 0.2, 'Y', 16, (-WB, 0, ARCH_Z - 0.04)))  # diff
    under.append(bm_cylinder(0.14, 0.7, 'Y', 16, (-0.6, -0.35, 0.42)))  # fuel tank
    under.append(bm_cylinder(0.03, 3.4, 'X', 8, (-0.9, 0.3, 0.3)))  # exhaust
    ud = mesh_object('Chassis', merge(*under), mats['steel'], root)
    finish(ud, 0.006, dirt_range=(0.0, 0.6))

    # ---- odds and ends in the bed: a toolbox and a jerrycan
    tb = mesh_object('Toolbox', merge(bm_box((0.28, 1.2, 0.26), (-0.58, 0, 1.0)),
                                      bm_box((0.3, 1.22, 0.03), (-0.58, 0, 1.14))), mats['box'], root)
    finish(tb, 0.01, 2, uv_scale=0.8, dirt_range=(0.8, 1.2))
    jc = bm_box((0.34, 0.16, 0.46), (-2.2, 0.55, 1.08))
    bmesh.ops.rotate(jc, cent=(-2.2, 0.55, 0.85), matrix=Matrix.Rotation(0.3, 3, 'Z'), verts=jc.verts)
    if not drivable:  # the drivable one keeps its bed clear for loads
        j = mesh_object('Jerrycan', merge(jc, bm_box((0.06, 0.12, 0.04), (-2.1, 0.55, 1.33))), mats['can'], root)
        finish(j, 0.02, 2, uv_scale=0.6, dirt_range=(0.8, 1.3))
    else:
        jc.free()
        interior(mats, root)
    ant = mesh_object('Aerial', bm_cylinder(0.005, 0.9, 'Z', 6, (2.1, W - 0.12, 1.45)), mats['chrome'], root)
    ant.data.shade_smooth()

    # ---- wheels
    if drivable:
        for i, (x, y) in enumerate([(WB, W - 0.14), (WB, -(W - 0.14)), (-WB, W - 0.14), (-WB, -(W - 0.14))]):
            wheel(x, y, mats, root, empty(f'Wheel{i}', (x, y, ARCH_Z - 0.04), root))
    else:
        for x in (-WB, WB):
            for y in (-(W - 0.14), W - 0.14):
                wheel(x, y, mats, root)
    return root


def interior(mats, root):
    """What you see from the driver's seat (left-hand drive, like the truck): a painted-metal
    dashboard with dials, a thin-rimmed steering wheel and a bench seat."""
    group = empty('Interior', (0, 0, 0), root)
    dash = [bm_box((0.3, 1.5, 0.25), (1.18, 0, 0.97)), bm_box((0.08, 1.5, 0.05), (1.1, 0, 1.11))]
    d = mesh_object('Dash', merge(*dash), mats['paint'], group)
    finish(d, 0.02, 2, uv_scale=1.0, dirt=False)
    dials = [bm_cylinder(0.06, 0.02, 'X', 20, (1.025, 0.45 + dy, 1.0)) for dy in (-0.08, 0.08)]
    di = mesh_object('Dials', merge(*dials), mats['black'], group)
    finish(di, 0, dirt=False)
    col = bm_cylinder(0.03, 0.42, 'X', 10, (1.05, 0.45, 0.98))
    bmesh.ops.rotate(col, cent=(1.2, 0.45, 1.0), matrix=Matrix.Rotation(math.radians(-28), 3, 'Y'), verts=col.verts)
    rim = bm_torus(0.19, 0.014, 'X', 32, 8, (0.9, 0.45, 1.12))
    bmesh.ops.rotate(rim, cent=(0.9, 0.45, 1.12), matrix=Matrix.Rotation(math.radians(-28), 3, 'Y'), verts=rim.verts)
    spokes = [bm_box((0.02, 0.36, 0.025), (0.9, 0.45, 1.12)), bm_box((0.02, 0.025, 0.2), (0.9, 0.45, 1.05))]
    for sp in spokes:
        bmesh.ops.rotate(sp, cent=(0.9, 0.45, 1.12), matrix=Matrix.Rotation(math.radians(-28), 3, 'Y'), verts=sp.verts)
    sw = mesh_object('SteeringWheel', merge(col, rim, *spokes), mats['black'], group)
    finish(sw, 0, smooth_angle=50, dirt=False)
    seat = [lib.rounded_box((0.5, 1.5, 0.18), (0.15, 0, 0.72), 0.06), lib.rounded_box((0.16, 1.5, 0.55), (-0.13, 0, 1.0), 0.06)]
    st = mesh_object('Seat', merge(*seat), mats['black'], group)
    finish(st, 0, smooth_angle=50, dirt=False)


PREVIEW = dict(target=(0, 0, 0.8), distance=7.5, angle=-35, elevation=14)

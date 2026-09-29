"""Hand tools: a builder's wheelbarrow and a round-point shovel.

Wheelbarrow: X forward (the wheel end), Y left, Z up. The origin is on the ground between the
wheel and the legs, so it stands where it's put. `Wheel` is an empty at the axle (the game
spins it about the axle); the load heap is added by the game.
Shovel: the origin is at the D-grip and the shaft runs along +X to the blade, scoop side up
(+Z). `Blade` is an empty at the middle of the blade (where the game puts the shovelful)."""
import math
import bmesh
from mathutils import Matrix, Vector
import lib
import textures as tex
from lib import bm_box, bm_cylinder, bm_lathe, merge, mesh_object, empty, finish, material

AXLE = (0.56, 0.0, 0.19)  # wheel centre
TYRE_R = 0.19


# ---------------------------------------------------------------- helpers

def catmull(points, per_segment=6):
    """A smooth path through the given points (Catmull-Rom)."""
    P = [Vector(p) for p in points]
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for s in range(per_segment):
            t = s / per_segment
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def tube(path, radius, segments=10, closed=False, radius_end=None):
    """A round tube along a path of points (parallel-transported frame, so it doesn't twist)."""
    bm = bmesh.new()
    pts = [Vector(p) for p in path]
    n = len(pts)
    rings = []
    normal = None
    for i, p in enumerate(pts):
        if closed:
            t = (pts[(i + 1) % n] - pts[(i - 1) % n]).normalized()
        else:
            t = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        if normal is None:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            normal = t.cross(up).normalized()
        else:
            normal = (normal - t * normal.dot(t)).normalized()
        binormal = t.cross(normal).normalized()
        r = radius if radius_end is None else radius + (radius_end - radius) * i / max(1, n - 1)
        rings.append([bm.verts.new(p + (normal * math.cos(2 * math.pi * j / segments)
                                        + binormal * math.sin(2 * math.pi * j / segments)) * r) for j in range(segments)])
    for i in range(n if closed else n - 1):
        a, b = rings[i], rings[(i + 1) % n]
        for j in range(segments):
            k = (j + 1) % segments
            bm.faces.new([a[j], a[k], b[k], b[j]])
    if not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def solidify(obj, thickness):
    m = obj.modifiers.new('Solidify', 'SOLIDIFY')
    m.thickness = thickness
    m.offset = -1  # grow inwards from the outer surface
    m.use_even_offset = True
    return obj


# ---------------------------------------------------------------- wheelbarrow

def tray_ring(t):
    """Plan-view ring of the tray at height fraction t (0 = floor, 1 = rim)."""
    e = 1 - (1 - t) ** 1.35  # walls flare out quickly off the floor, then run straight
    x0 = -0.2 + (-0.36 + 0.2) * e
    x1 = 0.26 + (0.62 - 0.26) * e ** 0.8  # the front slopes well forward (for tipping)
    hw = 0.2 + (0.34 - 0.2) * e
    r = 0.09 + 0.06 * t
    return lib.plan_rect(x0, x1, hw, r, 5)


TRAY_Z0, TRAY_Z1 = 0.35, 0.64


def wheelbarrow():
    root = empty('Wheelbarrow')
    paint = material('BarrowPaint', (0.07, 0.24, 0.1), 'paint_worn', tex.paint_worn, roughness=0.5, metallic=0.3)
    frame_paint = material('FramePaint', (0.05, 0.05, 0.05), 'paint_worn', tex.paint_worn, roughness=0.55, metallic=0.3)
    steel = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    rubber = material('Rubber', (1, 1, 1), 'rubber', tex.rubber, 512, roughness=0.9)
    grip_mat = material('Grip', (0.03, 0.03, 0.03), roughness=0.85, vertex_color=False)

    # The pressed steel tray: an open bowl lofted from plan rings, given a thickness, with a
    # rolled rim round the top.
    ts = [0.0, 0.03, 0.08, 0.16, 0.3, 0.5, 0.75, 1.0]
    rings = []
    for t in ts:
        ring = tray_ring(t)
        if t == 0.0:  # a smaller floor ring gives the floor a rounded edge
            cx = sum(p[0] for p in ring) / len(ring)
            ring = [(cx + (x - cx) * 0.9, y * 0.86) for x, y in ring]
        rings.append((TRAY_Z0 + (TRAY_Z1 - TRAY_Z0) * t, ring))
    tray = lib.loft_z(rings, cap_bottom=True, cap_top=False)
    lib.orient_outward(tray, (0.15, 0, 0.55))
    tr = mesh_object('Tray', tray, paint, root)
    solidify(tr, 0.006)
    finish(tr, 0, uv_scale=0.8, smooth_angle=60, dirt_range=(0.2, 0.8))
    rim_pts = [(x, y, TRAY_Z1 + 0.004) for x, y in tray_ring(1.0)]
    rim = mesh_object('Rim', tube(rim_pts, 0.011, 8, closed=True), paint, root)
    finish(rim, 0, smooth_angle=60, dirt_range=(0.2, 0.8))

    # Tubular frame: two handles from the wheel fork, under the tray, out to the grips.
    frame = []
    for s in (-1, 1):
        path = catmull([(AXLE[0] + 0.005, s * 0.058, AXLE[2]), (0.46, s * 0.075, 0.29), (0.3, s * 0.13, 0.335),
                        (0.0, s * 0.19, 0.345), (-0.36, s * 0.245, 0.4), (-0.66, s * 0.275, 0.465),
                        (-0.98, s * 0.29, 0.53)], 5)
        frame.append(tube(path, 0.017, 10))
        # Leg: down from the frame to a small foot.
        frame.append(tube(catmull([(-0.14, s * 0.19, 0.345), (-0.22, s * 0.215, 0.18), (-0.27, s * 0.235, 0.035),
                                   (-0.35, s * 0.24, 0.02)], 4), 0.014, 8))
        frame.append(bm_box((0.1, 0.05, 0.035), (0.22, s * 0.15, 0.335)))  # tray bracket
        frame.append(bm_box((0.1, 0.05, 0.035), (-0.12, s * 0.2, 0.345)))
    frame.append(tube([(-0.2, -0.205, 0.33), (-0.2, 0.205, 0.33)], 0.012, 8))  # cross stays
    frame.append(tube([(0.3, -0.13, 0.33), (0.3, 0.13, 0.33)], 0.012, 8))
    frame.append(tube([(-0.25, -0.23, 0.08), (-0.25, 0.23, 0.08)], 0.01, 8))  # leg brace
    f = mesh_object('Frame', merge(*frame), frame_paint, root)
    finish(f, 0, smooth_angle=50, dirt_range=(0.0, 0.6))
    grips = [tube([(-0.84, s * 0.285, 0.502), (-1.0, s * 0.291, 0.536)], 0.021, 12) for s in (-1, 1)]
    g = mesh_object('Grips', merge(*grips), grip_mat, root)
    lib.smooth(g, 60)

    # Wheel: a knobbly pneumatic tyre on a steel rim, turning on an axle through the fork.
    wheel = empty('Wheel', AXLE, root)
    prof = [(0.1, -0.034), (0.135, -0.042), (0.168, -0.041), (0.184, -0.03), (TYRE_R - 0.004, -0.012),
            (TYRE_R - 0.004, 0.012), (0.184, 0.03), (0.168, 0.041), (0.135, 0.042), (0.1, 0.034)]
    tyre = [bm_lathe(prof, 36, 'Y')]
    for i in range(24):
        a = 2 * math.pi * i / 24
        for side in (-1, 1):
            lug = bm_box((0.028, 0.03, 0.012), (0, 0, 0))
            bmesh.ops.translate(lug, vec=(0, side * 0.018, TYRE_R - 0.002), verts=lug.verts)
            bmesh.ops.rotate(lug, cent=(0, 0, 0), matrix=Matrix.Rotation(a + side * 0.13, 3, 'Y'),
                             verts=lug.verts)
            tyre.append(lug)
    t = mesh_object('Tyre', merge(*tyre), rubber, wheel)
    finish(t, 0, uv_scale=0.4, smooth_angle=45, dirt_range=(-0.19, 0.1))
    hub = merge(bm_lathe([(0.101, -0.03), (0.09, -0.022), (0.035, -0.028), (0.03, -0.045), (0.0, -0.045)], 24, 'Y'),
                bm_lathe([(0.0, 0.045), (0.03, 0.045), (0.035, 0.028), (0.09, 0.022), (0.101, 0.03)], 24, 'Y'),
                bm_cylinder(0.095, 0.05, 'Y', 24))
    h = mesh_object('Hub', hub, steel, wheel)
    finish(h, 0, smooth_angle=45, dirt_range=(-0.19, 0.1))
    axle = mesh_object('Axle', merge(bm_cylinder(0.011, 0.15, 'Y', 10, AXLE),
                                     bm_cylinder(0.02, 0.012, 'Y', 12, (AXLE[0], 0.07, AXLE[2])),
                                     bm_cylinder(0.02, 0.012, 'Y', 12, (AXLE[0], -0.07, AXLE[2]))), steel, root)
    finish(axle, 0, dirt_range=(0, 0.6))
    return root


# ---------------------------------------------------------------- shovel

def blade_mesh():
    """Round-point blade: dished across, tilted down from the socket, with a turned-over
    tread along the back edge. Points are in blade space (u along, v across)."""
    bm = bmesh.new()
    nu, nv = 14, 12
    L, W = 0.3, 0.135
    lift = math.radians(14)
    grid = []
    for i in range(nu + 1):
        u = i / nu
        half = W if u < 0.55 else W * math.sqrt(max(0.0, 1 - ((u - 0.55) / 0.45) ** 2.2))
        half = max(half, 0.004)
        row = []
        for j in range(nv + 1):
            v = -1 + 2 * j / nv
            x = u * L
            y = v * half
            z = 0.034 * v * v * (1 - 0.4 * u) - x * math.sin(lift)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for i in range(nu):
        for j in range(nv):
            bm.faces.new([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return bm


def shovel():
    root = empty('Shovel')
    steel = material('BladeSteel', (0.85, 0.84, 0.8), 'metal_grime', tex.metal_grime, 512, roughness=0.5, metallic=0.6,
                     vertex_color=False)
    paint = material('BladePaint', (0.08, 0.08, 0.09), 'paint_worn', tex.paint_worn, roughness=0.6, metallic=0.4,
                     vertex_color=False)
    wood = material('Ash', (0.95, 0.72, 0.45), 'wood', tex.wood, 512, roughness=0.65, vertex_color=False)
    grip_mat = material('GripPlastic', (0.12, 0.12, 0.12), 'plastic', tex.plastic, 256, roughness=0.6, vertex_color=False)

    # D-grip: a crossbar and a yoke down to the shaft.
    d = catmull([(0.13, 0.0, 0.0), (0.085, 0.052, 0.0), (0.02, 0.062, 0.0), (-0.012, 0.035, 0.0), (-0.015, 0.0, 0.0),
                 (-0.012, -0.035, 0.0), (0.02, -0.062, 0.0), (0.085, -0.052, 0.0), (0.13, 0.0, 0.0)], 5)
    grip = merge(tube(d[:-1], 0.014, 10, closed=True), bm_cylinder(0.02, 0.06, 'X', 14, (0.14, 0, 0)))
    g = mesh_object('Grip', grip, grip_mat, root)
    finish(g, 0, smooth_angle=60, dirt=False)
    shaft = mesh_object('Shaft', bm_cylinder(0.018, 0.84, 'X', 16, (0.58, 0, 0)), wood, root)
    finish(shaft, 0, uv_scale=0.5, smooth_angle=60, dirt=False)
    sock = mesh_object('Socket', merge(bm_cylinder(0.021, 0.18, 'X', 16, (1.02, 0, 0), radius2=0.028),
                                       bm_cylinder(0.02, 0.02, 'X', 12, (0.94, 0, 0))), paint, root)
    finish(sock, 0, smooth_angle=50, dirt=False)

    blade = empty('Blade', (1.26, 0.0, -0.035), root)
    b = blade_mesh()
    bmesh.ops.translate(b, vec=(-0.15, 0, 0.035), verts=b.verts)
    bo = mesh_object('BladeSteel', b, steel, blade)
    solidify(bo, 0.003)
    finish(bo, 0, uv_scale=0.4, smooth_angle=60, dirt=False)
    tread = mesh_object('Tread', merge(*[tube([(-0.148, s * 0.125, 0.06), (-0.148, s * 0.02, 0.05)], 0.006, 6)
                                         for s in (-1, 1)]), steel, blade)
    finish(tread, 0, dirt=False)
    return root


PARTS = {
    'wheelbarrow': wheelbarrow,
    'shovel': shovel,
}

PREVIEWS = {
    'wheelbarrow': dict(target=(0.0, 0, 0.35), distance=2.6, angle=-40, elevation=24, samples=32),
    'shovel': dict(target=(0.65, 0, 0.05), distance=1.9, angle=-65, elevation=35, samples=32, ground_z=-0.075),
}

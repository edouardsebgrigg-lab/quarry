"""Small modelling helpers on top of Blender's Python API (bpy/bmesh).
Units are metres. Blender axes: X forward, Y left, Z up. The glTF export turns Z-up into Y-up,
so in the game (Three.js) X stays forward, Y is up and Blender +Y becomes -Z."""
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

import textures as tex

HERE = os.path.dirname(os.path.abspath(__file__))
TEX_DIR = os.path.join(HERE, 'build', 'textures')


# ---------------------------------------------------------------- scene

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name, loc=(0, 0, 0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    return link(e, parent)


def mesh_object(name, bm, mat=None, parent=None, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    obj.location = loc
    if mat:
        me.materials.append(mat)
    return link(obj, parent)


# ---------------------------------------------------------------- mesh builders (return bmesh)

def bm_box(size, center=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm


def bm_cylinder(radius, depth, axis='Z', segments=24, center=(0, 0, 0), radius2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius,
                          radius2=radius if radius2 is None else radius2, depth=depth)
    rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'Z': Matrix()}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm


def bm_profile(points, width, axis='Y', center=0.0):
    """Extrude a closed 2D polygon. For axis 'Y' the points are (x, z) and it is extruded
    along Y (centred on `center`); for 'X' points are (y, z); for 'Z' points are (x, y)."""
    bm = bmesh.new()
    def v3(p, d):
        a, b = p
        if axis == 'Y':
            return (a, center + d, b)
        if axis == 'X':
            return (center + d, a, b)
        return (a, b, center + d)
    front = [bm.verts.new(v3(p, -width / 2)) for p in points]
    back = [bm.verts.new(v3(p, width / 2)) for p in points]
    n = len(points)
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([front[i], back[i], back[j], front[j]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_torus(major, minor, axis='Y', seg_major=32, seg_minor=12, center=(0, 0, 0)):
    bm = bmesh.new()
    verts = []
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        ring = []
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            r = major + minor * math.cos(b)
            p = Vector((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
            ring.append(bm.verts.new(p))
        verts.append(ring)
    for i in range(seg_major):
        for j in range(seg_minor):
            a = verts[i][j]
            b = verts[(i + 1) % seg_major][j]
            c = verts[(i + 1) % seg_major][(j + 1) % seg_minor]
            d = verts[i][(j + 1) % seg_minor]
            bm.faces.new([a, b, c, d])
    rot = {'X': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'Y': Matrix.Rotation(math.pi / 2, 4, 'X'), 'Z': Matrix()}[axis]
    bmesh.ops.transform(bm, matrix=rot, verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def bm_lathe(profile, segments=32, axis='Y', center=(0, 0, 0)):
    """Spin a profile [(radius, along_axis), ...] (open, listed outside-in) around an axis."""
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = []
        for r, h in profile:
            if axis == 'Y':
                p = (r * math.cos(a), h, r * math.sin(a))
            elif axis == 'X':
                p = (h, r * math.cos(a), r * math.sin(a))
            else:
                p = (r * math.cos(a), r * math.sin(a), h)
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(segments):
        a, b = rings[i], rings[(i + 1) % segments]
        for j in range(len(profile) - 1):
            bm.faces.new([a[j], b[j], b[j + 1], a[j + 1]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm


def section(wb, wt, zb, zt, rb=0.05, rt=0.08, corner=5, flat=3, side=3):
    """Closed cross-section (y, z) of a body panel: a rounded rectangle whose sides lean in
    from half-width `wb` at the bottom to `wt` at the top (tumblehome). Always returns the
    same number of points, so sections can be lofted together."""
    h = max(zt - zb, 1e-3)
    rb = min(rb, h * 0.45, wb * 0.45)
    rt = min(rt, h * 0.45, wt * 0.45)
    right = []
    for i in range(flat):  # bottom, centre -> corner
        right.append(((wb - rb) * i / flat, zb))
    for i in range(corner):  # bottom corner
        a = -math.pi / 2 + (math.pi / 2) * i / corner
        right.append((wb - rb + math.cos(a) * rb, zb + rb + math.sin(a) * rb))
    for i in range(side):  # side, leaning in
        t = i / side
        right.append((wb + (wt - wb) * t, zb + rb + (zt - rt - zb - rb) * t))
    for i in range(corner):  # top corner
        a = (math.pi / 2) * i / corner
        right.append((wt - rt + math.cos(a) * rt, zt - rt + math.sin(a) * rt))
    for i in range(flat):  # top, corner -> centre
        right.append(((wt - rt) * (1 - i / flat), zt))
    left = [(-y, z) for y, z in reversed(right[1:])]  # mirror, skipping the shared bottom centre
    return right + [(0.0, zt)] + left


def loft(stations, cap_start=True, cap_end=True):
    """Skin a list of (x, [(y, z), ...]) cross-sections into a closed body."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for y, z in sec] for x, sec in stations]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new([a[j], a[k], b[k], b[j]])
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def rounded_rect(w, h, r, steps=4):
    """Points of a rounded rectangle centred on (0, 0) in 2D (u, v)."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(steps + 1):
            a = math.radians(a0 + 90 * i / steps)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def panel(points2d, origin, u_axis, v_axis, thickness=0.0):
    """A flat polygon (e.g. a window) placed in 3D: point (u, v) goes to origin + u*U + v*V.
    With a thickness it becomes a thin slab, extruded along the face normal."""
    O, U, V = Vector(origin), Vector(u_axis), Vector(v_axis)
    bm = bmesh.new()
    front = [bm.verts.new(O + U * u + V * v) for u, v in points2d]
    bm.faces.new(front)
    if thickness:
        N = U.cross(V).normalized() * -thickness
        back = [bm.verts.new(v.co + N) for v in front]
        bm.faces.new(list(reversed(back)))
        n = len(front)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([front[j], front[i], back[i], back[j]])
    if thickness:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    else:  # single face: make it face along U x V
        bm.normal_update()
        bm.faces.ensure_lookup_table()
        f = bm.faces[0]
        if f.normal.dot(U.cross(V)) < 0:
            f.normal_flip()
    return bm


def plan_rect(x0, x1, w, r, steps=4):
    """Rounded rectangle in plan (x from x0 to x1, y from -w to w), constant point count."""
    cx, cy = (x0 + x1) / 2, 0.0
    return [(cx + u, cy + v) for u, v in rounded_rect(x1 - x0, 2 * w, r, steps)]


def loft_z(stations, cap_bottom=True, cap_top=True):
    """Skin horizontal rings [(z, [(x, y), ...]), ...] (bottom to top) into a closed body."""
    bm = bmesh.new()
    rings = [[bm.verts.new((x, y, z)) for x, y in ring] for z, ring in stations]
    n = len(rings[0])
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            k = (j + 1) % n
            bm.faces.new([a[j], a[k], b[k], b[j]])
    if cap_bottom:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def rounded_box(size, center=(0, 0, 0), r=0.05, segs=3):
    """A box with every edge rounded to radius r (a proper cast/pressed look, unlike a
    small bevel). Built as a plan-view loft, so it stays light."""
    sx, sy, sz = size
    r = min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sz / 2 - 1e-3)
    cx, cy, cz = center
    st = []
    for i in range(segs + 1):  # bottom rounding
        a = math.pi / 2 * i / segs
        inset = r * (1 - math.sin(a))
        z = cz - sz / 2 + r * (1 - math.cos(a))
        st.append((z, inset))
    for i in range(segs + 1):  # top rounding
        a = math.pi / 2 * i / segs
        inset = r * (1 - math.cos(a))
        z = cz + sz / 2 - r + r * math.sin(a)
        st.append((z, inset))
    rings = []
    for z, inset in st:
        rr = max(1e-3, r - inset)
        rings.append((z, [(cx + x, cy + y) for x, y in plan_rect(-sx / 2 + inset, sx / 2 - inset, sy / 2 - inset, rr, segs)]))
    return loft_z(rings)


def orient_outward(bm, center):
    """Make every face of a (single-sided) bmesh face away from `center`."""
    c = Vector(center)
    for f in bm.faces:
        if f.normal.dot(f.calc_center_median() - c) < 0:
            f.normal_flip()
    return bm


def merge(*bms):
    """Combine several bmeshes into one."""
    out = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new('tmp')
        b.to_mesh(me)
        b.free()
        out.from_mesh(me)
        bpy.data.meshes.remove(me)
    return out


# ---------------------------------------------------------------- finishing

def bevel(obj, width=0.02, segments=2, angle=35):
    m = obj.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = max(2, segments)
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle)
    m.profile = 0.6  # slightly fuller than a circle: reads as pressed/rolled metal
    m.harden_normals = True
    m.miter_outer = 'MITER_ARC'
    return obj


def weighted_normals(obj):
    """Big flat faces keep flat shading, small bevel faces take the curve: the classic
    'hard surface' look where edges catch the light without the panels looking bent."""
    m = obj.modifiers.new('WeightedNormal', 'WEIGHTED_NORMAL')
    m.keep_sharp = True
    m.weight = 50
    m.mode = 'FACE_AREA'
    return obj


def subdivide(obj, levels=2, crease_angle=None):
    """Smooth a low-poly cage into a rounded shape (Catmull-Clark). Edges sharper than
    `crease_angle` degrees are creased so they stay crisp."""
    if crease_angle is not None:
        me = obj.data
        attr = me.attributes.get('crease_edge') or me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
        bm = bmesh.new()
        bm.from_mesh(me)
        bm.edges.ensure_lookup_table()
        vals = []
        for e in bm.edges:
            sharp = len(e.link_faces) == 2 and math.degrees(e.calc_face_angle(0)) > crease_angle
            vals.append(0.85 if sharp else 0.0)
        bm.free()
        attr.data.foreach_set('value', vals)
    m = obj.modifiers.new('Subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return obj


def apply_modifiers(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    bpy.data.meshes.remove(old)


def smooth(obj, angle=35):
    me = obj.data
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(angle))


def box_uv(obj, scale=1.2):
    """World-scale box mapping: each face takes UVs from the plane it faces most.
    Keeps texture detail the same size on every part."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            loop[uv].uv = (u / scale, v / scale)
    bm.to_mesh(me)
    bm.free()


def grime(obj, low=-1.0, high=1.2, dark=(0.55, 0.47, 0.38), world_z_offset=0.0, amount=1.0):
    """Vertex colours that darken and brown the lower parts (mud, dust)."""
    me = obj.data
    attr = me.color_attributes.new(name='Color', type='BYTE_COLOR', domain='CORNER')
    mw = obj.matrix_world
    col = []
    rng = np.random.default_rng(len(me.vertices))
    for loop in me.loops:
        z = (mw @ me.vertices[loop.vertex_index].co).z + world_z_offset
        t = min(1.0, max(0.0, (z - low) / (high - low)))
        t = 1 - (1 - t) * amount
        jitter = 0.97 + 0.06 * rng.random()
        c = [min(1.0, (d + (1 - d) * t) * jitter) for d in dark]
        col.append((*c, 1.0))
    attr.data.foreach_set('color', [x for c in col for x in c])
    me.color_attributes.active_color = attr


def finish(obj, bevel_width=0.02, segments=2, uv_scale=1.2, smooth_angle=35, dirt=True, dirt_range=(-1.2, 1.0),
           weighted=True, dirt_color=(0.55, 0.47, 0.38)):
    """Bevel, shade and UV a part, then add grime. Modifiers already on the object (e.g. a
    subdivision from subdivide()) are applied first."""
    bpy.context.view_layer.update()
    if obj.modifiers:
        apply_modifiers(obj)
    smooth(obj, smooth_angle)
    if bevel_width:
        bevel(obj, bevel_width, segments, smooth_angle)
    if weighted:
        weighted_normals(obj)
    apply_modifiers(obj)
    box_uv(obj, uv_scale)
    if dirt:
        grime(obj, *dirt_range, dark=dirt_color)
    return obj


# ---------------------------------------------------------------- materials

_images = {}


def image(name, fn, size):
    """Generate (once) and save a texture, returning the Blender image."""
    if name in _images:
        return _images[name]
    os.makedirs(TEX_DIR, exist_ok=True)
    path = os.path.join(TEX_DIR, name + '.png')
    arr = fn(size)
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(np.flipud(arr).astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    _images[name] = img
    return img


def material(name, color=(1, 1, 1), tex_name=None, tex_fn=None, tex_size=1024, roughness=0.6,
             metallic=0.0, vertex_color=True, emission=None, alpha=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    base = None
    if tex_fn:
        node = nt.nodes.new('ShaderNodeTexImage')
        node.image = image(tex_name, tex_fn, tex_size)
        base = node.outputs['Color']
        if color != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(base, mix.inputs['A'])
            mix.inputs['B'].default_value = (*color, 1)
            base = mix.outputs['Result']
    if vertex_color:
        vc = nt.nodes.new('ShaderNodeVertexColor')
        vc.layer_name = 'Color'
        if base is None:
            mixv = nt.nodes.new('ShaderNodeMix')
            mixv.data_type = 'RGBA'
            mixv.blend_type = 'MULTIPLY'
            mixv.inputs['Factor'].default_value = 1.0
            mixv.inputs['A'].default_value = (*color, 1)
            nt.links.new(vc.outputs['Color'], mixv.inputs['B'])
        else:
            mixv = nt.nodes.new('ShaderNodeMix')
            mixv.data_type = 'RGBA'
            mixv.blend_type = 'MULTIPLY'
            mixv.inputs['Factor'].default_value = 1.0
            nt.links.new(base, mixv.inputs['A'])
            nt.links.new(vc.outputs['Color'], mixv.inputs['B'])
        base = mixv.outputs['Result']
    if base is not None:
        nt.links.new(base, bsdf.inputs['Base Color'])
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        mat.surface_render_method = 'BLENDED'
        mat.use_backface_culling = False  # glass: tinted from inside too
    else:
        mat.use_backface_culling = True
    return mat


def standard_materials(tier):
    """Materials shared by the machines. `tier` picks the paint: rusty or used (yellow)."""
    m = {}
    if tier == 'rusty':
        m['paint'] = material('Paint', (1, 1, 1), 'rust', tex.rust, roughness=0.8, metallic=0.2)
        m['paint2'] = material('PaintDark', (0.55, 0.5, 0.45), 'rust', tex.rust, roughness=0.85, metallic=0.2)
    else:
        m['paint'] = material('Paint', (0.9, 0.52, 0.02), 'paint_worn', tex.paint_worn, roughness=0.45)
        m['paint2'] = material('PaintDark', (0.16, 0.16, 0.16), 'paint_worn', tex.paint_worn, roughness=0.5)
    m['steel'] = material('Steel', (1, 1, 1), 'metal_grime', tex.metal_grime, 512, roughness=0.55, metallic=0.7)
    m['chrome'] = material('Chrome', (0.8, 0.8, 0.8), roughness=0.2, metallic=1.0, vertex_color=False)
    m['rubber'] = material('Rubber', (1, 1, 1), 'rubber', tex.rubber, 512, roughness=0.9)
    # Dark reflective glass, one-sided (faces point outward) so you can see out from inside.
    m['glass'] = material('Glass', (0.02, 0.025, 0.03), roughness=0.04, metallic=0.6, vertex_color=False)
    m['light'] = material('Headlight', (1, 0.97, 0.85), roughness=0.1, vertex_color=False, emission=(1, 0.95, 0.8))
    m['amber'] = material('Beacon', (1, 0.55, 0.05), roughness=0.2, vertex_color=False, emission=(1, 0.45, 0.02))
    m['red'] = material('TailLight', (0.7, 0.03, 0.02), roughness=0.2, vertex_color=False, emission=(0.6, 0.0, 0.0))
    m['black'] = material('Black', (0.012, 0.012, 0.013), roughness=0.9, vertex_color=False)
    m['seat'] = material('Seat', (0.04, 0.04, 0.045), roughness=0.95, vertex_color=False)
    return m


# ---------------------------------------------------------------- export & preview

def select_hierarchy(root):
    bpy.ops.object.select_all(action='DESELECT')
    def rec(o):
        o.select_set(True)
        for c in o.children:
            rec(c)
    rec(root)
    bpy.context.view_layer.objects.active = root


def export_glb(root, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    select_hierarchy(root)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True,
        export_apply=True, export_image_format='JPEG', export_jpeg_quality=85,
        export_vertex_color='ACTIVE', export_extras=False,
    )


def render_preview(path, target=(0, 0, 1), distance=11, angle=35, elevation=18, size=(900, 600), samples=48, ground_z=0.0):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = -1.6
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sun_elevation = math.radians(40)
    sky.sun_rotation = math.radians(200)
    world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 3.5
    sun.data.angle = math.radians(3)
    sun.rotation_euler = (math.radians(50), 0, math.radians(200))
    link(sun)
    ground = mesh_object('Ground', bm_box((60, 60, 0.02), (0, 0, -0.01)),
                         material('GroundMat', (0.45, 0.4, 0.33), 'concrete', tex.concrete, 512, 0.95, vertex_color=False))
    box_uv(ground, 3)
    ground.location.z = ground_z
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.lens = 40
    a = math.radians(angle)
    e = math.radians(elevation)
    t = Vector(target)
    cam.location = t + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * distance
    direction = t - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    link(cam)
    scene.camera = cam
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 85
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return ground

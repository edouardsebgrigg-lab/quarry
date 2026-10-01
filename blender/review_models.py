"""Standalone vehicle review assets. Never writes to the game's assets directory.

Blender 4.2+: blender -b --python blender/review_models.py -- --out /absolute/review pickup
The existing builders supply metre-scale geometry and rigs; this script adds review-only
materials, real window apertures and restrained mechanical details. No game integration.
"""
import argparse
import hashlib
import importlib
import json
import math
from pathlib import Path
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib
import textures

N = 256
CURRENT_TIER = 'rusty'
IMAGE_CACHE = {}
PAINT_NAMES = {'Paint', 'TractorPaint', 'PickupPaint', 'PickupFaded', 'Toolbox', 'TrailerPaint', 'BarrowPaint', 'Canopy'}
RUBBER_NAMES = {'Rubber', 'RubberTrack', 'GripRubber'}
ORIGINAL_MATERIAL = lib.material


def image(name, pixels, noncolor=False):
    if name in IMAGE_CACHE:
        return IMAGE_CACHE[name]
    h,w=pixels.shape[:2]
    im = bpy.data.images.new(name, w, h, alpha=True)
    if noncolor:
        im.colorspace_settings.name = 'Non-Color'
    im.pixels.foreach_set(np.asarray(pixels, dtype=np.float32).ravel())
    im.pack()
    IMAGE_CACHE[name] = im
    return im


def review_material(name, color, tex_name=None, tex_fn=None, tex_size=1024,
                    roughness=.7, metallic=0, vertex_color=True, emission=None, alpha=None):
    """Portable PBR images and vertex tint, rather than an unexportable procedural shader."""
    mat = ORIGINAL_MATERIAL(name, color, roughness=roughness, metallic=metallic,
                            vertex_color=False, emission=emission, alpha=alpha)
    mat.name = 'Review_' + name
    if name == 'Glass':
        p = mat.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (.32, .42, .47, .16)
        p.inputs['Alpha'].default_value = .16
        p.inputs['Roughness'].default_value = .11
        p.inputs['Metallic'].default_value = 0
        mat.surface_render_method = 'DITHERED'
        mat.use_backface_culling = False
        return mat
    if emission:
        return mat
    seed = int(hashlib.sha256(name.encode()).hexdigest()[:8], 16) % 10000
    noise = textures.fractal_noise(N, 2.0, seed)
    fine = textures.fractal_noise(N, 1.1, seed + 1)
    rgb = np.ones((N, N, 3)) * np.array(color)
    paint_color=None
    is_rubber = name in RUBBER_NAMES or 'rubber' in name.lower()
    is_paint = name in PAINT_NAMES or 'paint' in name.lower()
    if is_rubber:
        rgb = np.ones((N, N, 3)) * [.027, .029, .028]
        rgb *= (.87 + .26 * noise[..., None])
        roughness, metallic = .93, 0
    elif is_paint:
        rgb *= (.90 + .10 * noise[..., None])
        if CURRENT_TIER == 'rusty':
            rgb = rgb * .83 + np.mean(rgb, axis=2)[..., None] * .11
            patches=textures.smoothstep(.80,.89,noise)*.6
            rgb=textures.lerp(rgb,np.array([.22,.09,.035]),patches)
            roughness = max(.68, roughness)
        else:
            roughness = min(.52, roughness)
        paint_color=np.mean(rgb,axis=(0,1))
        # Store paint and chip colour per corner, so orange rust isn't multiplied by blue
        # paint. The image remains a neutral surface variation beneath that vertex colour.
        rgb=np.ones((N,N,3))*(.9+.1*noise[...,None])
    elif name in {'Steel', 'WornSteel', 'Chassis', 'Frame', 'Castings'}:
        rgb = np.ones((N, N, 3)) * [.13, .145, .15]
        rgb *= (.8 + .3 * noise[..., None])
        roughness, metallic = .58, .7
    elif name in {'Chrome', 'RimPaint', 'Rims'}:
        rgb = np.ones((N, N, 3)) * [.42, .43, .4]
        rgb *= (.9 + .12 * noise[..., None])
        roughness, metallic = .35, .65
    elif name in {'PickupRust', 'BedSteel', 'Rust'}:
        rust = textures.smoothstep(.63, .85, noise)
        rgb = textures.lerp([.19, .21, .20], [.24, .10, .045], rust[..., None])
        roughness, metallic = .78, .5
    elif name in {'Black', 'Seat', 'SealRubber'}:
        rgb = np.ones((N, N, 3)) * ([.024, .026, .028] if name != 'Seat' else [.036, .031, .027])
        rgb *= (.9 + .15 * noise[..., None])
    base = np.ones((N, N, 4))
    # Blender's byte image buffer / glTF colour textures are sRGB; inputs above are linear.
    rgb=np.clip(rgb,0,1)
    base[..., :3]=np.where(rgb<=.0031308,rgb*12.92,1.055*np.power(rgb,1/2.4)-.055)
    orm = np.ones((N, N, 4)); orm[..., 1] = np.clip(roughness + (noise - .5) * .11, .05, 1); orm[..., 2] = metallic
    # Subtle tileable surface normals: orange peel and rubber grain, no baked lighting.
    height = fine * (.013 if is_rubber else .004)
    dx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * N
    dy = (np.roll(height, -1, 0) - np.roll(height, 1, 0)) * N
    norm = np.stack([-dx, -dy, np.ones_like(dx)], axis=2)
    norm /= np.linalg.norm(norm, axis=2)[..., None]
    normal = np.ones((N, N, 4)); normal[..., :3] = norm * .5 + .5
    key = hashlib.sha256((name + str(color) + CURRENT_TIER).encode()).hexdigest()[:12]
    nt = mat.node_tree; bsdf = nt.nodes.get('Principled BSDF')
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(key + '_color', base)
    nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    if vertex_color:
        vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Color'
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1
        nt.links.new(t.outputs['Color'], mix.inputs['A']); nt.links.new(vc.outputs['Color'], mix.inputs['B'])
        nt.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(key + '_orm', orm, True)
    sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(t.outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = image(key + '_normal', normal, True)
    normal_node = nt.nodes.new('ShaderNodeNormalMap'); normal_node.inputs['Strength'].default_value = .18
    nt.links.new(t.outputs['Color'], normal_node.inputs['Color']); nt.links.new(normal_node.outputs['Normal'], bsdf.inputs['Normal'])
    mat['review_role'] = name
    if paint_color is not None:mat['review_paint_color']=paint_color.tolist()
    if name in RUBBER_NAMES:mat['review_rubber_color']=[.027,.029,.028]
    return mat


# Builders import their material helper after this override; production sources stay unchanged.
lib.material = review_material
MODULES = {name: importlib.import_module(name) for name in ['pickup', 'minidigger', 'dumper', 'tractor', 'excavator', 'truck', 'trailer', 'handtools']}

# The original rear-arch loft crosses its own top around the wheel centre, exposing blue
# strips through the bed floor. Keep a thin, positive lower body section beneath that floor.
def review_pickup_lower_bed():
    p=MODULES['pickup']
    return lib.loft([(x,lib.section(p.W,p.W-.01,min(p.arch_bottom(x,.52),.79),.84,rb=.02,rt=.03))
                     for x in p.stations_between(-2.62,-.36,.25)])
MODULES['pickup'].bed_body=review_pickup_lower_bed


def subtree(root):
    return [root, *root.children_recursive]


def boundary_loops(mesh):
    """Glass panels are planar disconnected components; return their boundary rings."""
    bm = bmesh.new(); bm.from_mesh(mesh)
    loops = []
    unused = {e for e in bm.edges if e.is_boundary}
    while unused:
        e = unused.pop(); start = e.verts[0]; cur = e.verts[1]; verts = [start, cur]
        while cur != start:
            candidates = [q for q in cur.link_edges if q in unused]
            if not candidates:
                raise ValueError('Glass boundary is not closed')
            e = candidates[0]; unused.remove(e); cur = e.other_vert(cur)
            if cur != start:
                verts.append(cur)
        loops.append([v.co.copy() for v in verts])
    bm.free()
    return loops


def open_windows(root):
    glass = next((o for o in subtree(root) if o.name in {'Glass', 'CabGlass'}), None)
    cab = next((o for o in subtree(root) if o.name == 'Cab'), None)
    if not glass or not cab:
        return 0
    bpy.context.view_layer.update()
    rings = boundary_loops(glass.data)
    cutmat = bpy.data.materials.new('__ReviewCutCaps')
    cab.data.materials.append(cutmat)
    cut_index = len(cab.data.materials) - 1
    cutters = bpy.data.collections.new('__ReviewWindowCutters'); bpy.context.scene.collection.children.link(cutters)
    seal_verts, seal_faces = [], []
    for i, local in enumerate(rings):
        coords = [glass.matrix_world @ p for p in local]
        c = sum(coords, Vector()) / len(coords)
        n = sum((coords[j].cross(coords[(j+1)%len(coords)]) for j in range(len(coords))),Vector()).normalized()
        if n.length < .99:
            raise ValueError('Degenerate glass boundary')
        # Prism straddles the shell. Generated back/side caps are tagged, then removed.
        v = [p + n * .035 for p in coords] + [p - n * .11 for p in coords]
        count = len(coords)
        faces = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
        faces.extend((j, j+count, (j+1)%count+count, (j+1)%count) for j in range(count))
        me = bpy.data.meshes.new(f'WindowCutter{i}'); me.from_pydata(v, [], faces); me.update()
        ob = bpy.data.objects.new(f'WindowCutter{i}', me); cutters.objects.link(ob)
        for m in cab.data.materials: me.materials.append(m)
        for p in me.polygons: p.material_index = cut_index
        # A ring rather than the old solid black seal polygon behind the glass.
        off = len(seal_verts)
        inv = glass.matrix_world.inverted()
        inner = [inv @ (p - n * .002) for p in coords]
        outer = [inv @ (p + (p - c).normalized() * .025 - n * .0025) for p in coords]
        seal_verts.extend(inner + outer)
        seal_faces.extend((off+j, off+(j+1)%count, off+(j+1)%count+count, off+j+count) for j in range(count))
    bpy.context.view_layer.objects.active = cab; cab.select_set(True)
    mod = cab.modifiers.new('Review real window apertures', 'BOOLEAN'); mod.operation = 'DIFFERENCE'; mod.solver = 'EXACT'
    mod.operand_type = 'COLLECTION'; mod.collection = cutters
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bm = bmesh.new(); bm.from_mesh(cab.data)
    caps = [f for f in bm.faces if f.material_index == cut_index]
    if not caps:
        raise ValueError(f'Window cutting produced no tagged caps for {root.name}; materials={[(i,m.name) for i,m in enumerate(cab.data.materials)]}; counts={[(i,sum(f.material_index==i for f in bm.faces)) for i in range(len(cab.data.materials))]}')
    bmesh.ops.delete(bm, geom=caps, context='FACES'); bm.to_mesh(cab.data); bm.free()
    for ob in list(cutters.objects): bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.collections.remove(cutters)
    seals = next((o for o in subtree(root) if o.name in {'Seals', 'CabSeals'}), None)
    if seals:
        me = bpy.data.meshes.new('Review seal rings'); me.from_pydata(seal_verts, [], seal_faces); me.update()
        me.materials.append(review_material('SealRubber', (.02,.02,.02), vertex_color=False))
        seals.data = me; seals.matrix_world = glass.matrix_world.copy()
    return len(rings)


def curve(name, points, parent, radius=.012):
    data = bpy.data.curves.new(name, 'CURVE'); data.dimensions = '3D'; data.resolution_u = 4
    data.bevel_depth = radius; data.bevel_resolution = 2
    s = data.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p, co in zip(s.bezier_points, points): p.co = co; p.handle_left_type = p.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, data); lib.link(ob, parent)
    data.materials.append(review_material('HoseRubber', (.024,.025,.024), vertex_color=False))
    return ob


def rust_decal(name,points,parent,strength=.75):
    """A thin cutout wear patch on a known panel seam, not a whole-body rust overlay."""
    noise=textures.fractal_noise(N,2.4,89)
    u=np.linspace(0,1,N)[None,:];v=np.linspace(0,1,N)[:,None]
    fade=np.minimum(np.minimum(u,1-u)*14,np.minimum(v,1-v)*5)
    rgba=np.ones((N,N,4));rgba[...,:3]=textures.lerp([.12,.055,.022],[.31,.13,.042],noise)
    rgba[...,3]=textures.smoothstep(.45,.67,noise)*np.clip(fade,0,1)*strength
    mat=bpy.data.materials.new('Review seam rust');mat.use_nodes=True;mat.surface_render_method='DITHERED';mat.use_backface_culling=False
    nt=mat.node_tree;p=nt.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.92
    t=nt.nodes.new('ShaderNodeTexImage');t.image=image('review_local_rust',rgba)
    nt.links.new(t.outputs['Color'],p.inputs['Base Color']);nt.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
    bm=bmesh.new();f=bm.faces.new([bm.verts.new(p) for p in points]);layer=bm.loops.layers.uv.new()
    for loop,uv in zip(f.loops,[(0,0),(1,0),(1,1),(0,1)]):loop[layer].uv=uv
    return lib.mesh_object(name,bm,mat,parent)


def recess_grime(name, points, parent, strength=.35):
    """Soft transparent dirt at a seam: retains paint and avoids broad rectangular stains."""
    noise=textures.fractal_noise(N,2.2,193)
    u=np.linspace(0,1,N)[None,:];v=np.linspace(0,1,N)[:,None]
    fade=np.sin(np.pi*u)**.8 * np.exp(-((v-(.30+.10*noise))/.24)**2) * np.sin(np.pi*v)
    rgba=np.ones((N,N,4));rgba[...,:3]=textures.lerp([.045,.038,.028],[.13,.11,.08],noise)
    rgba[...,3]=(.35+.65*noise)*fade*strength
    key=f'Review_RecessGrime_{strength:.2f}'
    mat=bpy.data.materials.get(key)
    if mat is None:
        mat=bpy.data.materials.new(key);mat.use_nodes=True
        mat.surface_render_method='DITHERED';mat.use_backface_culling=False
        nt=mat.node_tree;p=nt.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.96
        t=nt.nodes.new('ShaderNodeTexImage');t.image=image(key,rgba)
        nt.links.new(t.outputs['Color'],p.inputs['Base Color']);nt.links.new(t.outputs['Alpha'],p.inputs['Alpha'])
    bm=bmesh.new();f=bm.faces.new([bm.verts.new(p) for p in points]);layer=bm.loops.layers.uv.new()
    for loop,uv in zip(f.loops,[(0,0),(1,0),(1,1),(0,1)]):loop[layer].uv=uv
    return lib.mesh_object(name,bm,mat,parent)


def used_panel_details(objects, kind):
    if CURRENT_TIER != 'used': return
    if kind == 'truck':
        for side in [-1,1]:
            y=side*1.153
            for x in [1.74,2.95]:
                recess_grime('Used cab shut-line dirt',[(x-.035,y,-.07),(x+.035,y,-.07),(x+.035,y,.60),(x-.035,y,.60)],objects['Cab'])
            recess_grime('Used handle recess',[(1.86,y,.43),(2.14,y,.43),(2.14,y,.59),(1.86,y,.59)],objects['Cab'])
            # Dirt rests at the floor/wall join, following the bed wall's slight slope.
            def at(px,z): return (px,side*(1.12+(z+.04)*.08/1.06+.003),z)
            recess_grime('Used bed lower recess', [at(.15,.075),at(4.12,.075),at(4.12,.17),at(.15,.17)],objects['Bed'],.22)
    if kind == 'excavator':
        # The clear side of the engine cover has a gasketed access panel and screw heads.
        pts=[(-1.6,1.253,.27),(-.55,1.253,.27),(-.55,1.253,.84),(-1.6,1.253,.84),(-1.6,1.253,.27)]
        joint=curve('Used engine access joint',pts,objects['House'],.004)
        for p in joint.data.splines[0].bezier_points: p.handle_left_type=p.handle_right_type='VECTOR'
        steel=review_material('AccessFasteners',(.12,.13,.13),roughness=.65,metallic=.6,vertex_color=False)
        screws=[lib.bm_cylinder(.012,.008,'Y',8,(x,1.256,z)) for x in [-1.55,-.60] for z in [.32,.79]]
        lib.mesh_object('Used access screws',lib.merge(*screws),steel,objects['House'])
        for x in [-1.6,-.55]:
            recess_grime('Used panel gasket dirt',[(x-.04,1.254,.27),(x+.04,1.254,.27),(x+.04,1.254,.84),(x-.04,1.254,.84)],objects['House'])
        for k in range(7):
            z=.35+k*.08
            recess_grime('Used vent edge dirt',[(-1.60,-1.253,z-.04),(-.60,-1.253,z-.04),(-.60,-1.253,z+.04),(-1.60,-1.253,z+.04)],objects['House'])


def details(root, kind):
    objects = {o.name:o for o in subtree(root)}
    used_panel_details(objects, kind)
    steel = review_material('WornSteel', (.18,.19,.2), vertex_color=False)
    if kind == 'pickup':
        objects['BedFloor'].data.materials.clear(); objects['BedFloor'].data.materials.append(review_material('BedSteel', (.2,.2,.18)))
        for y in [-.46, 0, .46]:
            curve('Review bench seam', [(.29,y,.812),(.05,y,.815),(-.05,y,.93),(-.05,y,1.18)], objects['Interior'], .003)
        for side in [-1,1]:
            y=side*.904
            rust_decal('Review localized sill wear',[(-.22,y,.535),(1.17,y,.535),(1.17,y,.605),(-.22,y,.605)],root)
    if kind in {'excavator', 'minidigger'}:
        length = 3.6 if kind == 'excavator' else 1.75
        stick = 2.6 if kind == 'excavator' else 1.1
        scale = 1 if kind == 'excavator' else .48
        for side in [-1,1]:
            curve('Review boom hydraulic hose', [(0.14,side*.25*scale,.13*scale),(.36,side*.25*scale,.32*scale),
                  (length*.55,side*.25*scale,.27*scale),(length-.15,side*.25*scale,.1*scale)], objects['Boom'], .022*scale)
            curve('Review stick hydraulic hose', [(.08,side*.20*scale,.15*scale),(.22,side*.20*scale,.22*scale),
                  (stick*.65,side*.20*scale,.15*scale),(stick-.18,side*.20*scale,.07*scale)], objects['Stick'], .02*scale)
        for name in ['BucketBody','Teeth']:
            if name in objects:
                objects[name].data.materials.clear(); objects[name].data.materials.append(steel)
    if kind == 'dumper':
        parts = [lib.bm_cylinder(.034,.11,'Y',16,(0,s*.3,-.03)) for s in [-1,1]]
        ob = lib.mesh_object('Review skip hinge bushes',lib.merge(*parts),steel,objects['SkipPivot'])
        lib.finish(ob, .003, dirt=False)
        assign_work_surface(objects['Skip'],steel,lambda p: p.normal.z>.75 and p.center.z<.06)
    if kind == 'tractor':
        curve('Review tractor seat seam',[(-.98,-.16,1.325),(-.8,-.16,1.325)],objects['Interior'],.003)
    if kind == 'trailer':
        parts = [lib.bm_cylinder(.032,.1,'Y',16,(0,s*.72,0)) for s in [-1,1]]
        ob = lib.mesh_object('Review tailgate hinge bushes',lib.merge(*parts),steel,objects['TailgatePivot'])
        lib.finish(ob,.003,dirt=False)
        assign_work_surface(objects['Bed'],steel,lambda p: p.normal.z>.8 and p.center.z<.04)
    if kind == 'truck':
        assign_work_surface(objects['Bed'],steel,lambda p:p.normal.z>.8 and p.center.z<.16)
    if kind == 'wheelbarrow':
        # Small tray deformation, below a centimetre; rim, wheel and handles stay in place.
        for v in objects['Tray'].data.vertices:
            if .39<v.co.z<.57:
                v.co.y += .003*math.sin(v.co.x*17)*math.sin(v.co.z*23)


def assign_work_surface(ob, mat, predicate):
    ob.data.materials.append(mat); ix=len(ob.data.materials)-1
    for p in ob.data.polygons:
        if predicate(p): p.material_index=ix


def recolor(root):
    """Localised edge ageing and restrained ground grime, embedded in exported vertex colors."""
    bpy.context.view_layer.update()
    ground = -1.3 if root.name == 'Truck' else 0
    wear = 1 if CURRENT_TIER == 'rusty' else .23
    for ob in subtree(root):
        if ob.type != 'MESH': continue
        me = ob.data
        attr = me.color_attributes.get('Color') or me.color_attributes.new(name='Color',type='BYTE_COLOR',domain='CORNER')
        me.color_attributes.active_color=attr
        colors=np.ones((len(me.loops),4),dtype=np.float32)
        for face in me.polygons:
            mat=me.materials[face.material_index]
            paint=mat.get('review_paint_color')
            for ix in face.loop_indices:
                v=me.vertices[me.loops[ix].vertex_index];p=ob.matrix_world @ v.co
                low=1-max(0,min(1,(p.z-ground-.12)/.65))
                tint=np.array(paint if paint is not None else [1.,1.,1.])
                tint*=1-low*.16*wear
                colors[ix,:3]=tint
        attr.data.foreach_set('color',colors.ravel())


def bake_paint_atlases(root):
    """Rasterise continuous object-space wear into unique UV colour / ORM atlases.

    This avoids per-face rectangular rust blocks and keeps the result portable to glTF.
    Painted meshes and tyres are unwrapped; no vertices, rig parts or transforms change.
    """
    size=512;wear=1 if CURRENT_TIER=='rusty' else .18
    for ob in subtree(root):
        if ob.type!='MESH':continue
        me=ob.data
        slots=[i for i,m in enumerate(me.materials) if m and (m.get('review_paint_color') is not None or
               (m.get('review_rubber_color') is not None and ob.name!='TrackShoe'))]
        if not slots:continue
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012)
        bpy.ops.object.mode_set(mode='OBJECT')
        me.calc_loop_triangles();uv=me.uv_layers.active.data
        positions=np.array([v.co[:] for v in me.vertices]);lo=positions.min(0);hi=positions.max(0)
        for slot in slots:
            old=me.materials[slot];rubber=old.get('review_rubber_color') is not None
            paint=np.array(old['review_rubber_color'] if rubber else old['review_paint_color'])
            rgba=np.ones((size,size,4),dtype=np.float32);rgba[...,:3]=paint
            orm=np.ones((size,size,4),dtype=np.float32);orm[...,1]=.72 if CURRENT_TIER=='rusty' else .49;orm[...,2]=.1
            for tri in me.loop_triangles:
                if tri.material_index!=slot:continue
                uvs=np.array([uv[i].uv[:] for i in tri.loops])*(size-1)
                a,b,c=uvs;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
                if abs(den)<1e-8:continue
                x0,y0=np.maximum(np.floor(uvs.min(0)).astype(int),0);x1,y1=np.minimum(np.ceil(uvs.max(0)).astype(int),size-1)
                xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
                w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
                w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1
                valid=(w0>=-.005)&(w1>=-.005)&(w2>=-.005)
                if not valid.any():continue
                pts=positions[list(tri.vertices)];p=w0[...,None]*pts[0]+w1[...,None]*pts[1]+w2[...,None]*pts[2]
                x,y,z=p[...,0],p[...,1],p[...,2]
                noise=.65*value_noise(p*15)+.25*value_noise(p*43)+.1*value_noise(p*91)
                d=np.sort(np.minimum(p-lo,hi-p),axis=2)[...,1]
                edge=1-textures.smoothstep(.004,.038,d)
                bevel=sum(abs(v)>.12 for v in tri.normal)>=2
                if bevel:edge=np.maximum(edge,.55)
                chips=textures.smoothstep(.57,.76,noise)*edge*wear
                # Narrow streaks travel down from seams instead of coating whole panels.
                streak=textures.smoothstep(.81,.94,noise)*.12*wear
                amount=np.clip(chips*.82+streak,0,1)
                color=paint*(.94+.06*noise[...,None])
                color=textures.lerp(color,[.095,.033,.013],amount)
                if rubber:
                    mw=np.array(ob.matrix_world)
                    world_z=p[...,0]*mw[2,0]+p[...,1]*mw[2,1]+p[...,2]*mw[2,2]+mw[2,3]
                    ground=-1.3 if root.name=='Truck' else 0
                    mud=(1-textures.smoothstep(ground+.05,ground+.55,world_z))*textures.smoothstep(.4,.7,noise)
                    mud*=.65 if CURRENT_TIER=='rusty' else .24
                    color=textures.lerp(paint*(.92+.08*noise[...,None]),[.14,.095,.055],mud)
                block=rgba[y0:y1+1,x0:x1+1,:3];block[valid]=color[valid]
                block=orm[y0:y1+1,x0:x1+1,1];block[valid]=.94 if rubber else (.72 if CURRENT_TIER=='rusty' else .49)+amount[valid]*.15
                block=orm[y0:y1+1,x0:x1+1,2];block[valid]=0 if rubber else .1+amount[valid]*.12
            rgb=np.clip(rgba[...,:3],0,1);rgba[...,:3]=np.where(rgb<=.0031308,rgb*12.92,1.055*rgb**(1/2.4)-.055)
            mat=old.copy();mat.name=old.name+'_'+ob.name;me.materials[slot]=mat
            nt=mat.node_tree;p=nt.nodes.get('Principled BSDF');prefix='atlas_'+ob.name+'_'+str(slot)
            t=nt.nodes.new('ShaderNodeTexImage');t.image=image(prefix+'_color',rgba)
            nt.links.new(t.outputs['Color'],p.inputs['Base Color'])
            t=nt.nodes.new('ShaderNodeTexImage');t.image=image(prefix+'_orm',orm,True)
            sep=nt.nodes.new('ShaderNodeSeparateColor');nt.links.new(t.outputs['Color'],sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'],p.inputs['Roughness']);nt.links.new(sep.outputs['Blue'],p.inputs['Metallic'])
            attr=me.color_attributes.get('Color')
            if attr:
                for face in me.polygons:
                    if face.material_index==slot:
                        for ix in face.loop_indices:attr.data[ix].color=(1,1,1,1)


def value_noise(p):
    """Continuous deterministic 3D noise; no repeating diagonal chip pattern."""
    cell=np.floor(p);f=p-cell;f=f*f*(3-2*f);out=np.zeros(p.shape[:-1])
    for x in [0,1]:
        for y in [0,1]:
            for z in [0,1]:
                c=cell+np.array([x,y,z]);n=np.sin(c[...,0]*127.1+c[...,1]*311.7+c[...,2]*74.7)*43758.5453
                n=n-np.floor(n)
                w=(f[...,0] if x else 1-f[...,0])*(f[...,1] if y else 1-f[...,1])*(f[...,2] if z else 1-f[...,2])
                out+=n*w
    return out


def rig_snapshot(root):
    names={'Wheel','Wheel0','Wheel1','Wheel2','Wheel3','House','Boom','Stick','Bucket','BucketLink',
           'BoomRam','BoomRamRod','StickRam','StickRamRod','BucketRam','BucketRamRod',
           'BedPivot','TailgatePivot','SkipPivot','Blade','Interior','TrackShoe','Tracks','TrackBand',
           'TrackWheelL0','TrackWheelL1','TrackWheelR0','TrackWheelR1','SteeringWheel'}
    return {o.name:{'parent':o.parent.name if o.parent else None,'matrix':[round(x,7) for row in o.matrix_basis for x in row]}
            for o in subtree(root) if o.name in names}


def review_track_instances(root,kind):
    """Review-scene tread copies, matching the game's path. Exported rig keeps its template."""
    if kind not in {'minidigger','dumper','excavator'}:return
    module=MODULES[kind];h=module.TRACK_HALF;r=module.TRACK_R;y=module.TRACK_Y
    count=52 if kind=='excavator' else 44;loop=4*h+2*math.pi*r
    shoe=bpy.data.objects['TrackShoe'];shoe.hide_render=True
    if bpy.data.objects.get('Tracks'):bpy.data.objects['Tracks'].hide_render=True
    for side in [-1,1]:
        for i in range(count):
            d=i*loop/count
            if d<2*h:x,z,angle=-h+d,0,math.pi
            elif d<2*h+math.pi*r:
                a=-math.pi/2+(d-2*h)/r;x,z,angle=h+math.cos(a)*r,r+math.sin(a)*r,math.pi/2-a
            elif d<4*h+math.pi*r:x,z,angle=h-(d-2*h-math.pi*r),2*r,0
            else:
                a=math.pi/2+(d-4*h-math.pi*r)/r;x,z,angle=-h+math.cos(a)*r,r+math.sin(a)*r,math.pi/2-a
            ob=shoe.copy();ob.data=shoe.data;ob.name=f'Review tread {side} {i:02d}';lib.link(ob,root)
            ob.hide_render=False;ob.location=(x,side*y,z);ob.rotation_euler=(0,angle,0)


def studio(root, target, angle, path):
    scene=bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=24
    scene.cycles.use_denoising=True; scene.render.threads_mode='FIXED'; scene.render.threads=8
    scene.render.resolution_x=1100;scene.render.resolution_y=700;scene.render.resolution_percentage=100
    scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0
    scene.world=bpy.data.worlds.new('Review studio world');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.55,.62,.7,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.65
    for name,loc,power,size in [('Review key',(4,-5,8),1600,6),('Review fill',(-3,3,6),1100,5)]:
        ob=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));lib.link(ob);ob.location=loc;ob.data.energy=power;ob.data.shape='DISK';ob.data.size=size
        ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    ground=-1.3 if root.name=='Truck' else (-.065 if bpy.data.objects.get('TrackBand') or bpy.data.objects.get('Tracks') else 0)
    floor=lib.mesh_object('Review ground',lib.bm_box((60,60,.02),(0,0,ground-.01)),
                          ORIGINAL_MATERIAL('Review ground mat',(.32,.34,.35),roughness=.9,vertex_color=False))
    cam=bpy.data.objects.new('Review camera',bpy.data.cameras.new('Review camera'));lib.link(cam);cam.data.lens=45
    bpy.context.view_layer.update()
    bounds=[o.matrix_world @ Vector(c) for o in subtree(root) if o.type=='MESH' and o.name!='TrackShoe' for c in o.bound_box]
    mn=Vector([min(v[i] for v in bounds) for i in range(3)]);mx=Vector([max(v[i] for v in bounds) for i in range(3)])
    center=(mn+mx)*.5;distance=max(mx.x-mn.x,mx.y-mn.y,(mx.z-mn.z)*1.4)*1.8
    a=math.radians(angle);e=math.radians(19)
    cam.location=center+Vector((math.cos(a)*math.cos(e),math.sin(a)*math.cos(e),math.sin(e)))*distance
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();scene.camera=cam
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(path)
    bpy.ops.render.render(write_still=True)
    return cam,center,distance


def build(kind,tier,out):
    global CURRENT_TIER
    CURRENT_TIER=tier; IMAGE_CACHE.clear();lib._images.clear();lib.reset_scene()
    if kind=='pickup':root=MODULES[kind].build(drivable=True);name='vehicle_pickup'
    elif kind=='wheelbarrow':root=MODULES['handtools'].wheelbarrow();name='prop_wheelbarrow'
    else:root=MODULES[kind].build(tier);name=f'{kind}_{tier}'
    original=rig_snapshot(root)
    panes=open_windows(root);details(root,kind);recolor(root);bake_paint_atlases(root)
    assert rig_snapshot(root)==original,'Review changed a protected rig transform or parent'
    asset=out/name;asset.mkdir(parents=True,exist_ok=True)
    # Export the rest pose. Pose and studio are only for the editable review scene.
    lib.select_hierarchy(root)
    bpy.ops.export_scene.gltf(filepath=str(asset/(name+'.glb')),export_format='GLB',use_selection=True,
      export_yup=True,export_apply=True,export_image_format='AUTO',export_vertex_color='ACTIVE',export_extras=True)
    if kind in {'excavator','minidigger'}:MODULES[kind].pose(root)
    review_track_instances(root,kind)
    if bpy.data.objects.get('TrackShoe'):bpy.data.objects['TrackShoe'].hide_render=True
    cam,center,distance=studio(root,(0,0,1),-35,asset/'front.png')
    a=math.radians(145);e=math.radians(19)
    cam.location=center+Vector((math.cos(a)*math.cos(e),math.sin(a)*math.cos(e),math.sin(e)))*distance
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.render.filepath=str(asset/'rear.png');bpy.ops.render.render(write_still=True)
    # Save opening on the first review angle with its delivery camera and editable meshes.
    a=math.radians(-35);cam.location=center+Vector((math.cos(a)*math.cos(e),math.sin(a)*math.cos(e),math.sin(e)))*distance
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    for im in bpy.data.images:
        if im.source=='FILE' or im.generated_type: im.pack()
    bpy.ops.wm.save_as_mainfile(filepath=str(asset/(name+'.blend')))
    report={'asset':name,'panes_opened':panes,'rig_preserved':True,'rig':original,
            'glb_bytes':(asset/(name+'.glb')).stat().st_size,'blend_bytes':(asset/(name+'.blend')).stat().st_size}
    (asset/'checks.json').write_text(json.dumps(report,indent=2))
    print('REVIEW_ASSET_READY',json.dumps({k:v for k,v in report.items() if k!='rig'}),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True);parser.add_argument('models',nargs='*');parser.add_argument('--tier',choices=['rusty','used','both'],default='both')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    out=Path(args.out).resolve();production=(Path(__file__).parent.parent/'assets').resolve()
    if out==production or production in out.parents:raise ValueError('Review output must be outside production assets')
    for kind in args.models or ['pickup','wheelbarrow','minidigger','dumper','tractor','excavator','truck','trailer']:
        tiers=['rusty'] if kind in {'pickup','wheelbarrow'} else (['rusty','used'] if args.tier=='both' else [args.tier])
        for tier in tiers:build(kind,tier,out)

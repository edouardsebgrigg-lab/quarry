"""Import the production library into Blender and refine it without moving rig nodes.

blender -b --python blender/clean_fleet.py -- --out /absolute/scratch
The source GLBs stay untouched; install approved outputs after contract/budget checks.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).parent))
import lib


def part(name, bm, mat, parent, bevel=.008):
    obj = lib.mesh_object(name, bm, mat, parent)
    if bevel:
        lib.bevel(obj, bevel, 2)
        lib.weighted_normals(obj)
    lib.smooth(obj, 45)
    lib.box_uv(obj)
    return obj


def block(name, size, pos, mat, parent, radius=.025):
    return part(name, lib.rounded_box(size, pos, min(radius, min(size)*.24), 3), mat, parent, 0)


def tube(name, a, b, radius, mat, parent):
    a, b = Vector(a), Vector(b)
    bm = lib.bm_cylinder(radius, (b-a).length, 'Z', 12)
    bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=(b-a).to_track_quat('Z', 'Y').to_matrix(), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a+b)/2, verts=bm.verts)
    return part(name, bm, mat, parent, .002)


def mats():
    return {
        'steel': lib.material('Review_CleanSteel', (.22,.25,.27), roughness=.42, metallic=.7, vertex_color=False),
        'dark': lib.material('Review_CleanBlack', (.023,.026,.028), roughness=.7, metallic=.12, vertex_color=False),
        'rubber': lib.material('Review_CleanRubber', (.018,.019,.02), roughness=.94, vertex_color=False),
        'paint': lib.material('Review_MobilityPaint', (.21,.34,.21), roughness=.42, metallic=.2, vertex_color=False),
        'seat': lib.material('Review_CleanSeat', (.027,.033,.035), roughness=.88, vertex_color=False),
        'glass': lib.material('Review_Glass', (.35,.47,.52), roughness=.08, alpha=.15, vertex_color=False),
        'lamp': lib.material('Review_Headlight', (.8,.83,.75), roughness=.12, metallic=.15, vertex_color=False),
        'tail': lib.material('Review_TailLight', (.32,.025,.018), roughness=.24, vertex_color=False),
    }


def refine(name, objects):
    lookup = {o.name:o for o in objects}
    root = next(o for o in objects if not o.parent)
    m = mats()
    # Added geometry is parented to the moving component, never a substitute pivot.
    if name.startswith(('excavator_', 'minidigger_')):
        mini = name.startswith('mini')
        s = .45 if mini else 1
        for joint, radius in [('Boom',.115),('Stick',.095),('Bucket',.085)]:
            p = lookup[joint]
            for side in [-1,1]:
                y = side * (.26 if joint=='Boom' else .21)*s
                part('Clean '+joint+' pin cap', lib.bm_cylinder(radius*s,.045*s,'Y',20,(0,y,0)),m['steel'],p,.003*s)
        house = lookup['House']
        # Access step, anti-slip grooves and service hatch hardware.
        y = .46 if mini else 1.26
        for k in range(2):
            x = -.45 if mini else -.3
            z = -.19+k*.16 if mini else -.3+k*.22
            block('Clean access step',(.33*s,.23*s,.045*s),(x,y,z),m['steel'],house,.008)
            for i in range(4):
                block('Clean step tread',(.26*s,.014*s,.014*s),(x,y+(i-1.5)*.045*s,z+.027*s),m['dark'],house,.003)
        for side in [-1,1]:
            tube('Clean bucket wear rail',(.12*s,side*.43*s,-.18*s),(.66*s,side*.43*s,-.16*s),.015*s,m['steel'],lookup['Bucket'])
    elif name.startswith(('tractor_', 'vehicle_pickup', 'truck_')):
        for i in range(4):
            w = lookup.get('Wheel'+str(i))
            if not w: continue
            tractor = name.startswith('tractor')
            r = (.16 if i<2 else .29) if tractor else .20 if name=='vehicle_pickup' else .29
            side = 1 if i%2==0 else -1
            width = (.13 if i<2 else .23) if tractor else .18 if name=='vehicle_pickup' else .255
            for k in range(6):
                a = k*math.tau/6
                part('Clean captive wheel nut',lib.bm_cylinder(.021,.035,'Y',6,(math.cos(a)*r,side*width,math.sin(a)*r)),m['steel'],w,.002)
        if name.startswith('tractor'):
            for side in [-1,1]:
                block('Clean foot plate',(.38,.26,.045),(-.32,side*.68,.65),m['steel'],root,.009)
                tube('Clean entry hand grip',(-.7,side*.57,1.2),(-.7,side*.57,1.55),.019,m['dark'],root)
        elif name.startswith('truck'):
            bed = lookup['BedPivot']
            for side in [-1,1]:
                for x in [.35,1.45,2.55,3.65]:
                    block('Clean bed stiffener',(.095,.06,.82),(x,side*1.145,.55),m['steel'],bed,.008)
            for side in [-1,1]:
                block('Clean front marker',(.08,.045,.1),(2.5,side*1.19,.18),m['lamp'],root,.01)
    elif name.startswith('trailer_'):
        bed = lookup['BedPivot']
        for side in [-1,1]:
            for x in [.5,1.45,2.4,3.35]:
                part('Clean tie down eye',lib.bm_torus(.05,.009,'Y',16,6,(x,side*.975,.18)),m['steel'],bed,0)
            block('Clean mud flap',(.055,.3,.36),(-.52,side*.97,.43),m['rubber'],root,.008)
        tube('Clean parking jack',(2.7,.22,.25),(2.7,.22,.65),.045,m['steel'],root)
        block('Clean jack foot',(.2,.18,.035),(2.7,.22,.23),m['steel'],root,.01)
    elif name.startswith('dumper_'):
        for side in [-1,1]:
            tube('Clean skip safety rail',(-.35,side*.55,.62),(.2,side*.55,.62),.022,m['steel'],lookup['SkipPivot'])
        block('Clean operator foot mat',(.55,.54,.035),(-.45,0,.65),m['rubber'],root,.008)
    return root


def wheel(parent, index, x, y, radius, width, m):
    w = lib.empty('Wheel'+str(index),(x,y,radius),parent)
    profile=[(radius*.57,-width*.50),(radius*.91,-width*.49),(radius,-width*.31),
             (radius,width*.31),(radius*.91,width*.49),(radius*.57,width*.5),(radius*.57,-width*.5)]
    part('Tyre',lib.bm_lathe(profile,32,'Y'),m['rubber'],w,0)
    side = 1 if y>0 else -1
    part('Rim',lib.bm_cylinder(radius*.61,width*.87,'Y',24),m['steel'],w,.012)
    part('Hub',lib.bm_cylinder(radius*.22,width*1.02,'Y',16),m['dark'],w,.005)
    for k in range(6):
        a=k*math.tau/6
        part('Wheel nut',lib.bm_cylinder(.014,.035,'Y',6,(math.cos(a)*radius*.34,side*(width*.48),math.sin(a)*radius*.34)),m['steel'],w,.001)
    for k in range(24):
        a=k*math.tau/24
        bm=lib.bm_box((.065,width*.83,.018),(0,0,radius-.004))
        from mathutils import Matrix
        bmesh.ops.rotate(bm,cent=(0,0,0),matrix=Matrix.Rotation(a,3,'Y'),verts=bm.verts)
        part('Tyre tread',bm,m['rubber'],w,.003)


def seat(parent,x,y,z,m):
    block('Seat cushion',(.46,.4,.12),(x,y,z),m['seat'],parent,.055)
    ob=block('Seat back',(.11,.4,.48),(x-.21,y,z+.23),m['seat'],parent,.045)
    ob.rotation_euler.y=-.10


def mobility(kind):
    lib.reset_scene();m=mats();root=lib.empty('Mobility_'+kind)
    interior=lib.empty('Interior',parent=root)
    quad=kind=='quad';buggy=kind=='buggy'
    if quad:
        m['paint'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.37,.085,.045,1)
        block('Chassis', (1.55,.60,.16),(0,0,.42),m['dark'],root,.045)
        # Curved ATV tank, tapered nose and fender arches instead of stacked cuboids.
        body=lib.loft([(x,lib.section(w,w*.8,zb,zt,.06,.09,corner=4)) for x,w,zb,zt in
                      [(-.66,.26,.5,.72),(-.30,.29,.48,.86),(.10,.24,.52,1.00),(.48,.30,.48,.79),(.82,.23,.50,.70)]])
        part('Tank and nose',body,m['paint'],root,0)
        block('Saddle',(.74,.32,.15),(-.23,0,.92),m['seat'],root,.065)
        for x in [-.67,.67]:
            for side in [-1,1]:
                block('Fender',(.62,.30,.12),(x,side*.36,.79),m['paint'],root,.045)
                tube('Fender edge',(x-.25,side*.52,.81),(x+.25,side*.52,.81),.022,m['dark'],root)
            for side in [-1,1]:
                tube('Rack side',(x-.22,side*.26,.93),(x+.22,side*.26,.93),.018,m['steel'],root)
            for k in [-1,0,1]: tube('Rack crossbar',(x+k*.16,-.26,.93),(x+k*.16,.26,.93),.015,m['steel'],root)
        tube('Steering stem',(.28,0,.92),(.40,0,1.17),.025,m['steel'],interior)
        tube('Handlebar',(.4,-.34,1.17),(.4,.34,1.17),.02,m['dark'],interior)
        for side in [-1,1]:
            block('Headlight',(.055,.16,.10),(.83,side*.18,.69),m['lamp'],root,.02)
            block('TailLight',(.04,.10,.07),(-.93,side*.2,.7),m['tail'],root,.01)
        eye=(-.1,.10,1.30);bed=(-.6,0,.9);half=(.2,.2);rear=(-.98,0,.8)
        dims=(.67,.43,.23,.25)
    elif buggy:
        block('Skid', (2.58,1.05,.17),(0,0,.42),m['dark'],root,.06)
        # Side-by-side has open foot wells, two proper seats, independent cargo box and roll cage.
        bonnet=lib.loft([(x,lib.section(w,w*.8,.59,z,.065,.085,corner=4)) for x,w,z in [(.57,.52,.85),(.94,.58,.91),(1.3,.5,.8)]])
        part('Bonnet',bonnet,m['paint'],root,0)
        block('Cab floor', (1.24,1.12,.08),(.03,0,.64),m['dark'],root,.025)
        for y in [-.29,.29]: seat(interior,-.02,y,.86,m)
        block('Dashboard',(.24,1.03,.22),(.69,0,1.08),m['dark'],interior,.055)
        steering=part('Steering rim',lib.bm_torus(.13,.016,'X',24,8,(.53,.29,1.16)),m['dark'],interior,0)
        for side in [-1,1]:
            tube('A pillar',(.88,side*.57,.71),(.55,side*.54,1.88),.036,m['dark'],root)
            tube('B pillar',(-.47,side*.57,.68),(-.47,side*.54,1.88),.036,m['dark'],root)
            tube('Roof rail',(-.47,side*.54,1.88),(.55,side*.54,1.88),.036,m['dark'],root)
            block('Half door',(.77,.055,.36),(-.07,side*.57,.91),m['paint'],root,.025)
        block('Roof', (1.25,1.27,.08),(.05,0,1.90),m['paint'],root,.035)
        pane=[(.83,-.5,1.08),(.83,.5,1.08),(.60,.49,1.78),(.60,-.49,1.78)]
        panel=bmesh.new()
        panel.faces.new([panel.verts.new(v) for v in pane]);part('Windshield',panel,m['glass'],root,0)
        bed=(-.93,0,.72);half=(.44,.54);rear=(-1.4,0,.73)
        block('Bed floor',(.9,1.12,.08),bed,m['steel'],root,.02)
        for side in [-1,1]:block('Bed side',(.95,.055,.32),(-.93,side*.56,.88),m['paint'],root,.018)
        block('Bed front',(.065,1.16,.32),(-.49,0,.88),m['paint'],root,.018)
        gate=lib.empty('TailgatePivot',rear,root);block('Tailgate',(.07,1.11,.32),(0,0,.15),m['paint'],gate,.018)
        eye=(.0,.29,1.62);dims=(1,.63,.32,.27)
    else:
        # A panel van with a separate bonnet and open window apertures. Rear cargo body
        # stops behind the seats; windscreen and side glass have no opaque mesh behind them.
        m['paint'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.63,.67,.59,1)
        block('Chassis',(5.0,1.52,.2),(0,0,.47),m['dark'],root,.06)
        body=lib.loft([(x,lib.section(w,w*.95,.66,z,.10,.16,corner=5)) for x,w,z in [(-2.72,.88,2.39),(-2.55,.93,2.45),(-.48,.93,2.45)]])
        part('Cargo body',body,m['paint'],root,0)
        bonnet=lib.loft([(x,lib.section(w,w*.9,.68,z,.08,.1,corner=4)) for x,w,z in [(1.30,.86,1.20),(2.25,.84,1.09),(2.62,.78,1.00)]])
        part('Bonnet',bonnet,m['paint'],root,0)
        block('Cab floor',(1.8,1.72,.14),(.47,0,.73),m['dark'],root,.035)
        for side in [-1,1]:
            block('Door panel',(1.7,.065,.48),(.52,side*.87,1.04),m['paint'],root,.025)
            tube('A pillar',(1.37,side*.85,1.26),(.98,side*.81,2.27),.042,m['paint'],root)
            tube('B pillar',(-.44,side*.85,1.20),(-.44,side*.81,2.31),.05,m['paint'],root)
            tube('Window sill',(-.42,side*.87,1.30),(1.35,side*.87,1.30),.025,m['dark'],root)
            points=[(-.36,side*.87,1.36),(1.30,side*.87,1.36),(.93,side*.81,2.19),(-.36,side*.81,2.23)]
            bm=bmesh.new();bm.faces.new([bm.verts.new(v) for v in points]);part('Door glass',bm,m['glass'],root,0)
            block('Door handle',(.2,.045,.04),(-.17,side*.925,1.22),m['dark'],root,.008)
            tube('Mirror arm',(1.22,side*.86,1.67),(1.27,side*1.10,1.64),.025,m['dark'],root)
            block('Mirror',(.11,.10,.23),(1.27,side*1.12,1.67),m['dark'],root,.025)
        roof=lib.loft([(x,lib.section(.88,.83,2.26,z,.03,.065,corner=4)) for x,z in [(-.5,2.42),(.85,2.37),(1.02,2.3)]])
        part('Cab roof',roof,m['paint'],root,0)
        bm=bmesh.new();bm.faces.new([bm.verts.new(v) for v in [(1.36,-.78,1.35),(1.36,.78,1.35),(.99,.75,2.20),(.99,-.75,2.20)]]);part('Windscreen',bm,m['glass'],root,0)
        for y in [-.43,.43]:seat(interior,.26,y,1.02,m)
        block('Dashboard',(.37,1.56,.24),(1.12,0,1.30),m['dark'],interior,.045)
        part('Steering rim',lib.bm_torus(.18,.022,'X',28,8,(.88,.43,1.46)),m['dark'],interior,0)
        for side in [-1,1]:
            block('Headlight',(.07,.31,.18),(2.65,side*.59,.98),m['lamp'],root,.025)
            block('TailLight',(.045,.12,.36),(-2.74,side*.77,1.03),m['tail'],root,.02)
            tube('Roof rack',(-2.25,side*.66,2.58),(-.64,side*.66,2.58),.025,m['steel'],root)
            for x in [-2.25,-1.46,-.64]:tube('Rack crossbar',(x,-.66,2.58),(x,.66,2.58),.022,m['steel'],root)
            block('Rear door seam',(.02,.02,1.4),(-2.735,side*.015,1.6),m['dark'],root,.003)
        block('Front bumper',(.17,1.8,.22),(2.72,0,.64),m['dark'],root,.06)
        block('Grille',(.045,.7,.21),(2.705,0,.89),m['dark'],root,.018)
        for k in range(4):block('Grille slat',(.055,.66,.015),(2.733,0,.82+k*.045),m['steel'],root,.003)
        eye=(.60,.43,1.77);bed=(-1.40,0,.8);half=(1.0,.75);rear=(-2.75,0,.8)
        dims=(1.643,.8056,.3816,.31)
    x,y,r,w=dims
    for i,(wx,wy) in enumerate([(x,y),(x,-y),(-x,y),(-x,-y)]):
        wheel(root,i,wx,wy,r,w,m)
        # Suspension links and exposed axle belong to the chassis, not animated wheels.
        tube('Suspension link',(wx*.83,wy*.42,.44),(wx,wy,r),.025,m['steel'],root)
    for name,pos in [('CabEye',eye),('BedFloor',bed),('BedRear',rear),('Exhaust',(-x-.17,-y*.5,.35))]:lib.empty(name,pos,root)
    root['bedHalfX']=half[0];root['bedHalfZ']=half[1]
    return root


def audit(objects):
    removed=0
    for obj in objects:
        if obj.type!='MESH':continue
        if not all(math.isfinite(v) for vert in obj.data.vertices for v in vert.co):raise ValueError(obj.name+' has invalid vertices')
        # Remove only zero-area triangles: UV seams, custom normals and rig transforms stay intact.
        bad=[p.index for p in obj.data.polygons if p.area<1e-12]
        if bad:
            bm=bmesh.new();bm.from_mesh(obj.data);bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm,geom=[bm.faces[i] for i in bad],context='FACES_ONLY');removed+=len(bad)
            bm.to_mesh(obj.data);bm.free()
    return removed


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',required=True)
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    src=Path(__file__).resolve().parent.parent/'assets/models'
    manifest=json.loads((src/'manifest.json').read_text())['models'];reports=[]
    for name in (n for n in manifest if not n.startswith('mobility_')):
        lib.reset_scene();bpy.ops.import_scene.gltf(filepath=str(src/(name+'.glb')))
        # Re-running cleanup replaces the hardware from the previous pass.
        for ob in list(bpy.context.scene.objects):
            if ob.name.startswith('Clean '):bpy.data.objects.remove(ob,do_unlink=True)
        objects=list(bpy.context.scene.objects);removed=audit(objects)
        fleet=not name.startswith('prop_') or name=='prop_wheelbarrow'
        if fleet:
            root=refine(name,objects)
            bpy.ops.object.select_all(action='SELECT')
            bpy.ops.export_scene.gltf(filepath=str(out/(name+'.glb')),export_format='GLB',export_yup=True,
                export_apply=True,export_image_format='AUTO',export_vertex_color='ACTIVE',export_extras=True)
        reports.append({'model':name,'meshes':sum(o.type=='MESH' for o in objects),'zeroAreaRemoved':removed,'refined':fleet})
        print('CLEAN_READY',name,flush=True)
    for kind in ['quad','buggy','serviceVan']:
        root=mobility(kind);lib.select_hierarchy(root)
        bpy.ops.export_scene.gltf(filepath=str(out/('mobility_'+kind+'.glb')),export_format='GLB',export_yup=True,
          export_apply=True,export_image_format='AUTO',export_extras=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(out/(kind+'.blend')),compress=True)
        reports.append({'model':'mobility_'+kind,'refined':True,'authoredInBlender':True})
    lib.reset_scene();bpy.ops.import_scene.gltf(filepath=str(out/'vehicle_pickup.glb'))
    objects=list(bpy.context.scene.objects);root=next(o for o in objects if not o.parent)
    clean=mats();blue=lib.material('Review_PickupPaint_4x4',(.030,.112,.198),roughness=.44,metallic=.22,vertex_color=False)
    # A recent 4x4 has its own paint/interior asset; the original starter pickup remains rusty.
    for o in objects:
        if o.type=='MESH':
            for i,mat in enumerate(o.data.materials):
                if mat and any(k in mat.name.lower() for k in ['pickup','bodypaint']):
                    clean_paint=mat.copy();clean_paint.name='Review_PickupPaint_4x4_'+o.name
                    shader=clean_paint.node_tree.nodes.get('Principled BSDF')
                    for link in list(shader.inputs['Base Color'].links):clean_paint.node_tree.links.remove(link)
                    shader.inputs['Base Color'].default_value=(.030,.112,.198,1)
                    o.data.materials[i]=clean_paint
    for side in [-1,1]:
        tube('4x4 roof rack rail',(-.12,side*.57,1.93),(1.11,side*.57,1.93),.026,clean['dark'],root)
        for x in [.0,.54,1.05]:tube('4x4 roof rack crossbar',(x,-.57,1.93),(x,.57,1.93),.025,clean['steel'],root)
    tube('4x4 brush guard',(2.72,-.75,.78),(2.72,.75,.78),.045,clean['steel'],root)
    for side in [-1,1]:tube('4x4 brush guard upright',(2.72,side*.6,.58),(2.72,side*.6,1.02),.04,clean['steel'],root)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=str(out/'mobility_fourByFour.glb'),export_format='GLB',export_yup=True,
        export_apply=True,export_image_format='AUTO',export_vertex_color='ACTIVE',export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'fourByFour.blend'),compress=True)
    reports.append({'model':'mobility_fourByFour','refined':True,'authoredInBlender':True})
    (out/'cleanup-report.json').write_text(json.dumps(reports,indent=2))


if __name__=='__main__':main()

"""Create one editable, packed Blender review scene of every asset and assembled variant.

blender -b --python blender/catalogue_scene.py -- --variants /scratch/export --out /outputs/quarry-models.blend
Individual machines are in named collections with their source path and review metadata.
The catalogue is for editing/review; export production assets from their local rest origin.
"""
import argparse
import json
import math
from pathlib import Path
import sys
import bpy
from mathutils import Vector, Quaternion


def add(path,label,group,index,spacing):
    existing=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects=list(set(bpy.data.objects)-existing)
    coll=bpy.data.collections.new(label);group.children.link(coll)
    holder=bpy.data.objects.new('Review '+label,None);coll.objects.link(holder)
    holder.location=((index%8)*spacing,(index//8)*spacing,0)
    holder['source']=str(path);holder['units']='metres';holder['exportNote']='Use local source origin, not the spaced review holder'
    for ob in objects:
        for c in list(ob.users_collection):c.objects.unlink(ob)
        coll.objects.link(ob)
        if not ob.parent:ob.parent=holder
    # Fold the long straight export arms into a useful review pose without altering source files.
    lookup={o.name.split('.')[0]:o for o in objects}
    if all(k in lookup for k in ['Boom','Stick','Bucket']):
        # Source Blender GLBs restore Z-up local data; runtime exporter retains Y-up.
        runtime=path.name.startswith('catalogue-')
        for key,angle in [('Boom',-.55),('Stick',1.6),('Bucket',1.3),('BucketLink',-(.55*-1.3+1.9))]:
            joint=next((o for o in objects if o.name.split('.')[0]==key),None)
            if joint:
                joint.rotation_mode='XYZ'
                if runtime:joint.rotation_euler.z=-angle
                else:joint.rotation_euler.y=angle
        bpy.context.view_layer.update()
        # Imported instances have suffixed names; aim within this machine only.
        for name in ['BoomRam','StickRam','BucketRam']:
            barrel,rod=lookup.get(name),lookup.get(name+'Rod')
            if barrel and rod:
                for ob,other in [(barrel,rod),(rod,barrel)]:
                    target=ob.parent.matrix_world.inverted() @ other.matrix_world.translation
                    delta=target-ob.location
                    ob.rotation_mode='QUATERNION';ob.rotation_quaternion=delta.to_track_quat('X','Y')
                bpy.context.view_layer.update()
    for ob in objects:
        if ob.name.split('.')[0]=='TrackShoe':ob.hide_render=True;ob.hide_set(True)
    return {'label':label,'source':path.name,'objects':len(objects),'meshes':sum(o.type=='MESH' for o in objects)}


def main():
    p=argparse.ArgumentParser();p.add_argument('--variants',required=True);p.add_argument('--out',required=True)
    args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    base=Path(__file__).resolve().parent.parent/'assets/models';variants=Path(args.variants).resolve()
    bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene;scene.unit_settings.system='METRIC'
    source=bpy.data.collections.new('01 Blender source library');scene.collection.children.link(source)
    catalogue=bpy.data.collections.new('02 Assembled game catalogue');scene.collection.children.link(catalogue)
    report=[]
    for i,name in enumerate(json.loads((base/'manifest.json').read_text())['models']):
        report.append(add(base/(name+'.glb'),name,source,i,32))
    for i,m in enumerate(json.loads((variants/'catalogue.json').read_text())):
        row=add(variants/m['file'],m['name'],catalogue,i,14)
        # Put catalogue in front of the library, so Blender opens on the playable machinery.
        holder=catalogue.children[-1].objects.get('Review '+m['name']);holder.location.y-=65
        report.append(row)
    # Pack maps so the editable deliverable does not depend on temporary export files.
    for image in bpy.data.images:
        if image.has_data:image.pack()
    bpy.ops.object.select_all(action='DESELECT')
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                area.spaces.active.shading.type='MATERIAL'
                area.spaces.active.region_3d.view_location=Vector((38,-52,1.2))
                area.spaces.active.region_3d.view_distance=78
                area.spaces.active.region_3d.view_rotation=Quaternion((.82,.38,.18,.38)).normalized()
                area.spaces.active.clip_end=1000
    bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
    out.with_suffix('.json').write_text(json.dumps({'sources':len(source.children),'assemblies':len(catalogue.children),'models':report},indent=2))
    print('BLENDER_CATALOGUE_READY',len(report),out,flush=True)


if __name__=='__main__':main()

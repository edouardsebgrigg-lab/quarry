"""Reopen a packed catalogue and verify completeness, images and hydraulic alignment.

blender -b --python blender/verify_catalogue.py -- /path/to/catalogue.blend
"""
import bpy,json,math,sys
from pathlib import Path
path=Path(sys.argv[-1]);bpy.ops.wm.open_mainfile(filepath=str(path));bpy.context.view_layer.update()
roots=[c for c in bpy.data.collections if c.name in ['01 Blender source library','02 Assembled game catalogue']]
assert sorted(len(c.children) for c in roots)==[19,42]
images=[i for i in bpy.data.images if i.source=='FILE'];assert images and all(i.packed_file for i in images)
errors=[];rams=0
for group in roots:
 for coll in group.children:
  nodes={o.name.split('.')[0]:o for o in coll.objects}
  for name in ['BoomRam','StickRam','BucketRam']:
   barrel,rod=nodes.get(name),nodes.get(name+'Rod')
   if not barrel or not rod:continue
   for ob,other in [(barrel,rod),(rod,barrel)]:
    direction=(other.matrix_world.translation-ob.matrix_world.translation).normalized()
    actual=(ob.matrix_world.to_3x3() @ __import__('mathutils').Vector((1,0,0))).normalized()
    if actual.dot(direction)<.999:errors.append((coll.name,name,actual.dot(direction)))
   rams+=1
assert not errors,errors
report={'reopened':True,'sources':42,'assemblies':19,'packedImages':len(images),'alignedRamPairs':rams,'errors':errors}
path.with_name('quarry-blender-verification.json').write_text(json.dumps(report,indent=2));print('BLENDER_REOPEN_PASS',report)

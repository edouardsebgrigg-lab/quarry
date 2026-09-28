"""Renders the main-menu background (assets/ui/menu.jpg): the excavator loading a truck
at a quarry face in low evening light. Run like build_models.py."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
import lib  # noqa: E402
import textures as tex  # noqa: E402
import truck  # noqa: E402
import excavator  # noqa: E402
import props  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui', 'menu.jpg')


def main(samples=96, size=(1920, 1080)):
    lib.reset_scene()
    lib._images.clear()

    # Excavator in front, arm swung over the truck bed as if dumping a bucket.
    ex = excavator.build('used')
    ex.location = (6.0, -4.0, 0)
    ex.rotation_euler = (0, 0, math.radians(-23))
    bpy.data.objects['House'].rotation_euler = (0, 0, math.radians(83))
    excavator.pose(ex, boom=0.3, stick=-0.95, bucket=0.5)

    tr = truck.build('used')
    tr.location = (10.0, 1.0, 1.3)
    tr.rotation_euler = (0, 0, math.radians(-30))
    load = lib.mesh_object('Load', lib.bm_lathe([(1.0, 0), (0.7, 0.35), (0.3, 0.6), (0.0, 0.66)], 32, 'Z'), None,
                           bpy.data.objects['BedPivot'])
    load.location = (2.1, 0, 0.1)
    load.scale = (2.0, 1.05, 1.0)

    rock = lib.material('RockFace', (0.72, 0.64, 0.54), 'rock', props.rock_texture, 512, roughness=0.95, vertex_color=False)
    gravel = lib.material('Gravel', (0.62, 0.56, 0.48), 'concrete', tex.concrete, 512, roughness=0.95, vertex_color=False)
    bpy.data.objects['Load'].data.materials.append(lib.material('LoadMat', (0.6, 0.57, 0.53), 'rock', props.rock_texture, 512, 0.95, vertex_color=False))
    ground = lib.mesh_object('Ground', lib.bm_box((200, 200, 0.2), (0, 0, -0.1)), gravel)
    lib.box_uv(ground, 4)
    # Stepped quarry face behind the machines.
    for i, (x, h) in enumerate([(-9, 3.0), (-14, 6.0), (-19, 9.5)]):
        bench = lib.mesh_object(f'Bench{i}', lib.bm_box((6, 60, h), (x, 0, h / 2)), rock)
        lib.finish(bench, 0.4, 2, uv_scale=3, dirt=False)
    for i, (x, y, s) in enumerate([(-4, 6, 1.6), (-5.5, -4, 1.1), (1, 10, 0.9), (13, 5, 1.3), (-2, -9, 1.8), (15, -6, 0.7)]):
        b = props.boulder(i + 5)
        b.location = (x, y, 0)
        b.scale = (s, s, s)
    # A heap of gravel beside the truck.
    heap = lib.mesh_object('Heap', lib.bm_lathe([(4.5, 0), (3.0, 1.2), (1.0, 2.2), (0.0, 2.4)], 40, 'Z'), rock)
    heap.location = (-3, 12, 0)
    lib.finish(heap, 0, uv_scale=2, dirt=False)

    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.view_settings.exposure = -0.6
    world = bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    sky.sun_elevation = math.radians(14)
    sky.sun_rotation = math.radians(45)
    sky.sun_disc = False
    world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.25
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
    sun.data.energy = 4.0
    sun.data.color = (1.0, 0.78, 0.55)
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(74), 0, math.radians(135))  # low, from the side
    lib.link(sun)

    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.lens = 35
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = 18
    cam.data.dof.aperture_fstop = 6.3
    cam.location = (14, -21, 3.4)
    target = Vector((5.0, -3.0, 2.4))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    lib.link(cam)
    scene.camera = cam
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 82
    scene.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print('rendered', OUT)


if __name__ == '__main__':
    fast = '--fast' in sys.argv
    main(samples=16 if fast else 96, size=(960, 540) if fast else (1920, 1080))

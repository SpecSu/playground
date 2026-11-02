"""Render runtime-baked backflip strips, without browser/audio or asset changes.
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/render_backflip.py -- [output-dir] [kind ...]
Side strips face screen-right: backward rotation must initially carry the head left.
"""
import sys
from math import pi
from pathlib import Path
import bpy
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
root = Path(args[0]) if args else Path(__file__).resolve().parents[3] / 'avatar-offline-previews' / 'backflip'
requested_kinds = [arg for arg in args[1:] if not arg.startswith('--')]
kinds = requested_kinds if requested_kinds else ['human-subeike', 'banana-cat', 'capybara', 'sword-shield-dog', 'monster-tower']
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root / 'backflip-poses.glb'))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.use_denoising = False; scene.cycles.max_bounces = 3
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.68, .72, .81, 1); background.inputs['Strength'].default_value = .5
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
wrappers = [obj for obj in scene.objects if '-backflip-' in obj.name and obj.type == 'EMPTY']
for obj in wrappers:
    obj.location.y = 0
    # glTF imports nodes in quaternion mode; Euler edits otherwise do nothing.
    obj.rotation_mode = 'XYZ'
floor = bpy.data.materials.new('Soft matte'); floor.diffuse_color = (.62, .64, .69, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035)); bpy.context.object.data.materials.append(floor)
for name, location, power, color, size in [('Key', (-4, -7, 9), 2200, (1, .91, .83), 9), ('Fill', (6, -4, 7), 1800, (.80, .88, 1), 8), ('Rim', (0, 4, 9), 2600, (.84, .9, 1), 10)]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Actual runtime backflip'); camera = bpy.data.objects.new('Actual runtime backflip', data)
scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'; data.ortho_scale = 25.8
camera.location = (0, -26, 5.1); camera.rotation_euler = (Vector((0, 0, 1.65)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = 3300; scene.render.resolution_y = 600; scene.render.resolution_percentage = 100
for kind in kinds:
    for obj in meshes: obj.hide_render = not obj.name.startswith(kind + '-backflip-')
    for angle, label in ([(pi / 2, 'side')] if '--only-side' in args else [(0, 'front'), (pi / 2, 'side')]):
        for obj in wrappers: obj.rotation_euler.z = angle
        scene.render.filepath = str(root / (kind + '-backflip-' + label + '.png'))
        bpy.ops.render.render(write_still=True)
        print('BACKFLIP_STRIP_READY', scene.render.filepath, flush=True)

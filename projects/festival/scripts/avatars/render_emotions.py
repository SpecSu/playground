"""Render baked runtime emotion strips without browser/audio or shipping asset edits.
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/render_emotions.py -- [output-dir]
"""
import json
import sys
from math import pi
from pathlib import Path
import bpy
from mathutils import Vector
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
root = Path(args[0]) if args else Path(__file__).resolve().parents[3] / 'avatar-offline-previews' / 'emotions'
metadata = json.loads((root / 'emotion-preview.json').read_text())
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root / 'emotion-poses.glb'))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 12; scene.cycles.use_denoising = False; scene.cycles.max_bounces = 3
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.68, .72, .81, 1); background.inputs['Strength'].default_value = .5
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
wrappers = [obj for obj in scene.objects if '-emotion-' in obj.name and obj.type == 'EMPTY']
for obj in wrappers:
    obj.rotation_mode = 'XYZ'; obj.rotation_euler.z = pi / 4
floor = bpy.data.materials.new('Soft matte'); floor.diffuse_color = (.62, .64, .69, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035)); bpy.context.object.data.materials.append(floor)
for name, location, power, color, size in [('Key', (-4, -7, 9), 2000, (1, .91, .83), 9), ('Fill', (6, -4, 7), 1600, (.80, .88, 1), 8), ('Rim', (0, 4, 9), 2200, (.84, .9, 1), 10)]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Actual runtime emotions'); camera = bpy.data.objects.new('Actual runtime emotions', data)
scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'; data.ortho_scale = max(13.3, len(metadata['samplesMs']) * 2.1 + .7)
camera.location = (0, -22, 4.5); camera.rotation_euler = (Vector((0, 0, 1.05)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = len(metadata['samplesMs']) * 350; scene.render.resolution_y = 520; scene.render.resolution_percentage = 100
for kind in ([] if '--only-side' in args else metadata['kinds']):
    for action in metadata['actions']:
        for obj in meshes: obj.hide_render = not obj.name.startswith(kind + '-emotion-' + action + '-')
        scene.render.filepath = str(root / (kind + '-emotion-' + action + '.png'))
        bpy.ops.render.render(write_still=True)
        print('EMOTION_STRIP_READY', scene.render.filepath, flush=True)

# Side-on attack evidence makes the +Z fist extension unambiguous.
for obj in wrappers: obj.rotation_euler.z = pi / 2
for kind in ([] if '--skip-side' in args else metadata['kinds']):
    for obj in meshes: obj.hide_render = not obj.name.startswith(kind + '-emotion-punch-')
    scene.render.filepath = str(root / (kind + '-emotion-punch-side.png'))
    bpy.ops.render.render(write_still=True)
    print('EMOTION_SIDE_READY', scene.render.filepath, flush=True)

"""Offline still review of baked runtime poses, without any browser/audio.
blender -b -t 4 -P scripts/avatars/render_elastic_sequence.py
Outputs one strip per species; beat samples run left to right 0..0.875.
"""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[3] / 'avatar-offline-previews' / 'elastic-motion'
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'elastic-dance-contact-sheet.glb'))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = False; scene.cycles.max_bounces = 3
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.68, .72, .81, 1); background.inputs['Strength'].default_value = .4
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
for obj in scene.objects:
    if '-beat-' in obj.name and obj.type == 'EMPTY': obj.location.y = 0
floor = bpy.data.materials.new('Soft matte'); floor.diffuse_color = (.62, .64, .69, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035)); bpy.context.object.data.materials.append(floor)
for name, location, power, color, size in [('Key', (-4, -7, 9), 2200, (1, .91, .83), 9), ('Fill', (6, -4, 7), 1800, (.80, .88, 1), 8), ('Rim', (0, 4, 9), 2600, (.84, .9, 1), 10)]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Actual runtime pose review'); camera = bpy.data.objects.new('Actual runtime pose review', data)
scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'; data.ortho_scale = 17.2
camera.location = (0, -22, 6); camera.rotation_euler = (Vector((0, 0, 1.35)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = 2400; scene.render.resolution_y = 530; scene.render.resolution_percentage = 100
for kind in ['human-jiji', 'human-subeike', 'human-lx', 'frog', 'capybara', 'panda', 'monster-blob', 'dj-cockatoo']:
    for obj in meshes: obj.hide_render = not obj.name.startswith(kind + '-beat-')
    scene.render.filepath = str(ROOT / (kind + '-sequence.png'))
    bpy.ops.render.render(write_still=True)
    print('SEQUENCE_READY', scene.render.filepath, flush=True)

"""Offline still review of baked runtime poses, without any browser/audio.
blender -b -t 4 -P scripts/avatars/meme-cast/render_motion_review.py -- /absolute/review-directory
Outputs one strip per species: three dance beats, bounce, wave and manual walking.
"""
import bpy
from pathlib import Path
from mathutils import Vector
import sys
ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'actual-runtime-poses.glb'))
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.use_denoising = False; scene.cycles.max_bounces = 3
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
scene.world.use_nodes = True
background = scene.world.node_tree.nodes['Background']
background.inputs['Color'].default_value = (.68, .72, .81, 1); background.inputs['Strength'].default_value = .4
meshes = [obj for obj in scene.objects if obj.type == 'MESH']
for obj in scene.objects:
    if '-pose-' in obj.name and obj.type == 'EMPTY': obj.location.y = 0
floor = bpy.data.materials.new('Soft matte'); floor.diffuse_color = (.62, .64, .69, 1)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035)); bpy.context.object.data.materials.append(floor)
for name, location, power, color, size in [('Key', (-4, -7, 9), 2200, (1, .91, .83), 9), ('Fill', (6, -4, 7), 1800, (.80, .88, 1), 8), ('Rim', (0, 4, 9), 2600, (.84, .9, 1), 10)]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = power; data.color = color; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = location
    obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('Actual runtime pose review'); camera = bpy.data.objects.new('Actual runtime pose review', data)
scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'; data.ortho_scale = 11.8
camera.location = (0, -22, 6); camera.rotation_euler = (Vector((0, 0, 1.35)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.resolution_x = 1800; scene.render.resolution_y = 520; scene.render.resolution_percentage = 100
for kind in ['banana-cat', 'sword-shield-dog']:
    for obj in meshes: obj.hide_render = not obj.name.startswith(kind + '-pose-')
    scene.render.filepath = str(ROOT / (kind + '-sequence.png'))
    bpy.ops.render.render(write_still=True)
    print('SEQUENCE_READY', scene.render.filepath, flush=True)

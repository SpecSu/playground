"""Blender QA renders of exact runtime-baked skins and construction tools.
Run: /usr/bin/blender -b -t 4 -P scripts/avatars/festival-v033/render-runtime-poses.py
No browser, source asset edits, body rescaling, or pose corrections are used.
QA_ROOT overrides .local-qa/v033. QA_ONLY can select one output stem.
"""
from pathlib import Path
import json
import hashlib
import math
import os
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(os.environ.get('QA_ROOT', '.local-qa/v033')).resolve()
ROWS = [
    ['milk-frog', 'niulai', 'feidudu'],
    ['miaocuijiao', 'banana-cat', 'sword-shield-dog'],
    ['human-lx', 'human-kelly', 'human-bear'],
    ['human-subeike', 'human-jiji', 'human-jiaxin'],
]
POSES = ['walking', 'build-high', 'build-strike', 'celebration']
JOBS = [(f'{pose}-row-{row + 1}', pose, kinds, False) for pose in POSES for row, kinds in enumerate(ROWS)]
JOBS += [(f'{kind}-{pose}-detail', pose, [kind], True) for kind in ROWS[0] + ROWS[1] for pose in ['build-high', 'build-strike']]
JOBS += [(f'niulai-{pose}-detail', pose, ['niulai'], True) for pose in ['walking', 'celebration']]
JOBS += [(f'{kind}-celebration-detail', 'celebration', [kind], True) for kind in ['miaocuijiao', 'human-jiji']]
# Check the previously problematic short-legged cat first, then complete every job.
priority = ['celebration-row-2', 'miaocuijiao-celebration-detail']
JOBS = sorted(JOBS, key=lambda job: priority.index(job[0]) if job[0] in priority else len(priority))
report = []
runtime_metrics = json.loads((ROOT / 'runtime-pose-metrics.json').read_text())

def material(name, rgba):
    result = bpy.data.materials.new(name)
    result.diffuse_color = rgba
    result.use_nodes = True
    result.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = rgba
    result.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .9
    return result

for stem, pose, kinds, detail in JOBS:
    if os.environ.get('QA_ONLY') and os.environ['QA_ONLY'] != stem:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    imported = []
    for i, kind in enumerate(kinds):
        before = set(bpy.context.scene.objects)
        bpy.ops.import_scene.gltf(filepath=str(ROOT / f'{kind}-{pose}.glb'))
        objects = [obj for obj in bpy.context.scene.objects if obj not in before]
        for obj in objects:
            if obj.parent is None:
                obj.location.x += (i - (len(kinds) - 1) / 2) * 4.1
        imported.extend(obj for obj in objects if obj.type == 'MESH')
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 20
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 3
    sc.render.resolution_x = 1000 if detail else 1600
    sc.render.resolution_y = 1000 if detail else 720
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new('QA Studio')
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.18, .20, .24, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.05))
    bpy.context.object.name = 'QA Studio Floor'
    bpy.context.object.data.materials.append(material('QA sand-grey', (.24, .22, .19, 1)))
    for name, loc, power, size in [
        ('Key', (-5, -6, 8), 1700, 6),
        ('Fill', (5, -3, 6), 1200, 5),
        ('Rim', (0, 5, 7), 1800, 5),
    ]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.name = name
        light.data.energy = power
        light.data.size = size
        light.rotation_euler = (Vector((0, 0, 1.4)) - light.location).to_track_quat('-Z', 'Y').to_euler()
    # Negative X exposes the right-hand hammer rather than placing it behind the face.
    bpy.ops.object.camera_add(location=(-4.1, -8.0, 3.5) if detail else (0, -12, 4.7))
    camera = bpy.context.object
    target = Vector((0, 0, 1.5 if detail else 1.55))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 4.7 if detail else 12.3
    sc.camera = camera
    bpy.context.view_layer.update()
    projected = [world_to_camera_view(sc, camera, obj.matrix_world @ vertex.co) for obj in imported for vertex in obj.data.vertices]
    extent = {'min': [min(p[i] for p in projected) for i in range(3)], 'max': [max(p[i] for p in projected) for i in range(3)]}
    assert extent['min'][0] >= 0 and extent['max'][0] <= 1 and extent['min'][1] >= 0 and extent['max'][1] <= 1, (stem, 'geometry outside frame', extent)
    # Fixed-scene framing makes the cow's 3m scene stature directly comparable.
    # Labels are rendered separately in world space and do not alter imported meshes.
    label_mat = material('QA labels', (.93, .91, .84, 1))
    for i, kind in enumerate(kinds):
        bpy.ops.object.text_add(location=((i - (len(kinds) - 1) / 2) * 4.1, -1.8, -.01))
        text = bpy.context.object
        text.data.body = kind
        text.data.align_x = 'CENTER'
        text.data.size = .125 if detail else .18
        text.rotation_euler = camera.rotation_euler
        text.data.materials.append(label_mat)
    sc.render.filepath = str(ROOT / f'{stem}.png')
    bpy.ops.render.render(write_still=True)
    input_hashes = {f'{kind}-{pose}.glb': hashlib.sha256((ROOT / f'{kind}-{pose}.glb').read_bytes()).hexdigest() for kind in kinds}
    report.append({'image': f'{stem}.png', 'pose': pose, 'cast': kinds, 'detail': detail, 'meshCount': len(imported), 'resolution': [sc.render.resolution_x, sc.render.resolution_y], 'camera': list(camera.location), 'orthoScale': camera.data.ortho_scale, 'geometryFrameBounds': extent, 'allImportedGeometryInFrame': True, 'runtimeSourceHashes': runtime_metrics['sourceHashes'], 'inputGlbHashes': input_hashes})
    (ROOT / ('render-report-' + (os.environ.get('QA_ONLY') or 'all') + '.json')).write_text(json.dumps(report, indent=2))
    print('QA_RENDER_DONE', stem, flush=True)

print('QA_RENDER_FINISHED', len(report), flush=True)

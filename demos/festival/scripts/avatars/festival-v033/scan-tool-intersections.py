"""Diagnostic only: inspect hammer-head surface intersections and inside samples.
Run: /usr/bin/blender -b -t 2 -P scripts/avatars/festival-v033/scan-tool-intersections.py
The baked input is actual runtime skin. This reports findings without adjusting poses,
source geometry, or pass thresholds. Grip/handle contact at the hand is expected.
Ray parity is diagnostic because uploaded surfaces may not be perfectly watertight.
"""
from pathlib import Path
import json
import os
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(os.environ.get('QA_ROOT', '.local-qa/v033')).resolve()
metrics = json.loads((ROOT / 'runtime-pose-metrics.json').read_text())
results = []
directions = [Vector((1, .231, .417)).normalized(), Vector((-.321, 1, .159)).normalized(), Vector((.183, -.247, 1)).normalized()]

def tree(obj):
    return BVHTree.FromPolygons([obj.matrix_world @ v.co for v in obj.data.vertices], [list(p.vertices) for p in obj.data.polygons], all_triangles=True)

def ray_count(bvh, point, direction):
    origin, count = point.copy(), 0
    for _ in range(300):
        position, _, _, _ = bvh.ray_cast(origin, direction, 100)
        if position is None:
            return count
        count += 1
        origin = position + direction * .00001
    raise RuntimeError('Ray cast did not terminate')

for snapshot in metrics['snapshots']:
    if not snapshot['pose'].startswith('build'):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT / snapshot['file']))
    bpy.context.view_layer.update()
    body = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name.startswith('tripo'))
    head = next(obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and obj.name == 'festival-builder-hammer-head')
    body_tree, head_tree = tree(body), tree(head)
    unique_corners = list({tuple(head.matrix_world @ v.co) for v in head.data.vertices})
    center = sum((Vector(p) for p in unique_corners), Vector()) / len(unique_corners)
    samples = [('center', center)] + [('corner-' + str(i), Vector(p)) for i, p in enumerate(unique_corners)]
    sample_report = []
    for name, point in samples:
        counts = [ray_count(body_tree, point, direction) for direction in directions]
        nearest, _, _, distance = body_tree.find_nearest(point)
        sample_report.append({'sample': name, 'position': list(point), 'rayCrossingCounts': counts, 'allThreeOdd': all(count % 2 for count in counts), 'nearestBodySurfaceDistance': distance})
    result = {'kind': snapshot['kind'], 'pose': snapshot['pose'], 'file': snapshot['file'], 'headBodySurfaceOverlapPairs': len(body_tree.overlap(head_tree)), 'headSamplesInsideAllThreeRays': sum(sample['allThreeOdd'] for sample in sample_report), 'samples': sample_report}
    results.append(result)
    print('TOOL_SCAN', result['kind'], result['pose'], result['headBodySurfaceOverlapPairs'], result['headSamplesInsideAllThreeRays'], flush=True)
(ROOT / 'tool-intersections.json').write_text(json.dumps({'diagnosticOnly': True, 'caveat': 'Surface overlap pairs and three-ray inside parity should be interpreted with rendered views; no watertightness assumption is asserted.', 'snapshots': results}, indent=2))

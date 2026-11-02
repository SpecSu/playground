#!/usr/bin/env python3
"""Private, offline GLB inspection and studio rendering with Blender.

Usage:
  blender -b --factory-startup --python scripts/render_character.py -- \
    --input ../dance-stage-work/tripo/lx-base.glb --output ../dance-stage-work/checkpoints
  python scripts/render_character.py --self-test

Source assets are never changed. All image outputs are actual Blender renders.
"""
import argparse
import json
import math
import sys
from pathlib import Path


def bounds_from_points(points):
    points = list(points)
    if not points:
        raise ValueError('Cannot measure an empty mesh')
    low = [min(p[i] for p in points) for i in range(3)]
    high = [max(p[i] for p in points) for i in range(3)]
    return {'min': low, 'max': high, 'size': [high[i] - low[i] for i in range(3)],
            'center': [(high[i] + low[i]) / 2 for i in range(3)]}


def camera_basis(front_axis):
    # Coordinates below: (screen-right, toward-viewer, up).
    return {'+x': ((0, 1, 0), (1, 0, 0)), '-x': ((0, -1, 0), (-1, 0, 0)),
            '+y': ((-1, 0, 0), (0, 1, 0)), '-y': ((1, 0, 0), (0, -1, 0))}[front_axis]


def self_test():
    assert bounds_from_points([(0, -2, 1), (2, 4, 5)]) == {
        'min': [0, -2, 1], 'max': [2, 4, 5], 'size': [2, 6, 4], 'center': [1, 1, 3]}
    try:
        bounds_from_points([])
        raise AssertionError('Empty bounds must fail')
    except ValueError:
        pass
    assert camera_basis('+x')[1] == (1, 0, 0)
    assert camera_basis('-y')[0] == (1, 0, 0)
    print('render_character: 4 geometry helper assertions passed')


def render(args):
    import bpy
    from mathutils import Vector

    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if not source.is_file():
        raise FileNotFoundError(source)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    if args.rest:
        for obj in scene.objects:
            if obj.type == 'ARMATURE': obj.data.pose_position = 'REST'
        bpy.context.view_layer.update()
    meshes = [obj for obj in scene.objects if obj.type == 'MESH' and not obj.hide_render and not all(c.hide_render for c in obj.users_collection)]
    bounds = bounds_from_points([tuple(obj.matrix_world @ Vector(corner)) for obj in meshes for corner in obj.bound_box])
    size, center = bounds['size'], bounds['center']
    height = size[2] * args.framing_height_multiplier
    if height <= 0:
        raise ValueError('Model has zero vertical extent')
    front_axis = args.front_axis or ('+x' if size[0] < size[1] else '-y')
    right, forward = [Vector(v) for v in camera_basis(front_axis)]
    floor_z = bounds['min'][2]
    origin = Vector((center[0], center[1], floor_z))
    def at(rightness, forwardness, up):
        return origin + height * (right * rightness + forward * forwardness + Vector((0, 0, up)))

    material_metrics = []
    materials = {m.name: m for obj in meshes for m in obj.data.materials if m}
    for material in materials.values():
        textures = []
        if material.use_nodes:
            for node in material.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    image = node.image
                    textures.append({'node': node.name, 'image': image.name, 'size': list(image.size),
                                     'channels': image.channels, 'colorspace': image.colorspace_settings.name,
                                     'packed': bool(image.packed_file), 'source': image.source})
        material_metrics.append({'name': material.name, 'use_nodes': material.use_nodes,
                                 'diffuse_color': list(material.diffuse_color), 'textures': textures})
    mesh_metrics = []
    for obj in meshes:
        obj.data.calc_loop_triangles()
        mesh_metrics.append({'name': obj.name, 'vertices': len(obj.data.vertices), 'edges': len(obj.data.edges),
                             'polygons': len(obj.data.polygons), 'triangles': len(obj.data.loop_triangles),
                             'uv_layers': [uv.name for uv in obj.data.uv_layers],
                             'material_slots': [m.name if m else None for m in obj.data.materials],
                             'vertex_groups': len(obj.vertex_groups),
                             'modifiers': [{'name': m.name, 'type': m.type} for m in obj.modifiers]})
    metrics = {'source': str(source), 'source_bytes': source.stat().st_size, 'bounds_world': bounds,
               'mesh_count': len(meshes), 'meshes': mesh_metrics,
               'vertices': sum(m['vertices'] for m in mesh_metrics),
               'triangles': sum(m['triangles'] for m in mesh_metrics),
               'armatures': [{'name': o.name, 'bones': len(o.data.bones)} for o in scene.objects if o.type == 'ARMATURE'],
               'materials': material_metrics, 'front_axis': front_axis,
               'renderer': 'CYCLES CPU', 'denoising': False, 'samples': args.samples, 'resolution': args.resolution,
               'framing_height_multiplier': args.framing_height_multiplier,
               'images': [], 'note': 'Unmodified imported mesh/materials; studio lighting only; no post image generation.'}

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = args.samples
    scene.cycles.use_denoising = False  # Host Blender has no OpenImageDenoise build.
    scene.cycles.max_bounces = 5
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 3
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = args.threads
    scene.render.resolution_x = round(args.resolution * .75) if args.costume_preview else args.resolution
    scene.render.resolution_y = args.resolution
    scene.render.resolution_percentage = 100
    metrics['dimensions'] = [scene.render.resolution_x, scene.render.resolution_y]
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs[0].default_value = (0.48, 0.49, 0.52, 1)
    scene.world.node_tree.nodes.get('Background').inputs[1].default_value = 0.35
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    bpy.ops.mesh.primitive_plane_add(size=height * 200, location=(center[0], center[1], floor_z - height * .003))
    plane = bpy.context.object
    plane.name = 'Studio ground (render only)'
    matte = bpy.data.materials.new('Studio slate' if args.costume_preview else 'Studio ivory')
    ground_color = (.105, .125, .16, 1) if args.costume_preview else (.57, .57, .55, 1)
    matte.diffuse_color = ground_color
    matte.use_nodes = True
    shader = matte.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = ground_color
    shader.inputs['Roughness'].default_value = .85
    plane.data.materials.append(matte)

    def point_at(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    def area(name, position, energy, scale, color):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy = energy * height * height
        data.shape = 'DISK'
        data.size = scale * height
        data.color = color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = at(*position)
        point_at(obj, at(0, 0, .65))
    area('Key softbox', (-1.2, 1.7, 2.0), 90, 1.2, (1, .94, .88))
    area('Fill softbox', (1.4, 1.0, 1.1), 45, 1.5, (.88, .94, 1))
    area('Rim softbox', (.5, -1.1, 1.6), 100, 1, (1, 1, 1))
    camera_data = bpy.data.cameras.new('Inspection camera')
    camera = bpy.data.objects.new('Inspection camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = 'ORTHO'
    camera.data.clip_start = height * .005
    camera.data.clip_end = height * 500
    stem = source.stem
    suffix = f'-{front_axis.replace("+", "pos").replace("-", "neg")}' if args.axis_suffix else ''
    # Square neutral studio images: silhouette and face texture inspection.
    framings = [('head', (0, 3.2, args.head_center+.01, args.head_center, args.head_scale))] if args.head_only else [('fullbody', (0, 3.2, .56, .51, 1.12)), ('head', (0, 3.2, args.head_center+.01, args.head_center, args.head_scale))]
    if args.costume_preview:
        # Keep boots, hems and shoulder silhouettes visible in outfit selection.
        framings = [('costume', (0, 3.2, .56, .50, 1.10))]
    for label, framing in framings:
        x, depth, elevation, target_height, scale = framing
        angle=math.radians(args.angle)
        camera.location = at(x+math.sin(angle)*depth, math.cos(angle)*depth, elevation)
        point_at(camera, at(0, 0, target_height))
        camera.data.ortho_scale = height * scale
        image_path = output / f'{stem}-{label}{suffix}.png'
        scene.render.filepath = str(image_path)
        bpy.ops.render.render(write_still=True)
        metrics['images'].append({'kind': label, 'path': str(image_path), 'camera': list(camera.location), 'ortho_scale': camera.data.ortho_scale})
    metrics_path = output / f'{stem}-metrics{suffix}.json'
    metrics_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + '\n')
    print('INSPECTION_COMPLETE ' + str(metrics_path), flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--self-test', action='store_true')
    parser.add_argument('--input')
    parser.add_argument('--output', default='dance-stage-work/checkpoints')
    parser.add_argument('--resolution', type=int, default=1024)
    parser.add_argument('--samples', type=int, default=32)
    parser.add_argument('--threads', type=int, default=4)
    parser.add_argument('--front-axis', choices=['+x', '-x', '+y', '-y'])
    parser.add_argument('--axis-suffix', action='store_true')
    parser.add_argument('--rest', action='store_true', help='Render imported armatures in rest pose')
    parser.add_argument('--head-only', action='store_true')
    parser.add_argument('--costume-preview', action='store_true', help='Full-costume 3:4 portrait on a contrasting slate studio floor')
    parser.add_argument('--head-center', type=float, default=.90, help='Head target as fraction of model height from bottom')
    parser.add_argument('--head-scale', type=float, default=.26, help='Head orthographic framing as fraction of model height')
    parser.add_argument('--framing-height-multiplier', type=float, default=1.0, help='Reserve reference silhouette height after headwear removal; never change model geometry')
    parser.add_argument('--angle', type=float, default=0, help='Horizontal orbit angle in degrees from front')
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return
    if not args.input:
        parser.error('--input required unless --self-test')
    render(args)


if __name__ == '__main__':
    main()

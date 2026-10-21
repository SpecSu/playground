"""Render exact baked 2x runtime skins on the unchanged floor for offline QA.
Prepare with export-runtime-poses.mjs OUTPUT --scene-scale and export-booth.mjs OUTPUT/booth.glb.
Run: blender -b -t 4 -P scripts/avatars/cast-v1/render-scale-stage.py -- OUTPUT
This is a geometry/material review, not a browser screenshot.
"""
import sys
from pathlib import Path
import bpy
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path('/tmp/disco-v051-review')
bpy.ops.wm.read_factory_settings(use_empty=True)
for asset in ['booth.glb','dj-kunkun-dance.glb']:
 bpy.ops.import_scene.gltf(filepath=str(root/asset))
cast=['milk-frog','niulai','feidudu','miaocuijiao','banana-cat','sword-shield-dog','human-lx','human-kelly','human-jiji','human-jiaxin']
for i,kind in enumerate(cast):
 before=set(bpy.data.objects)
 bpy.ops.import_scene.gltf(filepath=str(root/f'{kind}-dance.glb'))
 p=(0,-5.7) if i==0 else ((-3.2 if (i-1)%2==0 else 3.2),-(3.5-((i-1)//2)*3)) if i<9 else (0,5.5)
 for obj in set(bpy.data.objects)-before:
  if obj.parent is None:obj.location.x+=p[0];obj.location.y+=p[1]
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=20;sc.cycles.use_denoising=False;sc.cycles.max_bounces=3
sc.render.resolution_x=1300;sc.render.resolution_y=1000;sc.render.resolution_percentage=100
sc.world=bpy.data.worlds.new('Studio');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.12,.14,.2,1);sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
bpy.ops.mesh.primitive_plane_add(size=18,location=(0,0,-.025));m=bpy.data.materials.new('Floor');m.diffuse_color=(.10,.12,.18,1);bpy.context.object.data.materials.append(m)
for label,loc,power,size in [('Key',(-6,-6,10),2200,8),('Fill',(6,-2,7),1800,7),('Rim',(0,6,8),2000,7)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=label;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1.4))-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(9,-15,12));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.4))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=17;sc.camera=cam
sc.render.filepath=str(root/'stage-crowd-offline.png');bpy.ops.render.render(write_still=True)

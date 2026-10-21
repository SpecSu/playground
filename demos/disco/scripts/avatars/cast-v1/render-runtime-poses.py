"""Render exact runtime-baked textured surfaces with Blender, without a browser.
blender -b -t 4 -P scripts/avatars/cast-v1/render-runtime-poses.py
"""
from pathlib import Path
import os
import bpy
from mathutils import Vector
ROOT=Path('/tmp/disco-cast-review')
rows=[['milk-frog','niulai','feidudu'],['miaocuijiao','banana-cat','sword-shield-dog'],['human-lx','human-kelly','human-bear'],['human-subeike','human-jiji','human-jiaxin'],['dj-kunkun']]
for row,kinds in enumerate(rows):
 if os.getenv('DJ_ONLY') and row != 4:continue
 bpy.ops.wm.read_factory_settings(use_empty=True)
 for i,kind in enumerate(kinds):
  bpy.ops.import_scene.gltf(filepath=str(ROOT/(kind+'-dance.glb')))
  for obj in bpy.context.selected_objects:
   if obj.parent is None:obj.location.x+=(i-(len(kinds)-1)/2)*1.9
 if row==4:
  for obj in bpy.context.scene.objects:
   if obj.type=='MESH':obj.location.z+=.32;obj.location.y+=.28
  bpy.ops.import_scene.gltf(filepath=str(ROOT/'booth.glb'))
 sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=24;sc.cycles.use_denoising=False;sc.cycles.max_bounces=3
 sc.render.resolution_x=1200;sc.render.resolution_y=600 if row==4 else 470;sc.render.resolution_percentage=100
 sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.film_transparent=False
 sc.world=bpy.data.worlds.new('Studio');sc.world.use_nodes=True;sc.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.15,.17,.22,1);sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
 sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast'
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.02));m=bpy.data.materials.new('Floor');m.diffuse_color=(.13,.15,.21,1);bpy.context.object.data.materials.append(m)
 for name,loc,power,size in [('Key',(-3,-4,5),650,5),('Fill',(4,-2,3),420,4),('Rim',(0,3,4),650,4)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(0,-8,2.8 if row!=4 else 3.1));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.0))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.3 if row!=4 else 5.8;sc.camera=cam
 sc.render.filepath=str(ROOT/f'row-{row+1}.png');bpy.ops.render.render(write_still=True);print('ROW_DONE',row+1,flush=True)

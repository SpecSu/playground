"""Render actual exported GLBs at 0/50/100, fixed per-species framing. Offline only."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_botanical import *
species_list=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else list(STANDARD_HEIGHTS)
for species in species_list:
 reset();frozen=[]
 for stage,x in [(0,-1.65),(50,0),(100,1.65)]:
  before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'plants'/f'{species}.glb'));added=set(bpy.context.scene.objects)-before
  bpy.context.scene.frame_set(stage);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get()
  for ob in added:
   if ob.type!='MESH':continue
   ev=ob.evaluated_get(deps);me=bpy.data.meshes.new_from_object(ev,depsgraph=deps);copy=bpy.data.objects.new(f'{species}_{stage}_{ob.name}',me);bpy.context.collection.objects.link(copy);copy.matrix_world=ob.matrix_world.copy();copy.location.x+=x;frozen.append(copy)
  for ob in added:bpy.data.objects.remove(ob,do_unlink=True)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=28;scene.cycles.use_denoising=False;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.45,.45,.45)
 cube('background',(0,0,-.065),(200,200,.10),material('background','#A2BDB3',.9))
 for loc,energy,size in [((-3,-4,7),620,5),((4,-1,4),300,4)]:
  bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.5))-l.location).to_track_quat('-Z','Y').to_euler()
 height=STANDARD_HEIGHTS[species];target=Vector((0,0,height*.43));bpy.ops.object.camera_add(location=(2,-9,5.2));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=5.7;cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=1200;scene.render.resolution_y=720;scene.render.resolution_percentage=100;scene.render.filepath=str(EVIDENCE/f'{species}-stages-offline.png');bpy.ops.render.render(write_still=True)
 print('STAGES_COMPLETE',species,flush=True)

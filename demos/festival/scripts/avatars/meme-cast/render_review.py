"""Offline Cycles rendering of the actual exported/posed GLBs, no browser/audio."""
import argparse,bpy,math,sys
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--asset-dir',type=Path,required=True);p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--samples',type=int,default=48);p.add_argument('--mode',choices=['front','threequarter','pair','posed'],default='pair');p.add_argument('--posed-file',type=Path);a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
a.output_dir.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=a.samples;s.cycles.use_denoising=False;s.cycles.max_bounces=4;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.70,.72,.76,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.40
m=bpy.data.materials.new('warm_porcelain_studio');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.78,.755,.713,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.80
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.018));floor=bpy.context.object;floor.data.materials.append(m)
for name,loc,power,color,size in [('key',(-3,-4,6),850,(1,.93,.85),4),('fill',(4,-1.5,3),600,(.81,.9,1),4),('rim',(2,4,5),1000,(1,.92,.83),3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,.8))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('review_camera');cam=bpy.data.objects.new('review_camera',d);s.collection.objects.link(cam);s.camera=cam;d.type='ORTHO'
def camera(loc,target,scale,w,h):cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;s.render.resolution_x=w;s.render.resolution_y=h;s.render.resolution_percentage=100
if a.mode=='posed':
 bpy.ops.import_scene.gltf(filepath=str(a.posed_file));camera((.1,-12,9),(0,-1.8,.65),10.4,2400,1500)
else:
 for i,kind in enumerate(['banana-cat','sword-shield-dog']):
  previous=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(a.asset_dir/(kind+'.glb')));objects=set(s.objects)-previous;g=bpy.data.objects.new('placement_'+kind,None);s.collection.objects.link(g)
  for o in objects:
   if not o.parent:o.parent=g
  g.location.x=(-.87 if i==0 else .64)
  g.rotation_euler.z= -.42 if a.mode in ['pair','threequarter'] else 0
 camera((0,-10,2.9),(0,0,.87),3.55,1800,1250)
s.render.filepath=str(a.output_dir/('meme-'+a.mode+'.png'));bpy.ops.render.render(write_still=True)

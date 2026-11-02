"""Offline inspection of actual exported GLBs, with no source reference imagery."""
import argparse, bpy, math, sys
from mathutils import Vector
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--asset-dir',type=Path,required=True);p.add_argument('--mode',choices=['humans','animals','portraits','back','species-side','species-three-quarter'],default='humans');p.add_argument('--samples',type=int,default=32);p.add_argument('--output-dir',type=Path);p.add_argument('--denoise',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=a.output_dir or a.asset_dir;OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=a.samples;s.cycles.use_denoising=a.denoise;s.cycles.max_bounces=4;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.62,.66,.73,1);s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
m=bpy.data.materials.new('warm_studio');m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.76,.74,.71,1);m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.9
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.017));floor=bpy.context.object;floor.data.materials.append(m)
for name,loc,power,color,size in [('key',(-3,-5,7),1000,(1,.91,.82),5),('fill',(4,-2,4),700,(.8,.89,1),5),('rim',(2,4,6),1000,(1,.91,.82),5)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
d=bpy.data.cameras.new('review_camera');cam=bpy.data.objects.new('review_camera',d);s.collection.objects.link(cam);s.camera=cam;d.type='ORTHO'
def camera(loc,target,scale,w,h):cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale;s.render.resolution_x=w;s.render.resolution_y=h;s.render.resolution_percentage=100
def load(kind,x=0):
 old=set(s.objects);bpy.ops.import_scene.gltf(filepath=str(a.asset_dir/(kind+'.glb')));objects=[o for o in s.objects if o not in old];g=bpy.data.objects.new('placement',None);s.collection.objects.link(g)
 for o in objects:
  if not o.parent:o.parent=g
 g.location.x=x
 for o in objects:
  if o.get('role')=='dj':o.hide_render=True
 if a.mode=='species-side':g.rotation_euler.z=-math.pi/2
 elif a.mode=='species-three-quarter':g.rotation_euler.z=-.60
 return objects+[g]
humans=['human-jiji','human-subeike','human-lx'];animals=['frog','cat','dog','capybara','panda']
if a.mode in ('humans','back'):
 for i,k in enumerate(humans):load(k,(i-1)*1.40)
 camera((1.4,-10,3.6) if a.mode=='humans' else (2.8,10,4.0),(0,0,1.13),4.9,1600,1100)
elif a.mode in ('animals','species-side','species-three-quarter'):
 for i,k in enumerate(animals):load(k,(i-2)*1.35)
 camera((.0,-12,3.0),(0,0,.92),7.8,2000,900)
else:
 import bmesh
 s.render.film_transparent=True;s.render.image_settings.color_mode='RGBA';floor.hide_render=True
 for k in humans:
  objects=load(k);points=[]
  for o in objects:
   if o.type!='MESH':continue
   head=o.vertex_groups.get('head')
   if head is None:o.hide_render=True;continue
   keep={v.index for v in o.data.vertices if any(g.group==head.index and g.weight>=.5 for g in v.groups)}
   bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.index not in keep],context='VERTS');bm.to_mesh(o.data);bm.free();o.data.update();points.extend(o.matrix_world@v.co for v in o.data.vertices)
  lo=Vector(tuple(min(v[i] for v in points) for i in range(3)));hi=Vector(tuple(max(v[i] for v in points) for i in range(3)));center=(lo+hi)*.5;size=hi-lo;camera(center+Vector((.15,-6,.1)),center,max(size.x,size.z)*1.14,512,512)
  s.render.filepath=str(OUT/(k+'-portrait.png'));bpy.ops.render.render(write_still=True)
  for o in objects:bpy.data.objects.remove(o,do_unlink=True)
if a.mode!='portraits':s.render.filepath=str(OUT/(a.mode+'-review.png'));bpy.ops.render.render(write_still=True)

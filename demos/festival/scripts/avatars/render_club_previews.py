"""Render delivered GLBs/real adapter snapshots using offline Blender, never a browser.
blender -b -t 4 -P scripts/avatars/render_club_previews.py -- --mode cast
Modes: cast, jiji, dj, humans, portraits. All source PNGs stay outside public; run optimize_portraits.py for shipping WebPs.
"""
import bpy, bmesh, sys, math, argparse
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--mode',choices=['cast','jiji','dj','humans','portraits'],default='cast');p.add_argument('--samples',type=int,default=96);args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
ROOT=Path(__file__).resolve().parents[2];WORK=ROOT.parent/'avatar-offline-previews';WORK.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=5;scene.cycles.diffuse_bounces=3;scene.cycles.glossy_bounces=3
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
world=scene.world;world.use_nodes=True;world.node_tree.nodes.get('Background').inputs['Color'].default_value=(.61,.66,.78,1);world.node_tree.nodes.get('Background').inputs['Strength'].default_value=.38
floor=bpy.data.materials.new('Lavender studio floor');floor.use_nodes=True;floor.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.64,.60,.79,1);floor.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.82
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.035));plane=bpy.context.object;plane.name='preview-floor';plane.data.materials.append(floor)
def area(name,loc,power,color,size):
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Key',(0,-6,7),1100,(1,.89,.8),6);area('Blue rim',(5,3,6),1050,(.64,.78,1),5);area('Soft fill',(-5,-2,5),850,(.88,.77,1),5)
data=bpy.data.cameras.new('Model preview camera');cam=bpy.data.objects.new('Model preview camera',data);scene.collection.objects.link(cam);scene.camera=cam;data.type='ORTHO';data.lens=58

def load(path,offset=0):
 old=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(path));new=[ob for ob in scene.objects if ob not in old]
 # A placement wrapper keeps all imported skin and armature objects together.
 group=bpy.data.objects.new('preview-placement',None);scene.collection.objects.link(group)
 for ob in new:
  if ob.parent is None:ob.parent=group
 group.location.x=offset
 return new+[group]
def camera(location,target,scale,width,height):
 cam.location=location;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();data.ortho_scale=scale;scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100

def render(path):
 scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);print('PREVIEW_READY',path,flush=True)

if args.mode in ('cast','jiji','dj'):
 name={'cast':'cast-posed','jiji':'jiji-four-actions','dj':'dj-mixing-poses'}[args.mode];load(WORK/(name+'.glb'))
 if args.mode=='cast':camera((4,-13,8),(0,.5,1.12),10.4,1900,1150)
 elif args.mode=='jiji':camera((2,-11,4.8),(0,0,1.15),7.1,1700,800)
 else:camera((2.4,-10,4.3),(0,0,1.0),5.4,1500,800)
 render(WORK/(name+'.png'))
elif args.mode=='humans':
 for i,kind in enumerate(['human-jiji','human-subeike','human-lx']):load(ROOT/'public'/'avatars'/(kind+'.glb'),(i-1)*1.55)
 camera((2.0,-10,4.3),(0,0,1.08),5.2,1500,1050);render(WORK/'three-humans-final.png')
else:
 output=WORK/'portraits-source';output.mkdir(exist_ok=True)
 scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA';plane.hide_render=True
 scene.cycles.samples=min(args.samples,48)
 for kind in ['human-jiji','human-subeike','human-lx']:
  objects=load(ROOT/'public'/'avatars'/(kind+'.glb'))
  # Derive head-only selector assets from the delivered model's authored skin.
  # This changes imported preview meshes only, never the public GLB or its rig.
  points=[]
  for ob in objects:
   if ob.type!='MESH':continue
   head=ob.vertex_groups.get('head')
   if head is None:ob.hide_render=True;continue
   keep={v.index for v in ob.data.vertices if any(g.group==head.index and g.weight>=.5 for g in v.groups)}
   if not keep:ob.hide_render=True;continue
   mesh=bmesh.new();mesh.from_mesh(ob.data);mesh.verts.ensure_lookup_table()
   bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if v.index not in keep],context='VERTS')
   mesh.to_mesh(ob.data);mesh.free();ob.data.update()
   points.extend(ob.matrix_world@v.co for v in ob.data.vertices)
  if not points:raise RuntimeError('No authored head geometry for '+kind)
  lower=Vector(tuple(min(v[axis] for v in points) for axis in range(3)))
  upper=Vector(tuple(max(v[axis] for v in points) for axis in range(3)))
  center=(lower+upper)*.5;size=upper-lower
  camera(center+Vector((.28,-6,.12)),center,max(size.x,size.z)*1.16,512,512)
  render(output/(kind+'.png'))
  for ob in objects:bpy.data.objects.remove(ob,do_unlink=True)

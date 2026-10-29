#!/usr/bin/env python3
"""Render actual exported GLB necks at front/side/back and real dance poses.
Also measures lower attachment containment in the deformed torso at 17 phases
per clip. Images are Cycles CPU renders, not fabricated browser screenshots.
"""
import bpy,sys,argparse,json,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);p.add_argument('--samples',type=int,default=16);p.add_argument('--resolution',type=int,default=640);p.add_argument('--no-render',action='store_true');args=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(args.input).resolve();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(source));scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');meshes=[o for o in scene.objects if o.type=='MESH' and o.data.materials];head=next(o for o in meshes if 'HEAD' in o.name);body=next(o for o in meshes if o!=head);actions=list(bpy.data.actions)
for track in arm.animation_data.nla_tracks:track.mute=True
arm.data.pose_position='REST';bpy.context.view_layer.update();resthead=arm.matrix_world@arm.data.bones['mixamorig:Head'].head_local
# Bottom ring and bottom cap of the new neck material only.
neck_mat=next(i for i,m in enumerate(head.data.materials) if m.name.startswith('Reconstructed_neck_skin'));neckids={i for f in head.data.polygons if f.material_index==neck_mat for i in f.vertices};bottom=min(head.data.vertices[i].co.z for i in neckids);baseids=[i for i in neckids if abs(head.data.vertices[i].co.z-bottom)<1e-5]
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=4;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=args.resolution;scene.render.resolution_y=args.resolution;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.35,.35,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.view_settings.view_transform='AgX'
def point(o,t):o.rotation_euler=(Vector(t)-o.location).to_track_quat('-Z','Y').to_euler()
lights=[]
for name,pos,power in [('Key',(1.2,-1,1.6),65),('Fill',(1,1,1),55),('Back',(-1,0,1.4),80)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=1.;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);lights.append((o,Vector(pos)))
cam=bpy.data.objects.new('Neck orbit evidence',bpy.data.cameras.new('Neck orbit evidence'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=.40 if source.stem.startswith('lx') else .48;cam.data.clip_start=.005;cam.data.clip_end=100
report={'source':str(source),'base_vertices':len(baseids),'animations':[],'renders':[],'method':'Actual exported GLB, deformed mesh ray containment of bottom attachment ring; 17 phases/clip. No camera occlusion trick.'}
def measure():
 graph=bpy.context.evaluated_depsgraph_get();h=head.evaluated_get(graph);bo=body.evaluated_get(graph);verts=[bo.matrix_world@v.co for v in bo.data.vertices];polys=[tuple(p.vertices) for p in bo.data.polygons];tree=BVHTree.FromPolygons(verts,polys);points=[h.matrix_world@h.data.vertices[i].co for i in baseids];inside=0;distances=[]
 for pos in points:
  near=tree.find_nearest(pos);distances.append(float(near[3] or 0));direction=Vector((.923,.315,.221)).normalized();origin=pos.copy();hits=0
  for _ in range(20):
   hit=tree.ray_cast(origin,direction,3.)
   if hit[0] is None:break
   hits+=1;origin=hit[0]+direction*1e-5
  if hits%2:inside+=1
 return {'inside':inside,'total':len(points),'nearest_distance_min':min(distances),'nearest_distance_max':max(distances)}
def render(label,angle):
 center=arm.matrix_world@arm.pose.bones['mixamorig:Head'].head if arm.data.pose_position=='POSE' else resthead.copy();center.z+=.065 if source.stem.startswith('lx') else .10
 # World orbital angles intentionally expose turns rather than following head yaw.
 rad=math.radians(angle);cam.location=center+Vector((2*math.cos(rad),2*math.sin(rad),.025));point(cam,center)
 for l,offset in lights:l.location=center+offset;point(l,center)
 dest=out/f'{source.stem}-{label}-{angle:03d}.png';scene.render.filepath=str(dest);bpy.ops.render.render(write_still=True);report['renders'].append(str(dest))
if not args.no_render:
 for angle in [0,90,180,270]:render('rest',angle)
arm.data.pose_position='POSE'
for action in actions:
 arm.animation_data.action=action;start,end=map(float,action.frame_range);rows=[]
 for i in range(17):
  f=start+(end-start)*i/16;scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update();row=measure();row['frame']=f;rows.append(row)
 report['animations'].append({'name':action.name,'samples':rows})
 if not args.no_render:
  for phase in [.2,.52,.8]:
   f=start+(end-start)*phase;scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update()
   for angle in [90,180]:render(action.name+f'-{phase:.2f}',angle)
(out/f'{source.stem}-neck-motion.json').write_text(json.dumps(report,indent=2));print('NECK_MOTION_DONE',source,[(a['name'],min(s['inside']/s['total'] for s in a['samples'])) for a in report['animations']])

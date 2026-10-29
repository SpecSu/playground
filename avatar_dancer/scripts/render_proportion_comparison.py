"""Before/after actual GLB renders using identical cameras and studio lighting."""
import bpy,sys,argparse,json,math
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--before',required=True);p.add_argument('--after',required=True);p.add_argument('--output',required=True);p.add_argument('--samples',type=int,default=32);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True);reference=None;metrics=[]
for label,path in [('before',a.before),('after',a.after)]:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve()));scene=bpy.context.scene
 for o in scene.objects:
  if o.type=='ARMATURE':o.data.pose_position='REST'
 bpy.context.view_layer.update();meshes=[o for o in scene.objects if o.type=='MESH' and o.data.materials];points=[o.matrix_world@v.co for o in meshes for v in o.data.vertices];lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)])
 if reference is None:reference=(lo.copy(),hi.copy())
 rlo,rhi=reference;height=rhi.z-rlo.z;center=(rlo+rhi)/2
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=a.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=4;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.4,.4,.4,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.view_settings.view_transform='AgX'
 def point(o,t):o.rotation_euler=(Vector(t)-o.location).to_track_quat('-Z','Y').to_euler()
 for name,offset,power in [('Key',(1.6,-1.2,1.8),90),('Fill',(1,1.4,1),45),('Back',(-1.1,.5,1.6),100)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power*height*height;d.shape='DISK';d.size=height;ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob);ob.location=Vector((center.x,center.y,rlo.z))+Vector(offset)*height;point(ob,Vector((center.x,center.y,rlo.z+height*.7)))
 cam=bpy.data.objects.new('Matched comparison camera',bpy.data.cameras.new('Matched comparison camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.clip_start=.005;cam.data.clip_end=100
 for framing,z,scale in [('full',.51,1.12),('head',.84,.42)]:
  target=Vector((center.x,center.y,rlo.z+z*height));cam.data.ortho_scale=height*scale
  for angle in [0,90,180]:
   rad=math.radians(angle);cam.location=target+Vector((math.cos(rad)*3.2*height,math.sin(rad)*3.2*height,.01*height));point(cam,target);f=out/f'{Path(path).stem}-{label}-{framing}-{angle:03d}.png';scene.render.filepath=str(f);bpy.ops.render.render(write_still=True);metrics.append({'source':str(Path(path).resolve()),'label':label,'framing':framing,'angle':angle,'camera':list(cam.location),'scale':cam.data.ortho_scale,'image':str(f)})
(out/'comparison.json').write_text(json.dumps(metrics,indent=2));print('MATCHED_COMPARISON_COMPLETE',out)

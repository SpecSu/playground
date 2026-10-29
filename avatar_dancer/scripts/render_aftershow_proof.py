"""Textured offline evidence from production-controller CPU-skinned vertices, not browser footage."""
import bpy,json,math,sys,array,argparse
from pathlib import Path
from mathutils import Vector,kdtree,Matrix
parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--start',type=int,default=0);parser.add_argument('--end',type=int);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(args.directory).resolve();meta=json.load(open(root/'metadata.json'));bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=meta['source']);scene=bpy.context.scene
for o in scene.objects:
 if o.animation_data:
  o.animation_data_clear()
 if o.type=='ARMATURE':o.data.pose_position='REST'
bpy.context.view_layer.update();meshes=[o for o in scene.objects if o.type=='MESH' and o.data.materials];kd=kdtree.KDTree(len(meta['rest']))
for i,p in enumerate(meta['rest']):kd.insert(Vector((p[0],-p[2],p[1])),i)
kd.balance();mapping=[];errors=[]
for o in meshes:
 indices=[]
 for v in o.data.vertices:
  _,i,d=kd.find(o.matrix_world@v.co);indices.append(i);errors.append(d)
 print('MESH',o.name,'error',max(errors[-len(indices):]),'bounds',tuple(o.matrix_world@o.data.vertices[0].co),flush=True)
 for mod in list(o.modifiers):o.modifiers.remove(mod)
 o.parent=None;o.matrix_world=Matrix.Identity(4);mapping.append((o,indices));o.data.normals_split_custom_set([(0,0,0)]*len(o.data.loops))
print('MAPPING MAX ERROR',max(errors),flush=True);assert max(errors)<.0001
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=8;scene.cycles.use_denoising=False;scene.cycles.max_bounces=3;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=480;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.08,.12,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5;scene.view_settings.view_transform='AgX'
def point(o,t):o.rotation_euler=(Vector(t)-o.location).to_track_quat('-Z','Y').to_euler()
for name,pos,power in [('Key',(-2,-3,4),250),('Fill',(2,-1,2),140),('Rim',(1,2,3),220)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=2.;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;point(o,(0,0,1))
cam=bpy.data.objects.new('Fixed offline studio camera',bpy.data.cameras.new('Camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.65;cam.location=(0,-6,1.6);point(cam,(0,0,1.0))
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.004));floor=bpy.context.object;mat=bpy.data.materials.new('Neutral floor');mat.diffuse_color=(.022,.03,.05,1);floor.data.materials.append(mat)
start=args.start;end=args.end if args.end is not None else meta['frames'];(root/'frames').mkdir(exist_ok=True)
for frame in range(start,end):
 if meta['states'][frame].get('camera'):
  c=meta['states'][frame]['camera'];cam.data.type='PERSP';cam.data.sensor_fit='VERTICAL';cam.data.lens=cam.data.sensor_height/(2*math.tan(math.radians(16.5)));cam.location=(c['position'][0],-c['position'][2],c['position'][1]);point(cam,(c['target'][0],-c['target'][2],c['target'][1]));scene.render.resolution_x=meta['states'][frame].get('viewport',[444,483])[0];scene.render.resolution_y=meta['states'][frame].get('viewport',[444,483])[1];floor.hide_render=True;scene.render.film_transparent=True
 data=array.array('f');data.frombytes((root/f'{frame:04}.bin').read_bytes())
 for o,indices in mapping:
  coords=[]
  for i in indices:coords.extend((data[3*i],-data[3*i+2],data[3*i+1]))
  o.data.vertices.foreach_set('co',coords);o.data.update()
 bpy.context.view_layer.update();scene.render.filepath=str(root/'frames'/f'{frame:04}.png');bpy.ops.render.render(write_still=True)

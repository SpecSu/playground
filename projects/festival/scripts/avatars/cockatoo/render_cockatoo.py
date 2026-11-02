"""Offline render of delivered GLB after re-import. No browser or network usage."""
import bpy, math, sys, argparse, hashlib, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parent/'generated'
p=argparse.ArgumentParser();p.add_argument('--mode',choices=['hero','face','back','side','dj'],default='hero');p.add_argument('--input');p.add_argument('--output-dir',type=Path);p.add_argument('--samples',type=int,default=40);args=p.parse_args(sys.argv[sys.argv.index('--')+1:]if'--'in sys.argv else[])
ROOT=(args.output_dir or ROOT).resolve();ROOT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
source=Path(args.input)if args.input else ROOT/'dj-cockatoo.glb';bpy.ops.import_scene.gltf(filepath=str(source))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=5
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX';scene.view_settings.look='AgX - Medium High Contrast'
scene.world.use_nodes=True;world=scene.world.node_tree.nodes['Background'];world.inputs['Color'].default_value=(.50,.56,.62,1);world.inputs['Strength'].default_value=.28
m=bpy.data.materials.new('Studio cobalt');m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(.066,.11,.15,1);bs.inputs['Roughness'].default_value=.84
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));bpy.context.object.data.materials.append(m)
def area(name,loc,power,color,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,0,1.3))-ob.location).to_track_quat('-Z','Y').to_euler()
area('Large warm softbox',(-3,-4,6),720,(1,.91,.80),4)
area('Soft cool fill',(4,-3,4),380,(.76,.89,1),3)
area('Upper rim',(2,3,5),920,(.82,.92,1),3)
d=bpy.data.cameras.new('Asset review');cam=bpy.data.objects.new('Asset review',d);scene.collection.objects.link(cam);scene.camera=cam;d.type='ORTHO'
config={'hero':((3.2,-8,3.2),(0,0,1.4),3.4,1000,1200),'face':((2.3,-8,2.7),(0,-.025,2.23),1.5,1100,1100),'back':((2.5,8,3.3),(0,0,1.4),3.4,1000,1200),'side':((8,-.1,3.1),(0,0,1.4),3.4,1000,1200),'dj':((3.1,-8,3.4),(0,0,1.4),3.4,1000,1200)}
loc,target,scale,w,h=config[args.mode];cam.location=loc;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();d.ortho_scale=scale
scene.render.resolution_x=w;scene.render.resolution_y=h;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/f'cockatoo-{args.mode}.png');bpy.ops.render.render(write_still=True)
(ROOT/f'cockatoo-{args.mode}.provenance.json').write_text(json.dumps({'source_glb':str(source),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'rendered_from':'re-imported delivered GLB','mode':args.mode,'renderer':'Blender 4.3.2 Cycles','samples':args.samples},indent=2)+'\n')

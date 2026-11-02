"""Offline Cycles render of the actual exported Three.js model, no live CUA."""
import bpy,sys,math
from pathlib import Path
from mathutils import Vector
folder=Path(__file__).resolve().parents[2]/'manor-next-content-20261024/exotic-evidence'
ids=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [p.stem for p in folder.glob('*.glb')]
for name in ids:
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 bpy.ops.import_scene.gltf(filepath=str(folder/(name+'.glb')))
 objects=[o for o in bpy.context.scene.objects if o.type=='MESH'];points=[o.matrix_world@Vector(v) for o in objects for v in o.bound_box]
 lo=Vector([min(p[i] for p in points) for i in range(3)]);hi=Vector([max(p[i] for p in points) for i in range(3)]);size=hi-lo;centre=(lo+hi)/2;span=max(size)
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.50,.50,.50)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.016));floor=bpy.context.object;mat=bpy.data.materials.new('soft sage stage');mat.diffuse_color=(.56,.67,.62,1);floor.data.materials.append(mat)
 for loc,power,s in [((-3,-4,7),700,5),((4,0,5),420,4)]:
  bpy.ops.object.light_add(type='AREA',location=centre+Vector(loc)*max(1,span*.35));light=bpy.context.object;light.data.energy=power*max(1,span*.35)**2;light.data.shape='DISK';light.data.size=s*max(1,span*.35);light.rotation_euler=(centre-light.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=centre+Vector((3.5,-6,4.5))*max(1,span*.4));camera=bpy.context.object;scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=span*1.45;camera.rotation_euler=(centre-camera.location).to_track_quat('-Z','Y').to_euler()
 scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=str(folder/(name+'.png'));bpy.ops.render.render(write_still=True);print('RENDERED',name,flush=True)

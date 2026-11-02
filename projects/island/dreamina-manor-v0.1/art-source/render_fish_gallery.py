import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_botanical import *
reset();bpy.ops.import_scene.gltf(filepath=str(ROOT/'art-source/previews/fish-shapes.glb'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=36;scene.cycles.use_denoising=False;scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.world.color=(.5,.5,.5)
cube('shape-review background',(0,1.15,4),(100,.1,100),material('gallery slate','#A1BEB8',.85))
for loc,energy,size in [((-5,-8,12),1000,7),((6,-5,5),650,6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,4))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.3,-22,7));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=11.5;cam.rotation_euler=(Vector((0,0,4.1))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=1200;scene.render.resolution_y=1400;scene.render.resolution_percentage=100;scene.render.filepath=str(EVIDENCE/'09-fish-shape-review-normalized-offline.png');bpy.ops.render.render(write_still=True)

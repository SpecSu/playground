import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_botanical import *
reset()
for species,x in [('radish',-.72),('daisy',.72)]:
    before=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(OUT/'plants'/f'{species}.glb'))
    added=set(bpy.context.scene.objects)-before;group=empty('Pair_'+species,loc=(x,0,0))
    for ob in added:
        if ob.parent not in added:ob.parent=group
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=40;scene.cycles.use_denoising=False
scene.view_settings.view_transform='Standard';scene.view_settings.look='None';scene.view_settings.exposure=0
scene.world.color=(.45,.45,.45)
cube('shape review background',(0,0,-.075),(200,200,.10),material('background','#91B6B0',.9))
for loc,energy,size in [((-3,-4,7),620,5),((4,-1,4),300,4)]:
    bpy.ops.object.light_add(type='AREA',location=loc);l=bpy.context.object;l.data.energy=energy;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.5))-l.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(2.6,-7,4.5));cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=3.4;cam.rotation_euler=(Vector((0,0,.48))-cam.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=960;scene.render.resolution_y=640;scene.render.resolution_percentage=100
for frame,label in [(0,'0'),(50,'50'),(100,'100')]:
    scene.frame_set(frame);scene.render.filepath=str(EVIDENCE/f'radish-daisy-{label}-offline.png');bpy.ops.render.render(write_still=True)

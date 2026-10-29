#!/usr/bin/env python3
"""Blender offline animation/skin inspection and three actual-mesh pose renders.
blender -b --factory-startup --python scripts/inspect_animation.py -- --input MODEL.glb --output DIR
"""
import sys, json, argparse
from pathlib import Path


def main():
    import bpy
    from mathutils import Vector
    sys.path.insert(0, str(Path(__file__).parent))
    from render_character import bounds_from_points
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input',required=True)
    parser.add_argument('--output',required=True)
    parser.add_argument('--samples',type=int,default=16)
    parser.add_argument('--video',action='store_true',help='Render a 5 second 320px/12fps actual-animation proof')
    parser.add_argument('--hip-lock',action='store_true',help='Lock world hip XY each video frame; preserve Z. Writes fixed-proof.mp4.')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    source=Path(args.input).resolve();out=Path(args.output).resolve();out.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene=bpy.context.scene
    meshes=[o for o in scene.objects if o.type=='MESH' and not o.hide_render and not all(c.hide_render for c in o.users_collection)]
    arms=[o for o in scene.objects if o.type=='ARMATURE']
    arm=arms[0]
    actions=list(bpy.data.actions)
    for a in arms:
        for track in a.animation_data.nla_tracks:track.mute=True
    # Rest-pose ground and consistent framing independent of the sampled dance pose.
    arm.data.pose_position='REST';bpy.context.view_layer.update()
    def geometry_bounds():
        graph=bpy.context.evaluated_depsgraph_get()
        return bounds_from_points([tuple(o.evaluated_get(graph).matrix_world@v.co) for o in meshes for v in o.evaluated_get(graph).data.vertices])
    rest=geometry_bounds();height=rest['size'][2];center=rest['center'];ground=rest['min'][2]
    arm.data.pose_position='POSE'
    skin=[]
    for obj in meshes:
        sums=[sum(g.weight for g in v.groups) for v in obj.data.vertices]
        influences=[sum(1 for g in v.groups if g.weight>1e-6) for v in obj.data.vertices]
        skin.append({'mesh':obj.name,'vertices':len(sums),'weighted_vertices':sum(v>1e-6 for v in sums),'unweighted_vertices':sum(v<=1e-6 for v in sums),'min_weight_sum':min(sums),'max_weight_sum':max(sums),'max_influences':max(influences),'groups':[g.name for g in obj.vertex_groups],'armature_modifiers':[m.object.name if m.object else None for m in obj.modifiers if m.type=='ARMATURE']})
    metrics={'source':str(source),'fps':scene.render.fps,'rest_bounds':rest,'bones':[b.name for b in arm.data.bones],'bone_count':len(arm.data.bones),'skins':skin,'animations':[],'rendering':'actual imported skin and animation; Cycles CPU 16 samples; no post-generation'}
    # Tripo face remains +X after Blender coordinate conversion.
    def at(screen_x,front,z):return Vector((center[0]+front*height,center[1]+screen_x*height,ground+z*height))
    def point(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=args.samples;scene.cycles.use_denoising=False
    scene.cycles.max_bounces=4;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=512;scene.render.resolution_y=512;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.5,.5,.5,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.4
    scene.view_settings.view_transform='AgX'
    bpy.ops.mesh.primitive_plane_add(size=200*height,location=(center[0],center[1],ground-.003*height))
    plane=bpy.context.object;material=bpy.data.materials.new('Neutral studio ground');material.diffuse_color=(.5,.5,.5,1);plane.data.materials.append(material)
    for name,position,power,scale in [('Key',(-1.2,1.8,2),90,1.2),('Fill',(1.2,1,1.3),45,1.3),('Rim',(.5,-1,1.7),85,1)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power*height*height;data.shape='DISK';data.size=height*scale;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=at(*position);point(obj,at(0,0,.6))
    camera=bpy.data.objects.new('Pose inspection camera',bpy.data.cameras.new('Pose inspection camera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=height*1.42
    camera.location=at(.06,3.3,.67);point(camera,at(0,0,.53));camera.data.clip_start=.005;camera.data.clip_end=100
    foot_names=['mixamorig:LeftFoot','mixamorig:RightFoot','mixamorig:LeftToeBase','mixamorig:RightToeBase']
    for index,action in enumerate(actions):
        arm.animation_data.action=action
        start,end=map(float,action.frame_range)
        samples=[]
        for i in range(17):
            frame=start+(end-start)*i/16;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            feet={name:(arm.matrix_world@arm.pose.bones[name].head).z-ground for name in foot_names if name in arm.pose.bones}
            bounds=geometry_bounds()
            samples.append({'frame':frame,'time_seconds':frame/scene.render.fps,'feet_height_from_rest_ground':feet,'mesh_lowest_height':bounds['min'][2]-ground,'bounds':bounds})
        phase=[.2,.36,.52][index%3];frame=start+(end-start)*phase
        scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
        pose_bounds=geometry_bounds();screen_center=(pose_bounds['center'][1]-center[1])/height;vertical_center=(pose_bounds['center'][2]-ground)/height
        camera.data.ortho_scale=max(height*1.20,pose_bounds['size'][2]*1.16,pose_bounds['size'][1]*1.16)
        camera.location=at(screen_center,3.3,vertical_center+.05);point(camera,at(screen_center,0,vertical_center))
        target=out/f'{source.stem}-{action.name}-pose.png';scene.render.filepath=str(target);bpy.ops.render.render(write_still=True)
        animation={'name':action.name,'frame_range':[start,end],'duration_seconds':(end-start)/scene.render.fps,'fcurves':len(action.fcurves),'keyframes':sum(len(c.keyframe_points) for c in action.fcurves),'sampled_pose_frame':frame,'pose_image':str(target),'samples':samples}
        metrics['animations'].append(animation)
    target=out/f'{source.stem}-animation-metrics.json';target.write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
    if args.video:
        import subprocess
        proof_tag='fixed-proof' if args.hip_lock else 'proof'
        frames=out/f'{source.stem}-{proof_tag}-frames';frames.mkdir(exist_ok=True)
        source_fps=scene.render.fps
        camera.data.ortho_scale=height*(1.42 if args.hip_lock else 1.95);camera.location=at(.04,3.3,.68);point(camera,at(.04,0,.63))
        base_location=arm.location.copy()
        hip_target=arm.matrix_world@arm.data.bones['mixamorig:Hips'].head_local
        scene.render.resolution_x=320;scene.render.resolution_y=320;scene.cycles.samples=4
        for i in range(60):
            action=actions[min(i//20,len(actions)-1)];arm.animation_data.action=action
            start,end=map(float,action.frame_range)
            frame=start+((end-start)*.20+(i%20)*source_fps/12)%(end-start)
            arm.location=base_location.copy()
            scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
            if args.hip_lock:
                hip=arm.matrix_world@arm.pose.bones['mixamorig:Hips'].head
                arm.location.x+=hip_target.x-hip.x;arm.location.y+=hip_target.y-hip.y
                bpy.context.view_layer.update()
            scene.render.filepath=str(frames/f'{i:04d}.png');bpy.ops.render.render(write_still=True)
        video=out/f'{source.stem}-{proof_tag}.mp4'
        subprocess.run(['ffmpeg','-y','-loglevel','error','-framerate','12','-i',str(frames/'%04d.png'),'-vf',"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='ACTUAL MESH RENDER / "+('HIP XY LOCK' if args.hip_lock else 'ORIGINAL MOTION')+"':fontsize=10:fontcolor=white:x=8:y=8:box=1:boxcolor=black@0.5:boxborderw=4",'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
        metrics['video']={'path':str(video),'duration_seconds':5,'fps':12,'resolution':[320,320],'samples':4,'hip_xy_lock':args.hip_lock,'description':'Three actual clips in consecutive 1.667s segments, starting at 20% of each clip; actual offline Blender mesh render, not browser capture.'}
        target.write_text(json.dumps(metrics,ensure_ascii=False,indent=2)+'\n')
    print('ANIMATION_INSPECTION_COMPLETE',target,flush=True)

if __name__=='__main__':main()

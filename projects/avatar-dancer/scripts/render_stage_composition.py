#!/usr/bin/env python3
"""Offline Blender stage composition from exported runtime GLB; NOT a WebGL screenshot."""
import sys,argparse,json,math
from pathlib import Path

def main():
 import bpy
 from mathutils import Vector,Matrix
 sys.path.insert(0,str(Path(__file__).parent));from render_character import bounds_from_points
 p=argparse.ArgumentParser();p.add_argument('--stage',required=True);p.add_argument('--avatar',required=True);p.add_argument('--output',required=True);p.add_argument('--clip',default='dance_05');p.add_argument('--phase',type=float,default=.52);p.add_argument('--samples',type=int,default=128);p.add_argument('--width',type=int,default=576);p.add_argument('--height',type=int,default=1024);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(a.stage).resolve()))
 scene=bpy.context.scene;camera=next(o for o in scene.objects if o.type=='CAMERA');scene.camera=camera
 # Enforce the exported 33-degree vertical field of view at exact portrait output aspect.
 camera.data.sensor_fit='VERTICAL';camera.data.sensor_height=36;camera.data.lens=36/(2*math.tan(math.radians(33)/2))
 # Rebuild the two source UV falloffs rather than render exported flat-alpha blocks.
 for material in list(bpy.data.materials):
  if not material.use_nodes:continue
  shader=next((n for n in material.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
  opacity=float(shader.inputs['Alpha'].default_value) if shader else float(material.diffuse_color[3])
  if not (.02<opacity<.08):continue
  tint=tuple(shader.inputs['Emission Color'].default_value) if shader else (*material.diffuse_color[:3],1)
  nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
  def mathnode(operation,one=None,two=None):
   n=nodes.new('ShaderNodeMath');n.operation=operation
   for idx,value in enumerate([one,two]):
    if value is None:continue
    if isinstance(value,(int,float)):n.inputs[idx].default_value=value
    else:links.new(value,n.inputs[idx])
   return n.outputs[0]
  uv=nodes.new('ShaderNodeTexCoord')
  if opacity>.05:
   sub=nodes.new('ShaderNodeVectorMath');sub.operation='SUBTRACT';sub.inputs[1].default_value=(.5,.5,0);links.new(uv.outputs['UV'],sub.inputs[0])
   scaleuv=nodes.new('ShaderNodeVectorMath');scaleuv.operation='SCALE';scaleuv.inputs[3].default_value=2;links.new(sub.outputs[0],scaleuv.inputs[0])
   length=nodes.new('ShaderNodeVectorMath');length.operation='LENGTH';links.new(scaleuv.outputs[0],length.inputs[0])
   falloff=mathnode('POWER',mathnode('MAXIMUM',mathnode('SUBTRACT',1,length.outputs['Value']),0),2.7)
  else:
   separate=nodes.new('ShaderNodeSeparateXYZ');links.new(uv.outputs['UV'],separate.inputs[0])
   edge=mathnode('POWER',mathnode('SINE',mathnode('MULTIPLY',separate.outputs['X'],math.pi)),3)
   smooth=nodes.new('ShaderNodeMapRange');smooth.interpolation_type='SMOOTHSTEP';smooth.clamp=True;smooth.inputs['From Min'].default_value=0;smooth.inputs['From Max'].default_value=.13;links.new(separate.outputs['Y'],smooth.inputs['Value'])
   falloff=mathnode('MULTIPLY',edge,mathnode('MULTIPLY',smooth.outputs[0],mathnode('SUBTRACT',1,separate.outputs['Y'])))
  alpha=mathnode('MULTIPLY',falloff,opacity);transparent=nodes.new('ShaderNodeBsdfTransparent');emission=nodes.new('ShaderNodeEmission');emission.inputs[0].default_value=tint;emission.inputs[1].default_value=1
  mix=nodes.new('ShaderNodeMixShader');links.new(alpha,mix.inputs[0]);links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);output_node=nodes.new('ShaderNodeOutputMaterial');links.new(mix.outputs[0],output_node.inputs[0])
 before=set(scene.objects);bpy.ops.import_scene.gltf(filepath=str(Path(a.avatar).resolve()));added=set(scene.objects)-before
 arm=next(o for o in added if o.type=='ARMATURE');meshes=[o for o in added if o.type=='MESH' and len(o.vertex_groups)>0]
 arm.data.pose_position='REST';bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get()
 bounds=bounds_from_points([list(o.evaluated_get(graph).matrix_world@v.co) for o in meshes for v in o.evaluated_get(graph).data.vertices]);scale=1.9/bounds['size'][2]
 root=bpy.data.objects.new('Runtime normalized avatar wrapper',None);scene.collection.objects.link(root)
 for obj in added:
  if obj.parent not in added:obj.parent=root
 rotation=Matrix.Rotation(-math.pi/2,4,'Z');translation=Matrix.Translation(Vector((-bounds['center'][0],-bounds['center'][1],-bounds['min'][2])))
 root.matrix_world=rotation@Matrix.Scale(scale,4)@translation
 arm.data.pose_position='POSE'
 for track in arm.animation_data.nla_tracks:track.mute=True
 action=next(act for act in bpy.data.actions if a.clip in act.name);arm.animation_data.action=action
 bpy.context.view_layer.update();target=arm.matrix_world@arm.data.bones['mixamorig:Hips'].head_local
 start,end=map(float,action.frame_range);frame=start+(end-start)*a.phase;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
 hip=arm.matrix_world@arm.pose.bones['mixamorig:Hips'].head;root.location.x+=target.x-hip.x;root.location.y+=target.y-hip.y;bpy.context.view_layer.update()
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=a.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=6
 scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=a.width;scene.render.resolution_y=a.height;scene.render.resolution_percentage=100
 scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.render.film_transparent=False
 # glTF lux/candela import divides radiometric Blender energy by683; restore runtime numerical lighting for offline legibility.
 for light in scene.objects:
  if light.type=='LIGHT':light.data.energy*=683
 scene.world.use_nodes=True;nodes=scene.world.node_tree.nodes;links=scene.world.node_tree.links
 background=nodes.get('Background');background.inputs[0].default_value=(.32,.34,.4,1);background.inputs[1].default_value=.35
 dark=nodes.new('ShaderNodeBackground');dark.inputs[0].default_value=(.009,.011,.016,1);dark.inputs[1].default_value=1
 path=nodes.new('ShaderNodeLightPath');mix=nodes.new('ShaderNodeMixShader');links.new(path.outputs['Is Camera Ray'],mix.inputs[0]);links.new(background.outputs[0],mix.inputs[1]);links.new(dark.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],nodes.get('World Output').inputs[0])
 scene.view_settings.view_transform='AgX';scene.view_settings.exposure=0;scene.view_settings.gamma=1
 # Approximate runtime FogExp2(.045) with distance-pass compositor falloff.
 scene.view_layers[0].use_pass_z=True;scene.use_nodes=True;cn=scene.node_tree.nodes;cl=scene.node_tree.links;cn.clear();render=cn.new('CompositorNodeRLayers')
 depthscale=cn.new('CompositorNodeMath');depthscale.operation='MULTIPLY';depthscale.inputs[1].default_value=.045;cl.new(render.outputs['Depth'],depthscale.inputs[0])
 square=cn.new('CompositorNodeMath');square.operation='MULTIPLY';cl.new(depthscale.outputs[0],square.inputs[0]);cl.new(depthscale.outputs[0],square.inputs[1])
 negative=cn.new('CompositorNodeMath');negative.operation='MULTIPLY';negative.inputs[1].default_value=-1;cl.new(square.outputs[0],negative.inputs[0])
 exponential=cn.new('CompositorNodeMath');exponential.operation='EXPONENT';cl.new(negative.outputs[0],exponential.inputs[0])
 inverse=cn.new('CompositorNodeMath');inverse.operation='SUBTRACT';inverse.inputs[0].default_value=1;cl.new(exponential.outputs[0],inverse.inputs[1])
 fog=cn.new('CompositorNodeMixRGB');fog.blend_type='MIX';fog.inputs[2].default_value=(.00243,.00335,.00518,1);cl.new(inverse.outputs[0],fog.inputs[0]);cl.new(render.outputs['Image'],fog.inputs[1]);final=cn.new('CompositorNodeComposite');cl.new(fog.outputs[0],final.inputs[0])
 output=Path(a.output).resolve();output.parent.mkdir(parents=True,exist_ok=True);scene.render.filepath=str(output);bpy.ops.render.render(write_still=True)
 report={'kind':'OFFLINE ACTUAL MESH STAGE COMPOSITION, NOT WEBGL/BROWSER SCREENSHOT','stage':str(Path(a.stage).resolve()),'avatar':str(Path(a.avatar).resolve()),'camera_name':camera.name,'camera_matrix_world':[list(row) for row in camera.matrix_world],'vertical_fov_degrees':33,'render_resolution':[a.width,a.height],'samples':a.samples,'bind_height':bounds['size'][2],'normalized_height':1.9,'normalization_scale':scale,'avatar_rotation_blender_z_degrees':-90,'clip':action.name,'frame':frame,'horizontal_world_hip_lock':True,'vertical_motion_preserved':True,'approximations':['CPU Cycles vs runtime WebGL tone mapping/rendering','Neutral world fill replaces PMREM/hemisphere; dark camera-ray background','Light energy scaled683 after Blender photometric import; offline legibility approximation, not calibrated WebGL brightness','Runtime radial/beam UV falloff rebuilt in Blender transparent/emission nodes; additive blend approximated','FogExp2(.045) approximated with depth-pass compositor','Runtime UI and postprocessing not included']}
 output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print('STAGE_COMPOSITION_COMPLETE',output)
if __name__=='__main__':main()

"""Private, bounded source-photo material detail trial; native geometry unchanged."""
import argparse,sys,json,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from photo_head_candidate import fit_tps,evaluate_tps,smoothstep
from jiaxin_refine_materials import LANDMARKS,silhouette

def main():
 import bpy
 p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--photo',required=True);p.add_argument('--output',required=True);p.add_argument('--lower-stretch',type=float,default=0);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output).resolve();assert 'public' not in out.parts;out.parent.mkdir(parents=True,exist_ok=True)
 for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
 bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()));scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update();obj=max((o for o in scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));mesh=obj.data;coords=np.asarray([tuple(obj.matrix_world@v.co)for v in mesh.vertices]);original_uv=mesh.uv_layers.active.name
 # Fixed native-unit projection: do not renormalize by shortened hair silhouette.
 projection_coords=coords.copy()
 if a.lower_stretch:
  # Undo parent's bounded lower-face displacement for source-photo alignment only.
  for i,pt in enumerate(projection_coords):
   if .815<pt[2]<.8975:
    z=pt[2]
    for _ in range(6):z=pt[2]+a.lower_stretch*(.8975-z)*smoothstep(.825,.843,z)*smoothstep(.005,.05,pt[0])
    projection_coords[i,2]=z
 screen=np.column_stack((320+projection_coords[:,1]/.26*640,320-(projection_coords[:,2]-.90)/.26*640))/640;model=fit_tps(np.asarray([p for p,q in LANDMARKS])/640,np.asarray([q for p,q in LANDMARKS]));xy=evaluate_tps(model,screen)
 photo=bpy.data.images.load(str(Path(a.photo).resolve()));photo.name='PRIVATE_SOURCE_PHOTO_NOT_EXPORTED';pw,ph=photo.size
 uv=mesh.uv_layers.new(name='PRIVATE_SourceProjection');blend=mesh.color_attributes.new(name='PRIVATE_DetailMask',type='FLOAT_COLOR',domain='CORNER');mesh.color_attributes.new(name='PRIVATE_SkinTint',type='FLOAT_COLOR',domain='CORNER');uv=mesh.uv_layers['PRIVATE_SourceProjection'];blend=mesh.color_attributes['PRIVATE_DetailMask'];skin=mesh.color_attributes['PRIVATE_SkinTint']
 normals=np.asarray([tuple((obj.matrix_world.to_3x3()@v.normal).normalized())for v in mesh.vertices]);groups={}
 for i,pt in enumerate(coords):groups.setdefault(tuple(round(float(c),6)for c in pt),[]).append(i)
 for ids in groups.values():
  n=normals[ids].mean(0);normals[ids]=n/max(np.linalg.norm(n),1e-8)
 active=0
 for loop in mesh.loops:
  i=loop.vertex_index;sx,sy=screen[i]*640;x,y=xy[i];front=smoothstep(.2,.75,normals[i,0]);mouth=.35*math.exp(-2*((sx-319)/53)**2-2*((sy-423)/22)**2);brows=.32*max(math.exp(-2*((sx-263)/43)**2-2*((sy-284)/9)**2),math.exp(-2*((sx-375)/43)**2-2*((sy-284)/9)**2));nose=.22*math.exp(-2*((sx-320)/35)**2-2*((sy-377)/28)**2);eyes=.24*max(math.exp(-2*((sx-264)/23)**2-2*((sy-319)/8)**2),math.exp(-2*((sx-369)/23)**2-2*((sy-319)/8)**2));alpha=max(mouth,brows,nose,eyes)*front*silhouette(x,y);uv.data[loop.index].uv=(float(x/pw),float(1-y/ph));blend.data[loop.index].color=(1,1,1,float(alpha));skin.data[loop.index].color=(1,1,1,float(smoothstep(.820,.850,coords[i,2])));active+=alpha>.1
 mesh.uv_layers.active_index=mesh.uv_layers.find(original_uv)
 for u in mesh.uv_layers:u.active_render=u.name==original_uv
 mat=mesh.materials[0].copy();mesh.materials[0]=mat;nodes=mat.node_tree.nodes;links=mat.node_tree.links;bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');original=bs.inputs['Base Color'].links[0].from_socket
 mapping=nodes.new('ShaderNodeUVMap');mapping.uv_map=uv.name;tex=nodes.new('ShaderNodeTexImage');tex.image=photo;tex.extension='CLIP';links.new(mapping.outputs[0],tex.inputs['Vector']);exposure=nodes.new('ShaderNodeMixRGB');exposure.blend_type='MULTIPLY';exposure.inputs[0].default_value=1;exposure.inputs[2].default_value=(1.8,2.4,2.8,1);links.new(tex.outputs['Color'],exposure.inputs[1]);mask=nodes.new('ShaderNodeVertexColor');mask.layer_name=blend.name;mix=nodes.new('ShaderNodeMixRGB');links.new(mask.outputs['Alpha'],mix.inputs[0]);links.new(original,mix.inputs[1]);links.new(exposure.outputs[0],mix.inputs[2]);skinmask=nodes.new('ShaderNodeVertexColor');skinmask.layer_name='PRIVATE_SkinTint';lum=nodes.new('ShaderNodeRGBToBW');links.new(original,lum.inputs[0]);ramp=nodes.new('ShaderNodeMapRange');ramp.inputs['From Min'].default_value=.08;ramp.inputs['From Max'].default_value=.30;ramp.clamp=True;links.new(lum.outputs[0],ramp.inputs['Value']);factor=nodes.new('ShaderNodeMath');factor.operation='MULTIPLY';links.new(skinmask.outputs['Alpha'],factor.inputs[0]);links.new(ramp.outputs[0],factor.inputs[1]);warm=nodes.new('ShaderNodeMixRGB');warm.blend_type='MULTIPLY';warm.inputs[2].default_value=(.90,.86,.82,1);links.new(factor.outputs[0],warm.inputs[0]);links.new(mix.outputs[0],warm.inputs[1]);emit=nodes.new('ShaderNodeEmission');links.new(warm.outputs[0],emit.inputs[0]);links.new(emit.outputs[0],output.inputs[0])
 image=bpy.data.images.new('jiaxin-v5-baked-color',width=2048,height=2048,alpha=False);target=nodes.new('ShaderNodeTexImage');target.image=image
 for n in nodes:n.select=False
 target.select=True;nodes.active=target
 # Constant eyewear has an isolated bake sink; it stays constant and is not exported.
 for other in list(mesh.materials)[1:]:
  sink=other.node_tree.nodes.new('ShaderNodeTexImage');sink.image=bpy.data.images.new('PRIVATE_unused_sink',width=8,height=8);other.node_tree.nodes.active=sink
 bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=4;bpy.ops.object.bake(type='EMIT',margin=8,use_clear=True);image.filepath_raw=str(out.with_suffix('.color.png'));image.file_format='PNG';image.save();image.pack()
 links.new(target.outputs[0],bs.inputs['Base Color']);links.new(bs.outputs[0],output.inputs[0]);
 for n in [mapping,tex,exposure,mask,mix,emit,skinmask,lum,ramp,factor,warm]:nodes.remove(n)
 mesh.uv_layers.remove(uv);mesh.color_attributes.remove(mesh.color_attributes['PRIVATE_DetailMask']);mesh.color_attributes.remove(mesh.color_attributes['PRIVATE_SkinTint'])
 for u in mesh.uv_layers:u.active_render=u.name==original_uv
 mesh.uv_layers.active_index=mesh.uv_layers.find(original_uv)
 arm.data.pose_position='POSE';arm.select_set(True);bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_skins=True,export_animations=True,export_animation_mode='ACTIONS')
 now=np.asarray([tuple(obj.matrix_world@v.co)for v in mesh.vertices]);assert np.max(abs(now-coords))<1e-8
 out.with_suffix('.texture.json').write_text(json.dumps({'geometry_unchanged':True,'projected_loops':int(active),'scope':'mouth/nose/eyebrow details only; eye and frame interiors excluded','source_photo_in_export':False,'bone_count':len(arm.data.bones),'clips':len(bpy.data.actions)},indent=2));print('TEXTURE_TRIAL_COMPLETE',out)
if __name__=='__main__':main()

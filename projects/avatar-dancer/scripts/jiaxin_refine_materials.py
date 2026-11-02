#!/usr/bin/env python3
"""Private whole-mesh Jiaxin material refinement. No geometry cuts or head swaps."""
import argparse,json,math,sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
from photo_head_candidate import fit_tps,evaluate_tps,smoothstep
LANDMARKS=[
((320,220),(354,470)),((228,278),(246,549)),((413,278),(466,548)),
((264,319),(291,599)),((369,319),(414,600)),
((320,341),(354,629)),((320,375),(354,675)),((300,383),(330,683)),((340,383),(376,682)),
((281,422),(315,738)),((319,423),(354,740)),((355,422),(395,738)),
((319,477),(355,807)),((244,414),(274,735)),((395,414),(432,735)),
((220,347),(242,635)),((418,347),(470,632)),
((211,306),(241,585)),((262,359),(290,645)),((312,306),(337,585)),
((318,306),(369,587)),((373,360),(418,648)),((426,306),(467,590)),
]
def silhouette(x,y):
 rows=[(455,354,35),(490,354,103),(550,354,119),(620,355,117),(685,355,109),(745,355,89),(795,355,53),(820,355,0)]
 if not rows[0][0]<y<rows[-1][0]:return 0.
 for (ya,ca,wa),(yb,cb,wb) in zip(rows,rows[1:]):
  if ya<=y<=yb:
   t=(y-ya)/(yb-ya);c=ca+(cb-ca)*t;w=wa+(wb-wa)*t
   return smoothstep(2,17,min(x-c+w,c+w-x,y-455,820-y))
 return 0.
def main():
 import bpy
 from mathutils import Vector
 p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--photo',required=True);p.add_argument('--output-dir',required=True);p.add_argument('--samples',type=int,default=64);p.add_argument('--bake',action='store_true');p.add_argument('--size',type=int,default=4096);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output_dir).resolve();out.mkdir(parents=True,exist_ok=True)
 assert 'public' not in out.parts
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()));scene=bpy.context.scene
 arms=[o for o in scene.objects if o.type=='ARMATURE']
 for arm in arms:arm.data.pose_position='REST'
 bpy.context.view_layer.update();obj=next(o for o in scene.objects if o.type=='MESH');mesh=obj.data
 coords=np.asarray([tuple(obj.matrix_world@v.co) for v in mesh.vertices]);lo=coords.min(0);hi=coords.max(0);height=hi[2]-lo[2];origin=np.array([(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,lo[2]]);points=(coords-origin)/height
 original_uv=mesh.uv_layers.active.name
 model=fit_tps(np.asarray([p for p,q in LANDMARKS])/640,np.asarray([q for p,q in LANDMARKS]))
 screen=np.column_stack((320+points[:,1]/.26*640,320-(points[:,2]-.90)/.26*640))/640;photo_xy=evaluate_tps(model,screen)
 photo=bpy.data.images.load(str(Path(a.photo).resolve()),check_existing=False);photo.name='PRIVATE_JIAXIN_PHOTO_DO_NOT_EXPORT';photo.pack();pw,ph=photo.size
 mesh.uv_layers.new(name='PRIVATE_PhotoProjection');mesh.color_attributes.new(name='PRIVATE_PhotoMix',type='FLOAT_COLOR',domain='CORNER');mesh.color_attributes.new(name='PRIVATE_Head',type='FLOAT_COLOR',domain='CORNER');mesh.color_attributes.new(name='PRIVATE_Hair',type='FLOAT_COLOR',domain='CORNER')
 uv=mesh.uv_layers['PRIVATE_PhotoProjection'];blend=mesh.color_attributes['PRIVATE_PhotoMix'];head=mesh.color_attributes['PRIVATE_Head'];hair=mesh.color_attributes['PRIVATE_Hair']
 normals=np.asarray([tuple((obj.matrix_world.to_3x3()@v.normal).normalized()) for v in mesh.vertices])
 # Smooth normal masks at UV duplicate vertices, not the actual geometry.
 groups={}
 for i,pt in enumerate(points):groups.setdefault(tuple(round(float(q),5) for q in pt),[]).append(i)
 for ids in groups.values():
  avg=normals[ids].mean(0);avg/=max(np.linalg.norm(avg),1e-8);normals[ids]=avg
 alpha_count=0
 for loop in mesh.loops:
  i=loop.vertex_index;x,y=photo_xy[i];pt=points[i];h=smoothstep(.82,.855,float(pt[2]));front=smoothstep(-.05,.60,float(normals[i,0]))*smoothstep(-.02,.018,float(pt[0]));alpha=h*front*silhouette(float(x),float(y))
  sx,sy=screen[i]*640;local=math.exp(-2*((sx-320)/44)**2-2*((sy-375)/43)**2);alpha*=local
  uv.data[loop.index].uv=(float(x/pw),float(1-y/ph));blend.data[loop.index].color=(1,1,1,float(alpha));head.data[loop.index].color=(1,1,1,float(h));hair_strength=max(smoothstep(.943,.963,float(pt[2])),smoothstep(.915,.94,float(pt[2]))*(1-smoothstep(-.02,.04,float(pt[0]))));hair.data[loop.index].color=(1,1,1,float(h*hair_strength));alpha_count+=alpha>.5
 mesh.uv_layers.active_index=mesh.uv_layers.find(original_uv)
 for u in mesh.uv_layers:u.active_render=u.name==original_uv
 for k,mat in enumerate(list(mesh.materials)):
  mat=mat.copy();mesh.materials[k]=mat;mat.name='PRIVATE_JIAXIN_WHOLE_MESH';n=mat.node_tree.nodes;l=mat.node_tree.links;bs=next(x for x in n if x.type=='BSDF_PRINCIPLED');old=bs.inputs['Base Color'].links[0].from_socket
  tex=n.new('ShaderNodeTexImage');tex.image=photo;tex.extension='CLIP';mapping=n.new('ShaderNodeUVMap');mapping.uv_map='PRIVATE_PhotoProjection';l.new(mapping.outputs[0],tex.inputs['Vector'])
  ba=n.new('ShaderNodeVertexColor');ba.layer_name='PRIVATE_PhotoMix';ha=n.new('ShaderNodeVertexColor');ha.layer_name='PRIVATE_Hair';he=n.new('ShaderNodeVertexColor');he.layer_name='PRIVATE_Head'
  exposure=n.new('ShaderNodeMixRGB');exposure.blend_type='MULTIPLY';exposure.inputs[0].default_value=1;exposure.inputs[2].default_value=(1.45,1.65,1.85,1);l.new(tex.outputs['Color'],exposure.inputs[1])
  mix=n.new('ShaderNodeMixRGB');l.new(ba.outputs['Alpha'],mix.inputs[0]);l.new(old,mix.inputs[1]);l.new(exposure.outputs[0],mix.inputs[2])
  dark=n.new('ShaderNodeMixRGB');dark.blend_type='MULTIPLY';dark.inputs[2].default_value=(.12,.11,.10,1);l.new(ha.outputs['Alpha'],dark.inputs[0]);l.new(mix.outputs[0],dark.inputs[1]);l.new(dark.outputs[0],bs.inputs['Base Color'])
  def scalar(socket,target,factor):
   oldsock=socket.links[0].from_socket if socket.is_linked else None;v=float(socket.default_value);m=n.new('ShaderNodeMix');m.data_type='FLOAT';l.new(factor,m.inputs[0]);m.inputs[2].default_value=v;m.inputs[3].default_value=target
   if oldsock:l.new(oldsock,m.inputs[2])
   l.new(m.outputs[0],socket)
  scalar(bs.inputs['Metallic'],0,he.outputs['Alpha']);scalar(bs.inputs['Roughness'],.62,he.outputs['Alpha']);scalar(bs.inputs['Roughness'],.9,ha.outputs['Alpha']);scalar(bs.inputs['Specular IOR Level'],.12,he.outputs['Alpha'])
  for nd in list(n):
   if nd.type=='NORMAL_MAP':scalar(nd.inputs['Strength'],.22,ba.outputs['Alpha'])
 # Save only private work; original source may be packed here but never web.
 bpy.ops.wm.save_as_mainfile(filepath=str(out/'PRIVATE_jiaxin-material-candidate.blend'))
 if a.bake:
  bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4
  mat=mesh.materials[0];n=mat.node_tree.nodes;l=mat.node_tree.links;bs=next(x for x in n if x.type=='BSDF_PRINCIPLED');surface=next(x for x in n if x.type=='OUTPUT_MATERIAL');base=bs.inputs['Base Color'].links[0].from_socket;rough=bs.inputs['Roughness'].links[0].from_socket;metal=bs.inputs['Metallic'].links[0].from_socket
  emission=n.new('ShaderNodeEmission');baked={}
  for kind in ['color','orm','normal']:
   image=bpy.data.images.new('JIAXIN_BAKED_'+kind,width=a.size,height=a.size,alpha=True);image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color';target=n.new('ShaderNodeTexImage');target.image=image
   for nd in n:nd.select=False
   target.select=True;n.active=target
   if kind=='color':l.new(base,emission.inputs[0]);l.new(emission.outputs[0],surface.inputs[0]);type='EMIT'
   elif kind=='orm':
    comb=n.new('ShaderNodeCombineColor');comb.inputs[0].default_value=1;l.new(rough,comb.inputs[1]);l.new(metal,comb.inputs[2]);l.new(comb.outputs[0],emission.inputs[0]);l.new(emission.outputs[0],surface.inputs[0]);type='EMIT'
   else:l.new(bs.outputs[0],surface.inputs[0]);type='NORMAL'
   bpy.ops.object.bake(type=type,margin=8,use_clear=True);image.filepath_raw=str(out/f'jiaxin-{kind}-{a.size}.png');image.file_format='PNG';image.save();image.pack();baked[kind]=image
  final=bpy.data.materials.new('JIAXIN_BAKED_NO_SOURCE_PHOTO');final.use_nodes=True;n=final.node_tree.nodes;l=final.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=.2
  ct=n.new('ShaderNodeTexImage');ct.image=baked['color'];l.new(ct.outputs[0],bs.inputs['Base Color']);ot=n.new('ShaderNodeTexImage');ot.image=baked['orm'];sep=n.new('ShaderNodeSeparateColor');l.new(ot.outputs[0],sep.inputs[0]);l.new(sep.outputs[1],bs.inputs['Roughness']);l.new(sep.outputs[2],bs.inputs['Metallic']);nt=n.new('ShaderNodeTexImage');nt.image=baked['normal'];nm=n.new('ShaderNodeNormalMap');nm.uv_map=original_uv;l.new(nt.outputs[0],nm.inputs['Color']);l.new(nm.outputs[0],bs.inputs['Normal']);mesh.materials.clear();mesh.materials.append(final)
  for name in [u.name for u in mesh.uv_layers]:
   if name!=original_uv:mesh.uv_layers.remove(mesh.uv_layers[name])
  mesh.uv_layers.active_index=0;mesh.uv_layers[0].active_render=True
  for name in [v.name for v in mesh.color_attributes]:mesh.color_attributes.remove(mesh.color_attributes[name])
  for arm in arms:arm.data.pose_position='POSE';arm.select_set(True)
  bpy.ops.export_scene.gltf(filepath=str(out/'jiaxin-material-refined.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True)
  for arm in arms:arm.data.pose_position='REST'
 # Same studio framing as previous model review, so changes are visible not hidden.
 scene.render.engine='CYCLES';scene.cycles.samples=a.samples;scene.cycles.use_denoising=False;scene.cycles.max_bounces=4;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB';scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.48,.49,.52,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35;scene.view_settings.view_transform='AgX'
 def at(x,y,z):return Vector(origin+height*np.array([y,x,z]))
 def point(o,target):o.rotation_euler=(target-o.location).to_track_quat('-Z','Y').to_euler()
 for name,position,power,size in [('Key',(-1.2,1.7,2),90,1.2),('Fill',(1.4,1,1.1),45,1.5),('Rim',(.5,-1.1,1.6),100,1)]:
  d=bpy.data.lights.new(name,'AREA');d.energy=power*height*height;d.shape='DISK';d.size=size*height;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=at(*position);point(o,at(0,0,.65))
 camera=bpy.data.objects.new('ActualMeshCamera',bpy.data.cameras.new('ActualMeshCamera'));scene.collection.objects.link(camera);scene.camera=camera;camera.data.type='ORTHO';camera.data.ortho_scale=.26*height
 for label,angle in [('front',0),('side',-45)]:
  rad=math.radians(angle);camera.location=at(math.sin(rad)*3.2,math.cos(rad)*3.2,.91);point(camera,at(0,0,.90));scene.render.filepath=str(out/f'jiaxin-refined-{label}.png');bpy.ops.render.render(write_still=True)
 now=np.asarray([tuple(obj.matrix_world@v.co) for v in mesh.vertices]);assert np.max(abs(now-coords))<1e-7
 report={'source':a.input,'geometry_unchanged':True,'vertices':len(mesh.vertices),'faces':len(mesh.polygons),'bones':sum(len(o.data.bones) for o in arms),'actions':len(bpy.data.actions),'projected_loop_count':int(alpha_count),'baked':a.bake,'source_photo_in_export':False if a.bake else 'private blend only','limitations':['Single frontal photograph cannot establish unseen profile.','Material correction is not accepted identity equivalence.','Native whole mesh neck retained, no head cut or topology change.']};(out/'refinement-audit.json').write_text(json.dumps(report,indent=2));print('JIAXIN_REFINEMENT_DONE',out)
if __name__=='__main__':main()

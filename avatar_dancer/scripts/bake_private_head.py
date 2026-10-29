#!/usr/bin/env python3
"""Bake evaluated private face material to isolated head atlas; export no source photo.
Inputs: private blend, original costume GLB. Outputs remain private until reviewed.
"""
import sys,argparse,json,math,struct
from pathlib import Path

def main():
 import bpy,numpy as np
 sys.path.insert(0,str(Path(__file__).parent));from head_transfer import crop_mesh,pack_rectangles
 p=argparse.ArgumentParser();p.add_argument('--blend',required=True);p.add_argument('--original',required=True);p.add_argument('--output',required=True);p.add_argument('--size',type=int,default=1536);p.add_argument('--cut',type=float,default=.812);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);output=Path(a.output).resolve();output.parent.mkdir(parents=True,exist_ok=True);texdir=output.parent/(output.stem+'-textures');texdir.mkdir(exist_ok=True)
 if 'public' in output.parts:raise ValueError('Private output only')
 bpy.ops.wm.open_mainfile(filepath=str(Path(a.blend).resolve()));scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update();body=next(o for o in scene.objects if o.type=='MESH' and len(o.vertex_groups)>0);names={g.index:g.name for g in body.vertex_groups}
 selected={v.index for v in body.data.vertices if (body.matrix_world@v.co).z>=a.cut and sum(g.weight for g in v.groups if names[g.group]=='mixamorig:Head')>=.5}
 head=body.copy();head.data=body.data.copy();head.name='BAKED_CANONICAL_HEAD_PRIVATE';scene.collection.objects.link(head);crop_mesh(head,lambda f:sum(v.index in selected for v in f.verts)>=len(f.verts)/2);crop_mesh(body,lambda f:sum(v.index in selected for v in f.verts)<len(f.verts)/2)
 source_uv=head.data.uv_layers.active.name
 for i,m in enumerate(list(head.data.materials)):
  head.data.materials[i]=m.copy()
 material=head.data.materials[0];nodes=material.node_tree.nodes;links=material.node_tree.links
 for node in list(nodes):
  if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
   explicit=nodes.new('ShaderNodeUVMap');explicit.uv_map=source_uv;links.new(explicit.outputs[0],node.inputs['Vector'])
  if node.type=='NORMAL_MAP':node.uv_map=source_uv
 # Pack existing source UV islands without rotating; source shader still reads SourceUV.
 mesh=head.data;old=np.asarray([tuple(l.uv) for l in mesh.uv_layers[source_uv].data]);parent=list(range(len(mesh.polygons)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 seen={}
 for face in mesh.polygons:
  for li in face.loop_indices:
   vi=mesh.loops[li].vertex_index;key=tuple(round(float(x),6) for x in (*mesh.vertices[vi].co,*old[li]))
   if key in seen:parent[find(face.index)]=find(seen[key])
   else:seen[key]=face.index
 groups={}
 for face in mesh.polygons:groups.setdefault(find(face.index),[]).extend(face.loop_indices)
 islands=[]
 for ids in groups.values():c=old[ids];islands.append((c.min(0),c.max(0),ids))
 rects,gain=pack_rectangles([(float(hi[0]-lo[0]),float(hi[1]-lo[1])) for lo,hi,ids in islands],a.size,8);bake_uv=mesh.uv_layers.new(name='HeadBakeUV')
 for (lo,hi,ids),(x,y,w,h) in zip(islands,rects):
  for li in ids:bake_uv.data[li].uv=((old[li]-lo)*gain+np.array([x+8,y+8]))/a.size
 mesh.uv_layers.active_index=mesh.uv_layers.find('HeadBakeUV')
 for layer in mesh.uv_layers:layer.active_render=layer.name=='HeadBakeUV'
 shader=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');surface=next(n for n in nodes if n.type=='OUTPUT_MATERIAL');base=shader.inputs['Base Color'].links[0].from_socket;rough=shader.inputs['Roughness'].links[0].from_socket if shader.inputs['Roughness'].is_linked else None;metal=shader.inputs['Metallic'].links[0].from_socket if shader.inputs['Metallic'].is_linked else None
 emission=nodes.new('ShaderNodeEmission');emission.inputs[1].default_value=1
 scene.render.engine='CYCLES';scene.cycles.samples=1;scene.cycles.use_denoising=False;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.bake.use_clear=True;scene.render.bake.margin=8
 bpy.ops.object.select_all(action='DESELECT');head.select_set(True);bpy.context.view_layer.objects.active=head
 baked={}
 for kind in ['color','orm','normal']:
  image=bpy.data.images.new('HEAD_BAKED_'+kind,width=a.size,height=a.size,alpha=True);image.colorspace_settings.name='sRGB' if kind=='color' else 'Non-Color';targetnode=nodes.new('ShaderNodeTexImage');targetnode.image=image
  for n in nodes:n.select=False
  targetnode.select=True;nodes.active=targetnode
  if kind=='color':links.new(base,emission.inputs['Color']);links.new(emission.outputs[0],surface.inputs['Surface']);bake_type='EMIT'
  elif kind=='orm':
   combine=nodes.new('ShaderNodeCombineColor');combine.mode='RGB';combine.inputs[0].default_value=1;combine.inputs[1].default_value=.6;combine.inputs[2].default_value=0
   if rough:links.new(rough,combine.inputs[1])
   if metal:links.new(metal,combine.inputs[2])
   links.new(combine.outputs[0],emission.inputs['Color']);links.new(emission.outputs[0],surface.inputs['Surface']);bake_type='EMIT'
  else:links.new(shader.outputs['BSDF'],surface.inputs['Surface']);bake_type='NORMAL'
  bpy.ops.object.bake(type=bake_type,margin=8,use_clear=True)
  image.filepath_raw=str(texdir/f'head-{kind}-{a.size}.png');image.file_format='PNG';image.save();image.pack();baked[kind]=image
 # Discard all projector nodes: final head is ordinary PBR atlas material.
 final=bpy.data.materials.new('HEAD_ATLAS_ONLY_NO_SOURCE_PHOTO');final.use_nodes=True;fn=final.node_tree.nodes;fl=final.node_tree.links;bs=fn.get('Principled BSDF');bs.inputs['Specular IOR Level'].default_value=.2
 ct=fn.new('ShaderNodeTexImage');ct.image=baked['color'];fl.new(ct.outputs['Color'],bs.inputs['Base Color']);ot=fn.new('ShaderNodeTexImage');ot.image=baked['orm'];sep=fn.new('ShaderNodeSeparateColor');fl.new(ot.outputs['Color'],sep.inputs[0]);fl.new(sep.outputs['Green'],bs.inputs['Roughness']);fl.new(sep.outputs['Blue'],bs.inputs['Metallic']);nt=fn.new('ShaderNodeTexImage');nt.image=baked['normal'];normal=fn.new('ShaderNodeNormalMap');normal.uv_map='UVMap';fl.new(nt.outputs['Color'],normal.inputs['Color']);fl.new(normal.outputs[0],bs.inputs['Normal']);head.data.materials.clear();head.data.materials.append(final)
 for uv_name in [layer.name for layer in head.data.uv_layers]:
  if uv_name!='HeadBakeUV':head.data.uv_layers.remove(head.data.uv_layers[uv_name])
 head.data.uv_layers[0].name='UVMap';head.data.uv_layers[0].active_render=True;head.data.uv_layers.active_index=0
 for attr_name in [attr.name for attr in head.data.color_attributes]:head.data.color_attributes.remove(head.data.color_attributes[attr_name])
 # Restore plain original body material (never projector) and reduce only its images to2K.
 before=set(scene.objects);actions=set(bpy.data.actions);bpy.ops.import_scene.gltf(filepath=str(Path(a.original).resolve()));added=set(scene.objects)-before;sourcebody=next(o for o in added if o.type=='MESH' and len(o.vertex_groups)>0);body.data.materials.clear()
 for material in sourcebody.data.materials:body.data.materials.append(material)
 for obj in added:bpy.data.objects.remove(obj,do_unlink=True)
 for action in set(bpy.data.actions)-actions:bpy.data.actions.remove(action)
 body_images=set()
 for m in body.data.materials:
  for node in m.node_tree.nodes:
   if node.type=='TEX_IMAGE' and node.image:body_images.add(node.image)
 for idx,image in enumerate(body_images):
  if max(image.size)>2048:image.scale(2048,2048)
  image.file_format='PNG';image.filepath_raw=str(texdir/f'body-{idx}-2k.png');image.save();image.pack()
 for uv_name in [layer.name for layer in body.data.uv_layers]:
  if uv_name!='UVMap':body.data.uv_layers.remove(body.data.uv_layers[uv_name])
 body.data.uv_layers.active_index=0;body.data.uv_layers[0].active_render=True
 for attr_name in [attr.name for attr in body.data.color_attributes]:body.data.color_attributes.remove(body.data.color_attributes[attr_name])
 for obj in [body,head]:
  for m in obj.data.materials:
   assert all('PRIVATE_ORIGINAL' not in n.image.name for n in m.node_tree.nodes if n.type=='TEX_IMAGE' and n.image)
 arm.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT')
 for obj in [arm,body,head]:obj.select_set(True)
 bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False)
 raw=output.read_bytes();length=struct.unpack_from('<I',raw,12)[0];gltf=json.loads(raw[20:20+length]);blob_start=20+length+8;images=[]
 for im in gltf.get('images',[]):
  view=gltf['bufferViews'][im['bufferView']];start=blob_start+view.get('byteOffset',0);data=raw[start:start+view['byteLength']]
  if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Expected audited PNG textures only')
  width,height=struct.unpack('>II',data[16:24]);assert(width,height) in [(a.size,a.size),(2048,2048)];images.append({'name':im.get('name'),'width':width,'height':height,'bytes':len(data)})
 assert len(gltf.get('animations',[]))==3 and len(gltf.get('skins',[]))==1 and len(images)<=6
 report={'output':str(output),'actual_native_blender_bakes':['EMIT baseColor','EMIT ORM','TANGENT NORMAL'],'head_atlas':a.size,'body_atlas':2048,'head_uv_islands':len(islands),'head_uv_pixels_per_source_unit':gain,'images':images,'contains_source_photo':False,'source_photo_dimensions':[720,1280],'animations':len(gltf['animations']),'skins':len(gltf['skins']),'meshes':len(gltf['meshes']),'privacy_audit_passed':True,'status':'PRIVATE BAKED CANDIDATE; needs visual and dance gate'}
 output.with_suffix('.bake-audit.json').write_text(json.dumps(report,indent=2)+'\n');print('BAKED_PRIVATE_HEAD_COMPLETE',output,flush=True)
if __name__=='__main__':main()

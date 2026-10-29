"""Offline material/accessory derivatives. Never cuts head, changes native skin, or calls APIs."""
import argparse,sys,math,json
from pathlib import Path

def main():
 import bpy
 from mathutils import Vector,Matrix
 a=argparse.ArgumentParser();a.add_argument('--input',required=True);a.add_argument('--output',required=True);a.add_argument('--style',type=int,choices=[1,2],required=True);args=a.parse_args(sys.argv[sys.argv.index('--')+1:])
 out=Path(args.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
 if 'public' in out.parts:raise ValueError('Private candidate output only')
 
 for existing in list(bpy.data.objects):bpy.data.objects.remove(existing,do_unlink=True)
 bpy.ops.import_scene.gltf(filepath=str(Path(args.input).resolve()))
 scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update()
 bodies=[o for o in scene.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers)]
 for o in list(scene.objects):
  if o.type=='MESH' and o not in bodies:bpy.data.objects.remove(o,do_unlink=True)
 points=[o.matrix_world@v.co for o in bodies for v in o.data.vertices];low=min(p.z for p in points);height=max(p.z for p in points)-low
 print('BOUNDS',low,height,[(o.name,len(o.data.vertices))for o in bodies],flush=True)
 original_vertex_count=sum(len(o.data.vertices) for o in bodies);original_weights=sum(len(v.groups) for o in bodies for v in o.data.vertices)
 palette=[None,((.12,.30,.45,1),(.024,.045,.085,1),(.55,.72,.82,1)),((.27,.018,.045,1),(.72,.66,.55,1),(.72,.42,.12,1))][args.style]
 scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1;scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.bake.margin=8
 textures=[]
 for bi,obj in enumerate(bodies):
  keep_materials=set()
  for mi,material in enumerate(obj.data.materials):
   zs=[(obj.matrix_world@obj.data.vertices[vi].co).z for poly in obj.data.polygons if poly.material_index==mi for vi in poly.vertices]
   if not zs or min(zs)>low+height*.84 or 'glasses' in material.name.lower():
    keep_materials.add(mi)
    # Bake requires an active image in every material; this unlinked tiny target is not exported.
    material=material.copy();obj.data.materials[mi]=material
    dummy=material.node_tree.nodes.new('ShaderNodeTexImage');dummy.image=bpy.data.images.new(f'private-bake-sink-{bi}-{mi}',width=8,height=8);material.node_tree.nodes.active=dummy
  for mi,oldmat in enumerate(list(obj.data.materials)):
   if mi in keep_materials:continue
   mat=oldmat.copy();obj.data.materials[mi]=mat;n=mat.node_tree.nodes;links=mat.node_tree.links;bs=next(x for x in n if x.type=='BSDF_PRINCIPLED');output=next(x for x in n if x.type=='OUTPUT_MATERIAL')
   def val(socket):
    if socket.is_linked:return socket.links[0].from_socket
    node=n.new('ShaderNodeRGB' if socket.type=='RGBA' else 'ShaderNodeValue');node.outputs[0].default_value=socket.default_value;return node.outputs[0]
   def mathnode(op,x,y):
    q=n.new('ShaderNodeMath');q.operation=op
    for i,v in enumerate([x,y]):
     if isinstance(v,(int,float)):q.inputs[i].default_value=v
     else:links.new(v,q.inputs[i])
    return q.outputs[0]
   def mix(fac,x,y):
    q=n.new('ShaderNodeMixRGB');links.new(fac,q.inputs[0]);links.new(x,q.inputs[1])
    if isinstance(y,tuple):q.inputs[2].default_value=y
    else:links.new(y,q.inputs[2])
    return q.outputs[0]
   base=val(bs.inputs['Base Color']);rough=val(bs.inputs['Roughness']);metal=val(bs.inputs['Metallic']);lum=n.new('ShaderNodeRGBToBW');links.new(base,lum.inputs[0]);vc=n.new('ShaderNodeNewGeometry');sep=n.new('ShaderNodeSeparateXYZ');links.new(vc.outputs['Position'],sep.inputs[0]);z=mathnode('DIVIDE',mathnode('SUBTRACT',sep.outputs['Z'],low),height);topmask=mathnode('MULTIPLY',mathnode('GREATER_THAN',z,.46),mathnode('LESS_THAN',z,.835));legmask=mathnode('MULTIPLY',mathnode('GREATER_THAN',z,.045),mathnode('LESS_THAN',z,.55));shirt=mathnode('MULTIPLY',topmask,mathnode('LESS_THAN',lum.outputs[0],.22));pants=mathnode('MULTIPLY',legmask,mathnode('GREATER_THAN',lum.outputs[0],.35))
   def tinted(color,factor):
    q=n.new('ShaderNodeMixRGB');q.blend_type='MULTIPLY';q.inputs[0].default_value=1;q.inputs[1].default_value=color;links.new(factor,q.inputs[2]);return q.outputs[0]
   tintedtop=tinted(palette[0],mathnode('ADD',.6,mathnode('MULTIPLY',lum.outputs[0],1.5)));tintedpants=tinted(palette[1],mathnode('ADD',.35,mathnode('MULTIPLY',lum.outputs[0],.8)));color=mix(pants,mix(shirt,base,tintedtop),tintedpants)
   def scalar_mix(mask,orig,target):return mathnode('ADD',mathnode('MULTIPLY',mathnode('SUBTRACT',1,mask),orig),mathnode('MULTIPLY',mask,target))
   r=scalar_mix(pants,scalar_mix(shirt,rough,.46 if args.style==1 else .52),.55);m=scalar_mix(shirt,metal,.10 if args.style==1 else .04);orm=n.new('ShaderNodeCombineColor');orm.inputs['Red'].default_value=1;links.new(r,orm.inputs['Green']);links.new(m,orm.inputs['Blue'])
   emit=n.new('ShaderNodeEmission');links.new(emit.outputs[0],output.inputs['Surface']);baked=[]
   for tag,socket,space in [('color',color,'sRGB'),('orm',orm.outputs[0],'Non-Color')]:
    image=bpy.data.images.new(f'jiaxin-{args.style}-{bi}-{mi}-{tag}',width=2048,height=2048,alpha=False);image.colorspace_settings.name=space;tex=n.new('ShaderNodeTexImage');tex.image=image
    for node in n:node.select=False
    tex.select=True;n.active=tex;links.new(socket,emit.inputs['Color']);bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj;bpy.ops.object.bake(type='EMIT',use_clear=True)
    image.filepath_raw=str(out.parent/(image.name+'.png'));image.file_format='PNG';image.save();image.pack();baked.append(tex);textures.append(str(image.filepath_raw))
   links.new(baked[0].outputs['Color'],bs.inputs['Base Color']);unpack=n.new('ShaderNodeSeparateColor');links.new(baked[1].outputs['Color'],unpack.inputs[0]);links.new(unpack.outputs['Green'],bs.inputs['Roughness']);links.new(unpack.outputs['Blue'],bs.inputs['Metallic']);links.new(bs.outputs[0],output.inputs['Surface'])
   # Only connected baked maps are exported; no source portrait nodes exist here.
 accessories=[]
 def accessory(name,verts,faces,bone,mat):
  mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);o.data.materials.append(mat);o.parent=arm;o.matrix_parent_inverse=arm.matrix_world.inverted();o.vertex_groups.new(name=bone).add(list(range(len(verts))),1,'REPLACE');mod=o.modifiers.new('Native rig','ARMATURE');mod.object=arm;accessories.append(o)
  for p in mesh.polygons:p.use_smooth=True
  return o
 acc=bpy.data.materials.new('Ice silver' if args.style==1 else 'Warm stage gold');acc.use_nodes=True;bs=acc.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=palette[2];bs.inputs['Metallic'].default_value=.8;bs.inputs['Roughness'].default_value=.24
 # Lightweight chest brooch conformed to the real shirt surface, not neck/head.
 body=max(bodies,key=lambda o:len(o.data.vertices));inv=body.matrix_world.inverted();origin=Vector((height,0,low+height*.725));ok,loc,normal,idx=body.ray_cast(inv@origin,(inv.to_3x3()@Vector((-1,0,0))).normalized())
 if ok:
  center=body.matrix_world@loc+Vector((height*.003,0,0));verts=[center+Vector(v)*height for v in [(0,-.016,0),(0,0,.023),(0,.016,0),(0,0,-.023),(.005,0,0),(-.001,0,0)]];faces=[(a,b,4) for a,b in [(0,1),(1,2),(2,3),(3,0)]]+[(b,a,5) for a,b in [(0,1),(1,2),(2,3),(3,0)]];accessory('Stage crest',verts,faces,'mixamorig:Spine2',acc)
 for obj in bodies:
  for attribute in list(obj.data.color_attributes):obj.data.color_attributes.remove(attribute)
 arm.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
 for o in bodies+accessories:o.select_set(True)
 bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True)
 report={'input':args.input,'output':str(out),'style':args.style,'original_vertices':original_vertex_count,'original_weight_entries':original_weights,'native_geometry_and_weights_untouched':True,'accessory_objects':len(accessories),'bones':len(arm.data.bones),'actions':len(bpy.data.actions),'textures':textures,'note':'Offline material and rigged accessory derivative, no new paid generation.'};out.with_suffix('.variant.json').write_text(json.dumps(report,indent=2));print('VARIANT_COMPLETE',out)
if __name__=='__main__':main()

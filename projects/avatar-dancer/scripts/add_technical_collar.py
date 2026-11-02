"""Reviewed LX source-specific collar scale. Not general character fitting."""
import bpy,sys,math,argparse
from pathlib import Path
from mathutils import Matrix
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()));arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update();anchor=arm.matrix_world@arm.data.bones['mixamorig:Head'].head_local
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=1,depth=1,location=(anchor.x,anchor.y,.812));o=bpy.context.object;o.name='Seamless_under_collar';o.scale=(.038,.047,.075);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);mat=bpy.data.materials.new('Matte_black_technical_collar');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.012,.015,.02,1);bs.inputs['Roughness'].default_value=.85;o.data.materials.append(mat)
for f in o.data.polygons:f.use_smooth=True
for name in ['mixamorig:Head','mixamorig:Neck']:o.vertex_groups.new(name=name)
for v in o.data.vertices:
 z=(o.matrix_world@v.co).z;t=max(0,min(1,(z-.78)/.07));o.vertex_groups['mixamorig:Head'].add([v.index],t,'REPLACE');o.vertex_groups['mixamorig:Neck'].add([v.index],1-t,'REPLACE')
o.parent=arm;o.matrix_parent_inverse=arm.matrix_world.inverted();mod=o.modifiers.new('Collar skin','ARMATURE');mod.object=arm
head=next(ob for ob in bpy.context.scene.objects if ob.type=='MESH' and 'DONOR_HEAD' in ob.name);bpy.ops.object.select_all(action='DESELECT');head.select_set(True);o.select_set(True);bpy.context.view_layer.objects.active=head;bpy.ops.object.join();arm.data.pose_position='POSE';bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.gltf(filepath=str(Path(a.output).resolve()),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True)

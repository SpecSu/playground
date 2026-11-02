"""Reuse audited baked true3D canonical head; no private photo nodes or newgeneration."""
import bpy,sys,argparse,json
from pathlib import Path
from mathutils import Matrix,Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from head_transfer import crop_mesh
p=argparse.ArgumentParser();p.add_argument('--target',required=True);p.add_argument('--donor',required=True);p.add_argument('--output',required=True);p.add_argument('--hair-cut',type=float,default=0);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output).resolve();assert 'public' not in out.parts;out.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(Path(a.target).resolve()));scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update();body=next(o for o in scene.objects if o.type=='MESH');oldactions=set(bpy.data.actions);objects=set(scene.objects);anchor=arm.matrix_world@arm.data.bones['mixamorig:Head'].head_local;cut=a.hair_cut or anchor.z-.003;names={g.index:g.name for g in body.vertex_groups};selected={v.index for v in body.data.vertices if (body.matrix_world@v.co).z>=cut and sum(g.weight for g in v.groups if names[g.group]=='mixamorig:Head')>=.5};before=len(body.data.vertices);crop_mesh(body,lambda f:sum(v.index in selected for v in f.verts)<len(f.verts)/2)
bpy.ops.import_scene.gltf(filepath=str(Path(a.donor).resolve()));added=set(scene.objects)-objects;da=next(o for o in added if o.type=='ARMATURE');da.data.pose_position='REST';bpy.context.view_layer.update();source=next(o for o in added if o.type=='MESH' and (any('HEAD_ATLAS_ONLY' in m.name for m in o.data.materials) or 'DONOR_HEAD' in o.name));da_anchor=da.matrix_world@da.data.bones['mixamorig:Head'].head_local;offset=anchor-da_anchor
head=source.copy();head.data=source.data.copy();head.name='CANONICAL_BAKED_HEAD';scene.collection.objects.link(head);head.parent=None;head.modifiers.clear();head.matrix_world=Matrix.Identity(4)
for v,sv in zip(head.data.vertices,source.data.vertices):v.co=source.matrix_world@sv.co+offset
# Retain donor Head/Neck skinweights; vertexgroup names bind into the target skeleton.
head.parent=arm;head.matrix_parent_inverse=arm.matrix_world.inverted();mod=head.modifiers.new('Canonical head skin','ARMATURE');mod.object=arm
for o in added:bpy.data.objects.remove(o,do_unlink=True)
for act in set(bpy.data.actions)-oldactions:bpy.data.actions.remove(act)
for m in body.data.materials:
 for n in m.node_tree.nodes:
  if n.type=='TEX_IMAGE' and n.image and max(n.image.size)>2048:n.image.scale(2048,2048);n.image.pack()
arm.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT')
for o in [arm,body,head]:o.select_set(True)
bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False)
out.with_suffix('.reuse.json').write_text(json.dumps({'source':a.donor,'target':a.target,'translation':list(offset),'removedOldHeadVertices':before-len(body.data.vertices),'headVertices':len(head.data.vertices),'preservedCanonicalGeometry':True,'cut':cut},indent=2))
print('CANONICAL_REUSE_DONE',out)

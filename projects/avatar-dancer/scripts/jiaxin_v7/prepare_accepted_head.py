import os
import bpy,bmesh,math
from pathlib import Path
root=Path(os.environ.get('ENCORE_WORKSPACE',Path(__file__).resolve().parents[3]));bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(root/'dance-stage-work/tripo/jiaxin-direct-head-v1.glb'));o=next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.data.materials);o.data.transform(o.matrix_world);from mathutils import Matrix,Vector;o.matrix_world=Matrix.Identity(4)
original_normals={tuple(round(float(x),6)for x in o.data.vertices[loop.vertex_index].co)+tuple(round(float(x),5)for x in o.data.uv_layers.active.data[loop.index].uv):normal.vector.copy()for loop,normal in zip(o.data.loops,o.data.corner_normals)}
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
# Authorized cleanup only of generated rear hair tips below ears, never face/crown.
import numpy as np,io,json
from PIL import Image
material=o.data.materials[0];shader=material.node_tree.nodes.get('Principled BSDF');image=shader.inputs['Base Color'].links[0].from_node.image;pixels=np.flipud(np.asarray(Image.open(io.BytesIO(image.packed_file.data)).convert('RGB'))/255.);uv=bm.loops.layers.uv.active
selected=[];before={v:v.co.copy() for v in bm.verts}
for v in bm.verts:
 if not(v.co.x<-.12 and -.25<v.co.z<-.05 and abs(v.co.y)<.25):continue
 cols=[]
 for loop in v.link_loops:
  u,w=loop[uv].uv;cols.append(pixels[min(pixels.shape[0]-1,max(0,int(w*pixels.shape[0]))),min(pixels.shape[1]-1,max(0,int(u*pixels.shape[1])))])
 if not cols:continue
 c=np.mean(cols,axis=0)
 if max(c)<.18 or v.co.x<-.23:selected.append(v)
for iteration in range(32):
 update={}
 for v in selected:
  neighbors=[e.other_vert(v) for e in v.link_edges];average=sum((n.co for n in neighbors),Vector())/len(neighbors);fade=min(1,max(0,(-.05-before[v].z)/.045));update[v]=v.co.lerp(average,.45*fade)
 for v,p in update.items():v.co=p
# Old baked rear-hair normal map still contained the removed bumps. Disable only this patch.
hairmat=material.copy();hairmat.name='Clean rear hair tips only';hp=hairmat.node_tree.nodes.get('Principled BSDF')
for link in list(hp.inputs['Normal'].links):hairmat.node_tree.links.remove(link)
hp.inputs['Roughness'].default_value=.8
for link in list(hp.inputs['Roughness'].links):hairmat.node_tree.links.remove(link)
o.data.materials.append(hairmat);hairmi=len(o.data.materials)-1;sel=set(selected)
for f in bm.faces:
 if sum(v in sel for v in f.verts)>=2:f.material_index=hairmi
changed=[(v.co-before[v]).length for v in selected]
(root/'jiaxin-head-integration/rear-hair-cleanup.json').write_text(json.dumps({'region':'rear hair tips only; X<-.12, -.25<Z<-.05, |Y|<.25, dark neutral hair texels','vertices':len(selected),'max_raw_displacement':max(changed,default=0),'iterations':32,'face_crown_glasses_untouched':True},indent=2))

def cut(p):
 t=max(0,min(1,(p.x+.05)/.23));t=t*t*(3-2*t);return -.25-.06*t
remove=[f for f in bm.faces if sum(v.co.z<cut(v.co) for v in f.verts)>=len(f.verts)/2];bmesh.ops.delete(bm,geom=remove,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS');bm.to_mesh(o.data);bm.free();o.data.update()
# Restore original face/crown normals; only changed rear tips use fresh smooth normals.
if o.data.has_custom_normals:
 bpy.context.view_layer.objects.active=o;bpy.ops.mesh.customdata_custom_splitnormals_clear()
uv=o.data.uv_layers.active;computed=[n.vector.copy()for n in o.data.corner_normals];normals=[]
for f in o.data.polygons:
 for li in f.loop_indices:
  loop=o.data.loops[li];key=tuple(round(float(x),6)for x in o.data.vertices[loop.vertex_index].co)+tuple(round(float(x),5)for x in uv.data[li].uv)
  normals.append(computed[li] if f.material_index==hairmi else original_normals.get(key,computed[li]))
o.data.normals_split_custom_set(normals)
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(root/'jiaxin-head-integration/donor-neck-cut.glb'),export_format='GLB',use_selection=True)

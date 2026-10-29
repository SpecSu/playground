import bpy,bmesh,sys,json
from pathlib import Path
from mathutils import Matrix
root=Path('/workspace/scratch/e8cd10917327');bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(root/'dance-stage-work/tripo/jiji-face-v9.glb'));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');o.data.transform(o.matrix_world);o.matrix_world=Matrix.Identity(4)
# Blender Z is original GLTF Y; Y is minus original GLTF Z. Face/eyes/jaw stay unchanged.
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6)
# Crop only inherited hat/cat decoration above bangs and outside upper temples.
removed=[f for f in bm.faces if sum((v.co.z>.24 or (abs(v.co.y)>.25 and v.co.z>.10)) for v in f.verts)>=2]
bmesh.ops.delete(bm,geom=removed,context='FACES');bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
mat=bpy.data.materials.new('New Jiji covered red scalp closure');mat.diffuse_color=(.18,.018,.025,1);mat.use_nodes=True;shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=mat.diffuse_color;shader.inputs['Roughness'].default_value=.8;o.data.materials.append(mat)
import numpy as np,io
from PIL import Image
img=o.data.materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].links[0].from_node.image
pix=np.flipud(np.array(Image.open(io.BytesIO(img.packed_file.data)).convert('RGB'))/255.);uv=bm.loops.layers.uv.active;patch=set()
for face in bm.faces:
 center=face.calc_center_median()
 if not(center.x<-.15 and center.z>-.10):continue
 cols=[]
 for loop in face.loops:
  u,w=loop[uv].uv;cols.append(pix[min(len(pix)-1,max(0,int(w*len(pix)))),min(pix.shape[1]-1,max(0,int(u*pix.shape[1])))])
 col=np.median(cols,axis=0)
 if np.mean(col)>.35 and max(col)-min(col)<.25:
  face.material_index=len(o.data.materials)-1;patch.update(face.verts)
from mathutils import Vector
for iteration in range(12):
 changes={}
 for v in patch:
  if v.co.x>=-.15:continue
  neighbors=[e.other_vert(v)for e in v.link_edges]
  if neighbors:changes[v]=v.co.lerp(sum((w.co for w in neighbors),Vector())/len(neighbors),.25)
 for v,pos in changes.items():v.co=pos
edges=[e for e in bm.edges if e.is_boundary];boundary=set(v for e in edges for v in e.verts)
for iteration in range(12):
 changes={}
 for v in boundary:
  if not(v.co.z>.20 or (abs(v.co.y)>.24 and v.co.z>.08)):continue
  neighbors=[e.other_vert(v)for e in v.link_edges if e.is_boundary]
  if len(neighbors)==2:changes[v]=v.co.lerp((neighbors[0].co+neighbors[1].co)/2,.4)
 for v,pos in changes.items():v.co=pos
# Lift only original red pigtail roots into the cap underside; face/ears are excluded by position and color.
for v in bm.verts:
 if not(v.co.x<.10 and abs(v.co.y)>.25 and v.co.z>-.05):continue
 cols=[]
 for loop in v.link_loops:
  u,w=loop[uv].uv;cols.append(pix[min(len(pix)-1,max(0,int(w*len(pix)))),min(pix.shape[1]-1,max(0,int(u*pix.shape[1])))])
 if not cols:continue
 col=np.median(cols,axis=0)
 # Geometry-only smooth mask avoids a hard texel threshold tearing neighboring hair tips.
 t=min(1,max(0,(v.co.z+.05)/.15));t=t*t*(3-2*t);q=min(1,max(0,(.10-v.co.x)/.10));q=q*q*(3-2*q);r=min(1,max(0,(abs(v.co.y)-.25)/.05));r=r*r*(3-2*r);t*=q*r;v.co.z+=.10*t;v.co.y*=1-.15*t
# Explicit triangles: a nonplanar 382-edge ngon cannot be trusted to export closed.
adj={}
for e in edges:
 for v in e.verts:adj.setdefault(v,set()).add(e)
remaining=set(edges);new=[]
while remaining:
 seed=next(iter(remaining));todo=[seed];component=set();vertices=set()
 while todo:
  e=todo.pop()
  if e in component:continue
  component.add(e);remaining.discard(e);vertices.update(e.verts)
  for v in e.verts:todo.extend(adj[v]-component)
 center=sum((v.co for v in vertices),Vector())/len(vertices)
 if len(component)>20:center.z=max(center.z,.26)
 cv=bm.verts.new(center)
 for e in component:
  loop=e.link_loops[0];a=loop.vert;b=loop.link_loop_next.vert
  try:f=bm.faces.new((b,a,cv));f.material_index=len(o.data.materials)-1;f.smooth=True;new.append(f)
  except ValueError:pass
# Only the covered rear closure / repurposed old frill: tuck its projecting lip under the cap.
# Shared vertices move together; neither face, ears nor natural lower pigtails are selected.
capverts={v for f in bm.faces if f.material_index==len(o.data.materials)-1 for v in f.verts}
for v in capverts:
 if v.co.x>=-.12 or v.co.z<=.09:continue
 t=min(1,max(0,(v.co.z-.09)/.08));t=t*t*(3-2*t)
 q=min(1,max(0,(-v.co.x-.12)/.12));q=q*q*(3-2*q);t*=q
 v.co.x+=.12*t;v.co.y*=1-.22*t
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
for f in o.data.polygons:f.use_smooth=True
bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.gltf(filepath=str(root/'jiji-v9/donor-no-hat.glb'),export_format='GLB',use_selection=True)
print('DONOR_PREPARED',len(removed),len(new))

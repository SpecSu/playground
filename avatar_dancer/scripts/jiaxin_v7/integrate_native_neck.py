import os
"""Private accepted donor + corrected native body. No public mutation.
Only rigid/uniform donor transform; anatomical closed neck adapter below jaw.
"""
import bpy,bmesh,sys,math,json,hashlib,io
import numpy as np
from PIL import Image
from pathlib import Path
from mathutils import Vector,Matrix
ROOT=Path(os.environ.get('ENCORE_WORKSPACE',Path(__file__).resolve().parents[3]));OUT=ROOT/'jiaxin-head-integration';OUT.mkdir(exist_ok=True)
BODY=ROOT/'jiaxin-collar-contract/native-collar-preserved.glb';DONOR=ROOT/'jiaxin-head-integration/donor-neck-cut.glb'
SCALE=.2;SHIFT=Vector((.007,.005,.9));DCUT=-.30
normalmap={};vertex_normals={};bridge_normals={};colormap={};vertex_colors={};bridge_colors={}
def poskey(p):return tuple(round(float(x),6) for x in p)
def cornerkey(p,uv):return poskey(p)+tuple(round(float(x),5) for x in uv)
def capture_normals(obj,scale=1,shift=Vector()):
 normals=obj.data.corner_normals;uv=obj.data.uv_layers.active;nm=obj.matrix_world.to_3x3().inverted().transposed();textures={}
 for i,mat in enumerate(obj.data.materials):
  if not mat or not mat.use_nodes:continue
  shader=mat.node_tree.nodes.get('Principled BSDF')
  if not shader or not shader.inputs['Base Color'].links:continue
  node=shader.inputs['Base Color'].links[0].from_node
  if node.type=='TEX_IMAGE' and node.image and node.image.packed_file:
   textures[i]=np.flipud(np.asarray(Image.open(io.BytesIO(node.image.packed_file.data)).convert('RGB'))/255.)
 loop_material={li:f.material_index for f in obj.data.polygons for li in f.loop_indices}
 for loop,n in zip(obj.data.loops,normals):
  p=(obj.matrix_world@obj.data.vertices[loop.vertex_index].co)*scale+shift;nn=(nm@n.vector).normalized();normalmap[cornerkey(p,uv.data[loop.index].uv)]=nn.copy();vertex_normals.setdefault(poskey(p),[]).append(nn.copy())
  tex=textures.get(loop_material[loop.index])
  if tex is not None:
   u,v=uv.data[loop.index].uv;c=tex[min(tex.shape[0]-1,max(0,int(v*tex.shape[0]))),min(tex.shape[1]-1,max(0,int(u*tex.shape[1])))];c=np.where(c<=.04045,c/12.92,((c+.055)/1.055)**2.4);colormap[cornerkey(p,uv.data[loop.index].uv)]=c;vertex_colors.setdefault(poskey(p),[]).append(c)
def source_color(v):
 arr=vertex_colors.get(poskey(v.co));return np.mean(arr,axis=0) if arr else np.array([.3,.125,.075])
def is_skin(c):return c[0]>.12 and c[0]>c[1]*1.18 and c[1]>c[2]*1.03
def source_normal(v):
 arr=vertex_normals.get(poskey(v.co));return (sum(arr,Vector())/len(arr)).normalized() if arr else v.normal.copy()
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=str(BODY))
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');body=next(o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.vertex_groups));arm.data.pose_position='REST';bpy.context.view_layer.update();oldactions=set(bpy.data.actions)
# Bake object frame without modifying world geometry / armature.
body_mat_count=len(body.data.materials);capture_normals(body);body.data.transform(body.matrix_world);body.matrix_world=Matrix.Identity(4)
oldobs=set(bpy.context.scene.objects);bpy.ops.import_scene.gltf(filepath=str(DONOR));newobs=set(bpy.context.scene.objects)-oldobs;head=next(o for o in newobs if o.type=='MESH' and o.data.materials);capture_normals(head,SCALE,SHIFT);head.data.transform(head.matrix_world);head.matrix_world=Matrix.Identity(4)
expected=[]
for v in head.data.vertices:v.co=v.co*SCALE+SHIFT;expected.append(tuple(v.co))
head.vertex_groups.clear();hg=head.vertex_groups.new(name='mixamorig:Head');ng=head.vertex_groups.new(name='mixamorig:Neck')
for v in head.data.vertices:
 hg.add([v.index],1,'REPLACE')
head.parent=arm;head.matrix_parent_inverse=arm.matrix_world.inverted();mod=head.modifiers.new('Accepted donor skin','ARMATURE');mod.object=arm
for o in newobs:
 if o!=head:bpy.data.objects.remove(o,do_unlink=True)
for action in set(bpy.data.actions)-oldactions:bpy.data.actions.remove(action)
# Welded common mesh; material/UV islands retained. New bridge shares endpoints.
bpy.ops.object.select_all(action='DESELECT');head.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=body;bpy.ops.object.join()
bm=bmesh.new();bm.from_mesh(body.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);dl=bm.verts.layers.deform.active
# Recover cut loops from upper-region boundary, preserving pre-existing garment holes.
edges=[e for e in bm.edges if e.is_boundary and min(v.co.z for v in e.verts)>.78]
def loops_from(edges):
 adj={}
 for e in edges:
  for v in e.verts:adj.setdefault(v,[]).append(e.other_vert(v))
 loops=[]
 while adj:
  start=next(iter(adj));cur=start;prev=None;loop=[]
  while True:
   loop.append(cur);ns=adj.pop(cur,[]);nxt=next((v for v in ns if v!=prev),None)
   if nxt is None or nxt==start:break
   prev,cur=cur,nxt
  if len(loop)>10:loops.append(loop)
 return loops
loops=loops_from(edges);print('LOOPS',[(len(l),min(v.co.z for v in l),max(v.co.z for v in l)) for l in loops])
assert len(loops)==2, 'Need exactly native neck cut and donor cut'
upper=max(loops,key=lambda l:sum(sum(f.material_index for f in v.link_faces)/len(v.link_faces) for v in l)/len(l));lower=next(l for l in loops if l is not upper)
# consistent angular order; skin neck cross sections are star-convex.
def ordered(loop):
 center=sum((v.co for v in loop),Vector())/len(loop)
 area=sum(a.co.x*b.co.y-b.co.x*a.co.y for a,b in zip(loop,loop[1:]+loop[:1]))
 if area<0:loop=list(reversed(loop))
 k=max(range(len(loop)),key=lambda i:loop[i].co.x)
 return loop[k:]+loop[:k]
upper=ordered(upper);lower=ordered(lower)
cut_edges={e for loop in [lower,upper] for a,b in zip(loop,loop[1:]+loop[:1]) for e in a.link_edges if e.other_vert(a)==b}
assert len(cut_edges)==len(lower)+len(upper)
preexisting_boundaries={e for e in bm.edges if e.is_boundary and e not in cut_edges}
# Seam only uses a new simple diffuse skin material, not modifications of face texture.
mat=bpy.data.materials.new('Closed anatomical neck transition');mat.use_nodes=True;p=mat.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(.30,.125,.075,1);p.inputs['Roughness'].default_value=.66
body.data.materials.append(mat);mi=len(body.data.materials)-1
# Zipper triangulation across ordered boundary loops; shared bmesh endpoints, no caps/overlaps.
def parameters(a):
 # Anatomical angular correspondence. 3D perimeter length differs strongly
 # between the high rear collar and low front collar and twists a loft.
 center=sum((v.co for v in a),Vector())/len(a)
 angles=np.unwrap([math.atan2(v.co.y-center.y,v.co.x-center.x) for v in a]);angles-=angles[0]
 # Preserve cyclic mesh order; pool small local angular reversals monotonically.
 blocks=[]
 for i,value in enumerate(angles):
  blocks.append([float(value),1,[i]])
  while len(blocks)>1 and blocks[-2][0]>blocks[-1][0]:
   q=blocks.pop();r=blocks.pop();n=q[1]+r[1];blocks.append([(q[0]*q[1]+r[0]*r[1])/n,n,r[2]+q[2]])
 mono=np.zeros(len(a))
 for value,n,ids in blocks:mono[ids]=value
 mono-=mono[0]
 for i in range(1,len(mono)):mono[i]=max(mono[i],mono[i-1]+1e-6)
 if mono[-1]>=2*math.pi:mono*=((2*math.pi-1e-5)/mono[-1])
 return [float(v)for v in mono/(2*math.pi)]+[1.]

def bridge(a,b,pa,pb):
 i=j=0;na=len(a);nb=len(b);faces=[]
 while i<na or j<nb:
  if i<na and (j>=nb or pa[i+1]<pb[j+1]):
   vs=[a[i%na],a[(i+1)%na],b[j%nb]];i+=1
  else:vs=[a[i%na],b[(j+1)%nb],b[j%nb]];j+=1
  f=bm.faces.new(vs);f.material_index=mi;faces.append(f)
 return faces
# Two intermediate rings distribute blend and avoid a single long jagged face strip.
rings=[lower];n=len(upper);pl=parameters(lower);pu=parameters(upper)
for v in lower+upper:bridge_normals[poskey(v.co)]=source_normal(v)
body_skin=np.array([source_color(v) for v in lower if is_skin(source_color(v))]);head_skin=np.array([source_color(v) for v in upper if is_skin(source_color(v))]);assert len(body_skin)>10 and len(head_skin)>10
head_tone=np.median(head_skin,axis=0);tint=np.clip(head_tone/np.maximum(np.median(body_skin,axis=0),1e-5),.4,1.15);print('NECK_TINT',head_tone,tint)
for v in lower:bridge_colors[poskey(v.co)]=np.clip(source_color(v)*tint if max(source_color(v))>.105 else head_tone,head_tone*.8,head_tone*1.2)
for v in upper:bridge_colors[poskey(v.co)]=np.clip(source_color(v) if is_skin(source_color(v)) else head_tone,head_tone*.8,head_tone*1.2)
for ring in [lower,upper]:
 values=[bridge_colors[poskey(v.co)].copy()for v in ring]
 for i,v in enumerate(ring):bridge_colors[poskey(v.co)]=np.median([values[(i+k)%len(ring)]for k in range(-5,6)],axis=0)
for frac in [1/3,2/3]:
 ring=[]
 for i,u in enumerate(upper):
  k=next((j for j in range(len(lower)) if pl[j+1]>=pu[i]),len(lower)-1);t=(pu[i]-pl[k])/max(1e-9,pl[k+1]-pl[k]);l0=lower[k%len(lower)];l1=lower[(k+1)%len(lower)];lp=l0.co.lerp(l1.co,t);v=bm.verts.new(lp.lerp(u.co,frac));wd={}
  for key in set(l0[dl].keys())|set(l1[dl].keys())|set(u[dl].keys()):wd[key]=(1-frac)*((1-t)*l0[dl].get(key,0)+t*l1[dl].get(key,0))+frac*u[dl].get(key,0)
  for key,value in wd.items():v[dl][key]=value
  bridge_normals[poskey(v.co)]=(((1-t)*source_normal(l0)+t*source_normal(l1))*(1-frac)+source_normal(u)*frac).normalized()
  bridge_colors[poskey(v.co)]=((1-t)*bridge_colors[poskey(l0.co)]+t*bridge_colors[poskey(l1.co)])*(1-frac)+bridge_colors[poskey(u.co)]*frac
  ring.append(v)
 rings.append(ring)
rings.append(upper)
# Fair only NEW intermediate skin rings; preserve both source boundaries exactly.
for ring in rings[1:-1]:
 for iteration in range(6):
  old=[v.co.copy() for v in ring];norms=[bridge_normals[poskey(v.co)] for v in ring];cols=[bridge_colors[poskey(v.co)] for v in ring]
  for i,v in enumerate(ring):
   v.co=old[i].lerp((old[(i-1)%len(ring)]+old[(i+1)%len(ring)])*.5,.35);bridge_normals[poskey(v.co)]=norms[i];bridge_colors[poskey(v.co)]=cols[i]
bridgefaces=[]
bridgefaces+=bridge(rings[0],rings[1],pl,pu)
for a,b in zip(rings[1:],rings[2:]):
 assert len(a)==len(b)
 for i in range(len(a)):
  j=(i+1)%len(a);f=bm.faces.new([a[i],a[j],b[j],b[i]]);f.material_index=mi;bridgefaces.append(f)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
# Ensure there are no remaining open edges in anatomical neck region.
remaining=[e for e in cut_edges if e.is_boundary];assert not remaining,len(remaining)
assert all(e in preexisting_boundaries for e in bm.edges if e.is_boundary), 'New unexpected boundary'
assert all(len(v.link_faces)>0 for r in rings for v in r)
bm.to_mesh(body.data);bm.free();body.data.update()
for p in body.data.polygons:p.use_smooth=True
# Preserve imported head/body corner normals; smooth only new bridge corners.
if body.data.has_custom_normals:
 bpy.context.view_layer.objects.active=body;bpy.ops.mesh.customdata_custom_splitnormals_clear()
uv=body.data.uv_layers.active;computed=[n.vector.copy() for n in body.data.corner_normals];restored=[]
for face in body.data.polygons:
 for li in face.loop_indices:
  p=body.data.vertices[body.data.loops[li].vertex_index].co
  restored.append(computed[li] if face.material_index==mi else normalmap.get(cornerkey(p,uv.data[li].uv),computed[li]))
body.data.normals_split_custom_set(restored)
# Vertex colors harmonize only original exposed neck skin and the new adapter.
# Garment texels remain factor1; original face/hair material colors remain factor1.
colors=body.data.color_attributes.new(name='SkinMatch',type='FLOAT_COLOR',domain='CORNER');body.data.color_attributes.active_color_index=len(body.data.color_attributes)-1;uv=body.data.uv_layers.active
donormi=body_mat_count
tint_stats={'eligible':0,'matched':0,'tinted':0};print('MATERIAL_IDS',mi,donormi)
for face in body.data.polygons:
 for li in face.loop_indices:
  p=body.data.vertices[body.data.loops[li].vertex_index].co;c=np.ones(3)
  if face.material_index==mi:c=bridge_colors.get(poskey(p),head_tone)
  elif face.material_index<body_mat_count and .79<p.z<.86 and abs(p.y)<.06:
   tint_stats['eligible']+=1;orig=colormap.get(cornerkey(p,uv.data[li].uv))
   if tint_stats['eligible']==1:print('COLOR_KEY_DEBUG',cornerkey(p,uv.data[li].uv),[k for k in colormap if k[:3]==poskey(p)][:3])
   if orig is not None:tint_stats['matched']+=1
   if orig is not None and max(orig)>.105:c=tint;tint_stats['tinted']+=1
  colors.data[li].color=tuple(float(x)for x in c)+(1.,)
assert tint_stats['tinted']>100, 'Native skin tint did not apply'
print('TINT_STATS',tint_stats)
for i,mat in enumerate(body.data.materials):
 if not mat or not mat.use_nodes:continue
 shader=mat.node_tree.nodes.get('Principled BSDF')
 if not shader:continue
 vertex=mat.node_tree.nodes.new('ShaderNodeVertexColor');vertex.layer_name='SkinMatch'
 if i==mi:
  shader.inputs['Base Color'].default_value=(1,1,1,1);mat.node_tree.links.new(vertex.outputs['Color'],shader.inputs['Base Color'])
 elif i<body_mat_count and shader.inputs['Base Color'].links:
  source=shader.inputs['Base Color'].links[0].from_socket;mix=mat.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mat.node_tree.links.new(source,mix.inputs[1]);mat.node_tree.links.new(vertex.outputs['Color'],mix.inputs[2]);mat.node_tree.links.new(mix.outputs[0],shader.inputs['Base Color'])

arm.data.pose_position='POSE';bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);body.select_set(True);bpy.context.view_layer.objects.active=arm
out=OUT/'candidate-native-neck.glb';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_skins=True,export_all_influences=False,export_vertex_color='ACTIVE')
report={'body':str(BODY),'body_sha256':hashlib.sha256(BODY.read_bytes()).hexdigest(),'accepted_donor':str(DONOR),'donor_scale_uniform':SCALE,'donor_translation':list(SHIFT),'donor_neck_cut_original_z':DCUT,'donor_rotation':0,'cut_loops':[len(lower),len(upper)],'bridge_faces':len(bridgefaces),'neck_open_edges_after':len(remaining),'scope':'PRIVATE REVIEW ONLY; no public promotion','output':str(out)}
(OUT/'integration.json').write_text(json.dumps(report,indent=2));print('INTEGRATION',report)

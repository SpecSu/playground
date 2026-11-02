"""Original offline club cast. Run: blender -b -t 4 -P scripts/avatars/generate_club_avatars.py -- [--preview] [--only KIND]
No source models, external textures or external character licenses are used.
All body and limb surfaces carry normalized real armature vertex weights.
"""
import bpy, bmesh, math, json, os, sys, argparse
from mathutils import Vector
from pathlib import Path

ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
p=argparse.ArgumentParser();p.add_argument('--preview',action='store_true');p.add_argument('--only');args=p.parse_args(ARGS)
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'public'/'avatars';OUT.mkdir(exist_ok=True)
# A legacy full export (or --only's partial manifest) must never silently undo
# a separately approved sculpt. Reproduce revisioned avatars with their own
# isolated generator, then review before deliberately installing a replacement.
if (OUT/'manifest.json').exists():
 existing=json.loads((OUT/'manifest.json').read_text())
 protected=[entry['kind'] for entry in existing.get('avatars',[]) if entry.get('revision')]
 if protected:raise RuntimeError('Refusing to overwrite revisioned avatar assets: '+', '.join(protected)+'. See scripts/avatars/README.md for isolated regeneration.')
TAU=math.pi*2
COLORS={
 'ink':'282339','cream':'FFF3DC','white':'FFFFFF','sole':'F6EDD9','skin':'995536','skin_light':'E3AC85',
 'orange':'F69342','orange_dark':'CA6428','teal':'57BEB0','teal_dark':'308F83','blue':'386BE4','blue_dark':'2850AE',
 'navy':'30394F','hair':'382734','pink':'F17CA0','purple':'AF83EB','green':'82C47A','green_light':'D8E4A9',
 'fur':'CEA275','fur_light':'F4D6AF','chocolate':'825638','mint':'70DCC2','gold':'FFCD62','gold_dark':'E8A040',
 'burgundy':'A9132C','berry':'DF2140','redhair':'A20E29','leaf':'3F8B47','peach':'F6BD8E','black':'29292D','blackrib':'36353B','blackhair':'222126','brownhair':'6F422C','tan':'B9A17E','tanlight':'CDB897','lens':'EFBD36','blush':'D07B76','red':'E7665C','lilac':'DAC6F4','silver':'BCD2DA',
}
def linear(c): return ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92
MATERIALS={}
def mat(name):
 if name in MATERIALS: return MATERIALS[name]
 h=COLORS.get(name,name); rgb=[linear(int(h[i:i+2],16)/255) for i in (0,2,4)]
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=.46
 bs.inputs['Specular IOR Level'].default_value=.28
 if name in ('gold','silver'): bs.inputs['Metallic'].default_value=.14
 MATERIALS[name]=m;return m

# Anatomical model coordinates: X right, Y depth (negative faces camera), Z up.
def v(x,z,front=0): return (x,-front,z)
def mix(a,b,t): return Vector(a).lerp(Vector(b),t)
def smooth(t): return t*t*(3-2*t)
class Cast:
 def __init__(self,kind): self.kind=kind;self.parts=[];self.bones={};self.profile={}
 def mesh(self,name,verts,faces,color,weights):
  data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(mat(color));data.update()
  obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);self.parts.append(obj)
  for polygon in data.polygons: polygon.use_smooth=True
  groups={}
  for i,w in enumerate(weights):
   for joint,value in w.items():
    if joint not in groups: groups[joint]=obj.vertex_groups.new(name=joint)
    if value>0:groups[joint].add([i],value,'REPLACE')
  return obj
 def sphere(self,name,center,scale,color,bone='head',n=16,m=10):
  verts=[];faces=[]
  # Closed seam and clean pole fans avoid degenerate triangles.
  verts.append((center[0],center[1],center[2]+scale[2]))
  for j in range(1,m):
   phi=math.pi*j/m
   for i in range(n):
    theta=TAU*i/n;verts.append((center[0]+scale[0]*math.sin(phi)*math.cos(theta),center[1]+scale[1]*math.sin(phi)*math.sin(theta),center[2]+scale[2]*math.cos(phi)))
  bottom=len(verts);verts.append((center[0],center[1],center[2]-scale[2]))
  for i in range(n): faces.append((0,1+i,1+(i+1)%n))
  for j in range(m-2):
   for i in range(n):
    a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
  for i in range(n): faces.append((bottom,1+(m-2)*n+(i+1)%n,1+(m-2)*n+i))
  return self.mesh(name,verts,faces,color,[{bone:1} for _ in verts])
 def tube(self,name,points,radii,color,joints,segments=12,sides=12,depth=1):
  verts=[];faces=[];weights=[]
  # points contains bone joint centers. Linear blend weights cross joints over broad soft bands.
  lengths=[0]
  for a,b in zip(points,points[1:]):lengths.append(lengths[-1]+(Vector(b)-Vector(a)).length)
  total=lengths[-1]
  for ring in range(segments+1):
   u=ring/segments;d=u*total;k=min(len(points)-2,next((i for i in range(len(lengths)-1) if d<=lengths[i+1]),len(points)-2))
   t=(d-lengths[k])/max(.00001,lengths[k+1]-lengths[k]);pt=mix(points[k],points[k+1],t)
   tangent=(Vector(points[k+1])-Vector(points[k])).normalized();reference=Vector((0,1,0));side=tangent.cross(reference).normalized();other=tangent.cross(side).normalized()
   ri=min(len(radii)-2,int(u*(len(radii)-1)));rt=u*(len(radii)-1)-ri;r=radii[ri]*(1-rt)+radii[ri+1]*rt
   if isinstance(joints,str): w={joints:1}
   else:
    # Piecewise blend across central area around each articulation; no bone beyond final endpoint.
    jointposition=u*(len(joints)-1);a=min(len(joints)-2,int(jointposition));blend=smooth(jointposition-a)
    w={joints[a]:1-blend,joints[a+1]:blend}
   for i in range(sides):
    angle=TAU*i/sides;co=pt+side*(math.cos(angle)*r)+other*(math.sin(angle)*r*depth);verts.append(co);weights.append(w.copy())
   if ring:
    for i in range(sides):a=(ring-1)*sides+i;b=(ring-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
  # capped ends, no floating open rings
  for end,ring in [(0,0),(len(points)-1,segments)]:
   idx=len(verts);verts.append(points[end]);weights.append({joints if isinstance(joints,str) else joints[min(end,len(joints)-1)]:1})
   for i in range(sides):
    a=ring*sides+i;b=ring*sides+(i+1)%sides;faces.append((idx,b,a) if end==0 else (idx,a,b))
  return self.mesh(name,verts,faces,color,weights)
 def body(self,name,profile,color,depth=.72):
  # Profile is (height, radius, forward offset), smooth stacked contours form one continuous soft surface.
  verts=[];faces=[];weights=[];sides=24
  for j,(z,r,f) in enumerate(profile):
   for i in range(sides):
    t=TAU*i/sides;verts.append((r*math.cos(t),-f+r*depth*math.sin(t),z))
    zs=[self.bones[k][2] for k in ('hips','spine','chest')]
    if z<=zs[0]:w={'hips':1}
    elif z>=zs[2]:w={'chest':1}
    else:
     k=0 if z<zs[1] else 1;t=smooth((z-zs[k])/(zs[k+1]-zs[k]));w={('hips','spine')[k]:1-t,('spine','chest')[k]:t}
    weights.append(w)
   if j:
    for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
  for j in (0,len(profile)-1):
   idx=len(verts);verts.append((0,-profile[j][2],profile[j][0]));weights.append({'hips' if j==0 else 'chest':1})
   for i in range(sides):faces.append((idx,j*sides+(i+1)%sides,j*sides+i) if j==0 else (idx,j*sides+i,j*sides+(i+1)%sides))
  return self.mesh(name,verts,faces,color,weights)
 def line(self,name,points,r,color,bone='head',sides=7): return self.tube(name,points,[r]*len(points),color,bone,segments=max(4,len(points)*2),sides=sides)
 def eyes(self,z,front,gap=.12,size=.065,skin='fur',mood='deadpan'):
  for s in (-1,1):
   x=s*gap
   self.sphere('eye_white',v(x,z,front),(.080,.044,.073) if size==.065 else (size*1.23,size*.65,size*1.1),'cream',n=14,m=8)
   self.sphere('pupil',v(x+s*.008,z-.012,front+.038),(size*.43,.017,size*.53),'ink',n=12,m=8)
   # Upper lids have distinct lowered expressions, geometry covers tops of eye whites.
   self.sphere('sleepy_upper_lid',v(x,z+size*.65,front+.016),(size*1.25,.045,size*.57),skin,n=14,m=8)
   self.line('eyebrow',[v(x-.061,z+.105,front),v(x,z+.12+(s*.013),front+.006),v(x+.06,z+.11,front)],.014,'ink')
 def mouth(self,z,front,width=.06,color='ink',smile=False):
  self.line('mouth',[v(-width,z+.006,front),v(0,z-(.012 if smile else 0),front+.005),v(width,z+.012,front)],.011,color)
 def setup_rig(self,hips,spine,chest,neck,head,shoulder,elbow,hand,hip,knee,ankle):
  self.bones={'root':v(0,0),'hips':hips,'spine':spine,'chest':chest,'neck':neck,'head':head}
  for suffix,sgn in [('L',1),('R',-1)]:
   for key,co in [('upperArm',shoulder),('forearm',elbow),('hand',hand),('thigh',hip),('shin',knee),('foot',ankle)]:self.bones[key+'_'+suffix]=(co[0]*sgn,co[1],co[2])
 def limbs(self,armscolor,legscolor,armr=.12,legr=.15,shoe='cream',handcolor=None):
  for suffix,sgn in [('L',1),('R',-1)]:
   a,e,h=[self.bones[k+'_'+suffix] for k in ('upperArm','forearm','hand')]
   hip,knee,ank=[self.bones[k+'_'+suffix] for k in ('thigh','shin','foot')]
   if self.kind.startswith('human-'):
    self.sphere('rounded_shoulder_'+suffix,a,(armr*1.08,armr*1.02,armr*1.08),armscolor,'upperArm_'+suffix,n=14,m=10)
   self.tube('sleeve_'+suffix,[a,e,h],[armr,armr*1.06,armr*.82,armr*.62],armscolor,['upperArm_'+suffix,'forearm_'+suffix,'hand_'+suffix],segments=14,sides=14)
   self.sphere('hand_'+suffix,h,(armr*.82,armr*.8,armr*.88),handcolor or armscolor,'hand_'+suffix,n=14,m=8)
   # thumb distinguishes hands from terminal balls.
   self.sphere('thumb_'+suffix,(h[0]-sgn*armr*.65,h[1]-.025,h[2]+.028),(armr*.4,armr*.45,armr*.58),handcolor or armscolor,'hand_'+suffix,n=10,m=8)
   self.tube('trouser_'+suffix,[hip,knee,ank],[legr*.94,legr*1.14,legr*.93,legr*.82],legscolor,['thigh_'+suffix,'shin_'+suffix,'foot_'+suffix],segments=14,sides=14,depth=.95)
   self.sphere('foot_'+suffix,(ank[0],ank[1]-.07,.102),(.16,.23,.105),shoe,'foot_'+suffix,n=16,m=8)
 def sneaker(self,suffix,color='cream'):
  a=self.bones['foot_'+suffix];x=a[0];f=-a[1]+.075
  self.sphere('rubber_sole',v(x,.043,f),(.166,.248,.043),'sole','foot_'+suffix,n=16,m=8)
  self.sphere('shoe_toecap',v(x,.1,f+.09),(.154,.145,.065),'cream','foot_'+suffix,n=16,m=8)
  for i in range(3):self.line('laces',[v(x-.07,.169-i*.009,f+.025+i*.031),v(x+.07,.169-i*.009,f+.025+i*.031)],.008,'white','foot_'+suffix)
 def finish(self):
  def join_parts(parts,name):
   bpy.ops.object.select_all(action='DESELECT')
   for part in parts:part.select_set(True)
   bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object;obj.name=name
   bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
   return obj
  def color_material(metal):
   name='Club polished accent' if metal else 'Club soft vinyl'
   if name in bpy.data.materials:return bpy.data.materials[name]
   material=bpy.data.materials.new(name);material.use_nodes=True
   bs=material.node_tree.nodes.get('Principled BSDF');bs.inputs['Roughness'].default_value=.38 if metal else .48;bs.inputs['Metallic'].default_value=.35 if metal else 0;bs.inputs['Specular IOR Level'].default_value=.28
   color=material.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='avatar_color';material.node_tree.links.new(color.outputs['Color'],bs.inputs['Base Color'])
   return material
  def consolidate_colors(obj,metal_allowed=True):
   attribute=obj.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER');old=list(obj.data.materials);metal_indices=[]
   for poly in obj.data.polygons:
    material=old[poly.material_index];rgba=material.diffuse_color
    for loop in poly.loop_indices:attribute.data[loop].color=rgba
    metal_indices.append(1 if metal_allowed and material.name in ('gold','silver','gold_dark') else 0)
   obj.data.materials.clear();obj.data.materials.append(color_material(False))
   if any(metal_indices):obj.data.materials.append(color_material(True))
   for poly,index in zip(obj.data.polygons,metal_indices):poly.material_index=index
  dj_parts=[part for part in self.parts if part.get('role')=='dj'];main=[part for part in self.parts if part not in dj_parts]
  mesh=join_parts(main,self.kind+'_skin')
  # Simplify detail below display scale, retaining all named weights and material boundaries.
  pretris=sum(len(p.vertices)-2 for p in mesh.data.polygons)
  if pretris>13500:
   optimize=mesh.modifiers.new('Budget-aware topology reduction','DECIMATE');optimize.ratio=13300/pretris;optimize.use_collapse_triangulate=True
   bpy.ops.object.modifier_apply(modifier=optimize.name)
  consolidate_colors(mesh)
  accessory=join_parts(dj_parts,self.kind+'_dj_headphones') if dj_parts else None
  if accessory:
   accessory['role']='dj';consolidate_colors(accessory,False)
  arm_data=bpy.data.armatures.new(self.kind+'_skeleton');arm=bpy.data.objects.new(self.kind+'_rig',arm_data);bpy.context.collection.objects.link(arm)
  bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
  parents={'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck'}
  for side in ('L','R'):parents.update({'upperArm_'+side:'chest','forearm_'+side:'upperArm_'+side,'hand_'+side:'forearm_'+side,'thigh_'+side:'hips','shin_'+side:'thigh_'+side,'foot_'+side:'shin_'+side})
  for name,co in self.bones.items():
   b=arm_data.edit_bones.new(name);b.head=co;b.tail=Vector(co)+Vector((0,0,.10));b.roll=0
  for name,parent in parents.items():arm_data.edit_bones[name].parent=arm_data.edit_bones[parent]
  bpy.ops.object.mode_set(mode='OBJECT')
  meshes=[mesh]+([accessory] if accessory else [])
  for ob in meshes:
   ob.parent=arm;mod=ob.modifiers.new('Soft articulated body','ARMATURE');mod.object=arm
  bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
  for ob in meshes:ob.select_set(True)
  bpy.context.view_layer.objects.active=arm
  bpy.ops.export_scene.gltf(filepath=str(OUT/(self.kind+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
  if accessory:accessory.hide_render=True
  triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in meshes)
  print('AVATAR_DONE',self.kind,'triangles',triangles,'bytes',(OUT/(self.kind+'.glb')).stat().st_size,flush=True)
  return arm,mesh,triangles

def ribbon(c,name,center,rx,ry,z,color,bone='head',ruffles=0,thickness=.055):
 verts=[];faces=[];n=64
 for j in range(4):
  r=(.82,.89,1.0,1.01)[j]
  for i in range(n):
   t=TAU*i/n;wave=math.sin(t*ruffles)*.020 if ruffles else 0
   verts.append((center[0]+rx*r*math.cos(t),center[1]+ry*r*math.sin(t),z+center[2]+.16*ry*math.sin(t)+wave+(.015 if j in (1,2) else -.015)))
  if j:
   for i in range(n):a=(j-1)*n+i;b=(j-1)*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 return c.mesh(name,verts,faces,color,[{bone:1} for _ in verts])

def bow(c,x,z,front,color='burgundy',bone='head',size=.12):
 c.sphere('bow_left',v(x-size*.64,z,front),(size*.86,size*.28,size*.59),color,bone,n=12,m=8)
 c.sphere('bow_right',v(x+size*.64,z,front),(size*.86,size*.28,size*.59),color,bone,n=12,m=8)
 c.sphere('bow_knot',v(x,z,front+.024),(size*.31,size*.26,size*.33),color,bone,n=10,m=8)
 for s in (-1,1):c.tube('bow_tail',[v(x+s*size*.1,z-size*.1,front),v(x+s*size*.44,z-size*1.22,front)], [size*.19,size*.25],color,bone,segments=4,sides=7,depth=.4)

def strawberry(c,x,z,front,size=.07,bone='head'):
 c.sphere('strawberry',v(x,z,front),(size*.78,size*.36,size),'berry',bone,n=12,m=8)
 for s in (-1,0,1):
  c.line('strawberry_leaf',[v(x,z+size*.8,front+.013),v(x+s*size*.60,z+size*(1.02 if s else 1.16),front+.015)],size*.14,'leaf',bone)
 for sx,sz in [(-.34,.30),(.34,.30),(0,-.25)]:c.sphere('strawberry_seed',v(x+sx*size,z+sz*size,front+size*.37),(size*.075,size*.05,size*.12),'gold',bone,n=6,m=4)

def human(kind):
 c=Cast(kind);jiji=kind=='human-jiji';lx=kind=='human-lx';skin='peach';pants='black' if lx else 'tan';top='black' if lx else 'cream';hair='redhair' if jiji else 'blackhair' if lx else 'brownhair'
 # Adult reference likeness in polished, oversized-head collectible proportions.
 c.setup_rig(v(0,.70),v(0,.91),v(0,1.09),v(0,1.23),v(0,1.56),v(.24,1.09),v(.38,.87,.018),v(.46,.73,.07),v(.135,.68),v(.16,.40,.02),v(.18,.13))
 if jiji:
  # One continuous skirt with gentle folds, broad white hem, waist-fitted bodice.
  profile=[(.47,.32,0),(.50,.355,0),(.59,.34,0),(.72,.28,0),(.82,.185,0),(.95,.18,0),(1.08,.215,0),(1.135,.105,0)]
  c.body('strawberry_dress',profile,'burgundy',depth=.80)
  c.body('white_frilled_hem',[(.458,.31,0),(.475,.358,0),(.502,.362,0)],'cream',depth=.81)
  c.limbs('cream',skin,armr=.086,legr=.098,shoe='burgundy',handcolor=skin)
  for part in c.parts:
   if part.name.startswith('sleeve_'):
    part.data.materials.append(mat(skin))
    for polygon in part.data.polygons:
     if sum(part.data.vertices[i].co.z for i in polygon.vertices)/len(polygon.vertices)<.89:polygon.material_index=1
  for suffix,s in [('L',1),('R',-1)]:
   # Red Mary Janes with white socks and a tiny bow.
   a=c.bones['foot_'+suffix]
   c.tube('white_sock',[v(a[0],.12),v(a[0],.285)],[.093,.101,.092],'cream',['foot_'+suffix,'shin_'+suffix],segments=5,sides=12)
   c.line('mary_jane_strap',[v(a[0]-.113,.167,.06),v(a[0],.188,.085),v(a[0]+.113,.167,.06)],.021,'burgundy','foot_'+suffix)
   c.sphere('shoe_sole',v(a[0],.035,.075),(.164,.237,.033),'chocolate','foot_'+suffix,n=14,m=6)
   bow(c,a[0],.133,.23,'burgundy','foot_'+suffix,size=.045)
  # White lacing and edge stitch read at a few hundred pixels.
  for i in range(4):
   z=.84+i*.063
   c.line('white_corset_cross',[v(-.042,z,.154),v(.042,z+.051,.157)],.009,'cream','spine')
   c.line('white_corset_cross',[v(.042,z,.154),v(-.042,z+.051,.157)],.009,'cream','spine')
  for s in (-1,1):
   c.line('pinafore_strap',[v(s*.145,.87,.122),v(s*.16,1.07,.119),v(s*.13,1.15,.03)],.025,'burgundy','chest')
   c.line('dress_panel_lace',[v(s*.085,.79,.176),v(s*.16,.64,.236),v(s*.21,.49,.26)],.021,'cream','hips')
  for x,z in [(-.24,.57),(0,.55),(.24,.57)]:strawberry(c,x,z,.251,size=.054,bone='hips')
  bow(c,0,.80,.183,'berry','spine',size=.095)
  strawberry(c,0,.795,.225,size=.032,bone='spine')
  # Compact strawberry backpack is visible in three-quarter/back views.
  c.sphere('strawberry_backpack',v(0,.97,-.215),(.205,.13,.23),'berry','chest',n=16,m=10)
  for s in (-1,1):c.line('backpack_strap',[v(s*.13,1.14,-.08),v(s*.18,.91,-.10)],.026,'burgundy','chest')
 else:
  c.body('cuffed_trousers',[(.61,.20,0),(.70,.225,0),(.78,.20,0)],pants,depth=.7)
  c.limbs(top,pants,armr=.107,legr=.116,shoe='cream',handcolor=skin)
  for s in ('L','R'):c.sneaker(s)
  c.body('hoodie' if lx else 'white_tshirt',[(.74,.19,0),(.78,.23,0),(.93,.24,0),(1.09,.255,0),(1.15,.13,0)],top if lx else 'white',depth=.72)
  if lx:
   c.body('hoodie_waistband',[(.735,.20,0),(.77,.226,0),(.805,.226,0)],'blackrib',depth=.75)
   c.sphere('hood',v(0,1.15,-.015),(.245,.185,.114),'blackrib','chest',n=18,m=10)
   c.line('hood_opening',[v(-.145,1.18,.085),v(0,1.11,.175),v(.145,1.18,.085)],.024,'black','chest')
   c.sphere('kangaroo_pocket',v(0,.85,.175),(.16,.025,.081),'blackrib','spine',n=16,m=8)
   for s in (-1,1):
    c.line('hoodie_drawstring',[v(s*.063,1.14,.184),v(s*.069,.97,.197)],.013,'blackrib','chest')
    c.sphere('drawstring_aglet',v(s*.069,.969,.198),(.014,.012,.022),'silver','chest',n=8,m=6)
  else:
   # Open jacket leaves the contrasting white tee and yellow lenses visible.
   for s in (-1,1):
    c.tube('open_jacket_front',[v(s*.14,.775,.04),v(s*.17,.94,.06),v(s*.18,1.09,.02)],[.084,.097,.11], 'cream',['spine','chest','chest'],segments=10,sides=12,depth=.80)
    c.line('jacket_lapel',[v(s*.10,.82,.138),v(s*.12,1.02,.16),v(s*.11,1.15,.11)],.027,'cream','chest')
    c.line('jacket_lapel_fold',[v(s*.13,1.13,.154),v(s*.18,1.035,.154),v(s*.1,1.015,.177)],.010,'tan','chest')
   # Sunglasses hang vertically from collar as in the reference.
   for z in (1.055,.966):
    c.sphere('yellow_sunglass_lens',v(.017,z,.195),(.047,.012,.039),'lens','chest',n=12,m=8)
    c.line('sunglass_frame',[v(-.028,z+.031,.203),v(.056,z+.031,.203),v(.059,z-.03,.203),v(-.029,z-.03,.203),v(-.028,z+.031,.203)],.005,'gold_dark','chest')
   c.line('sunglass_bridge',[v(.015,1.03,.203),v(.015,.99,.203)],.006,'gold_dark','chest')
  for suffix,s in [('L',1),('R',-1)]:
   c.tube('trouser_cuff',[v(s*.18,.165),v(s*.177,.22)],[.107,.111], 'blackrib' if lx else 'tanlight','shin_'+suffix,segments=3,sides=12)
   c.line('pant_seam',[v(s*.19,.61,.099),v(s*.23,.37,.073),v(s*.235,.2,.062)],.005,'blackrib' if lx else 'tanlight','shin_'+suffix)
 c.tube('neck',[v(0,1.15),v(0,1.30)],[.084,.089],skin,['neck','head'],segments=4,sides=12)
 # Oversized but clearly adult heads, smooth cheeks and sculpted chin.
 c.sphere('adult_face',v(0,1.54,.023),(.292,.223,.32),skin,n=24,m=16)
 c.sphere('soft_jaw',v(0,1.43,.04),(.241,.20,.16),skin,n=18,m=10)
 for s in (-1,1):
  c.sphere('ear',v(s*.284,1.525,.028),(.051,.045,.083),skin,n=12,m=8)
  c.sphere('ear_detail',v(s*.304,1.52,.062),(.020,.012,.042),'blush',n=10,m=6)
 # Human faces are gently playful. Animals/monsters retain the deadpan eyes.
 for s in (-1,1):
  c.sphere('eye_white',v(s*.11,1.565,.220),(.084,.032,.064),'white',n=16,m=10)
  c.sphere('iris',v(s*.11+.017,1.566,.247),(.038,.017,.048),'ink',n=12,m=8)
  c.sphere('eye_glint',v(s*.11+.010,1.588,.261),(.009,.004,.011),'white',n=8,m=6)
  c.line('upper_lash',[v(s*.11-.075,1.59,.233),v(s*.11,1.621,.238),v(s*.11+.07,1.596,.235)],.013,'redhair' if jiji else hair)
  c.line('eyebrow',[v(s*.11-.066,1.66,.205),v(s*.11,1.68,.208),v(s*.11+.061,1.665,.204)],.019,hair)
 c.sphere('button_nose',v(0,1.502,.249),(.032,.036,.040),skin,n=12,m=8)
 c.sphere('smiling_mouth',v(0,1.412,.222),(.073,.013,.040),'ink',n=16,m=8)
 c.sphere('smile_teeth',v(0,1.426,.234),(.054,.005,.014),'cream',n=12,m=6)
 if jiji:
  c.sphere('red_hair_crown',v(0,1.77,-.014),(.302,.244,.19),hair,n=20,m=12)
  for i in range(5):
   x=(i-2)*.105;c.tube('shaped_fringe',[v(x*.75,1.86,.10),v(x,1.77,.18),v(x+.027,1.68,.205)], [.09,.074,.024],hair,'head',segments=8,sides=12,depth=.45)
  for s in (-1,1):
   points=[v(s*.27,1.65,-.015),v(s*.36,1.47,-.005),v(s*.31,1.28,.015),v(s*.39,1.14,.022),v(s*.31,1.01,.028)]
   c.tube('curly_twin_tail',points,[.103,.105,.092,.082,.018],hair,'head',segments=20,sides=14,depth=.75)
   c.line('curl_highlight',[v(s*.335,1.47,.066),v(s*.292,1.30,.08),v(s*.38,1.15,.079)],.013,'berry')
   bow(c,s*.305,1.61,.057,'berry',size=.056)
  # Wide red bonnet with a continuous white scalloped edge.
  c.sphere('bonnet_crown',v(0,1.978,-.025),(.415,.309,.197),'burgundy',n=24,m=14)
  ribbon(c,'bonnet_brim',(0,0,0),.52,.365,1.914,'burgundy')
  ribbon(c,'white_bonnet_frill',(0,0,0),.542,.384,1.898,'cream',ruffles=22)
  for i in range(17):
   t=math.pi+math.pi*i/16
   c.sphere('lace_scallop',(math.cos(t)*.48,math.sin(t)*.33,1.899+.16*.33*math.sin(t)),(.041,.029,.032),'cream','head',n=8,m=6)
  bow(c,-.18,2.112,.15,'burgundy',size=.105)
  strawberry(c,-.22,2.052,.278,size=.074)
  # Signature gold pocket-watch accessory with tiny readable hands.
  c.sphere('gold_watch_rim',v(.01,2.051,.313),(.076,.024,.084),'gold_dark','head',n=20,m=10)
  c.sphere('watch_face',v(.01,2.051,.337),(.063,.007,.070),'cream','head',n=20,m=10)
  c.line('watch_hands',[v(-.017,2.08,.346),v(.01,2.051,.346),v(.046,2.063,.346)],.006,'chocolate')
  c.sphere('watch_crown',v(.01,2.146,.307),(.018,.015,.022),'gold_dark','head',n=8,m=6)
  # White animal-shaped hat charm, simplified without a branded logotype.
  c.sphere('white_cat_charm',v(.23,2.048,.276),(.097,.024,.07),'cream','head',n=14,m=8)
  for s in (-1,1):
   c.tube('charm_ear',[v(.23+s*.062,2.093,.274),v(.23+s*.068,2.134,.274)],[.029,.007],'cream','head',segments=3,sides=7,depth=.6)
   c.sphere('charm_eye',v(.23+s*.035,2.05,.3),(.007,.005,.012),'ink','head',n=6,m=4)
  bow(c,.305,2.092,.3,'berry',size=.033)
  for i in range(7):
   x=(i-3)*.032;c.sphere('necklace_bead',v(x,1.202-abs(i-3)*.004,.091+(.035 if abs(i-3)<2 else .015)),(.014,.014,.016),['pink','gold','teal'][i%3],'neck',n=8,m=6)
 elif lx:
  c.sphere('short_black_hair',v(0,1.764,-.031),(.30,.224,.169),hair,n=20,m=12)
  for i in range(5):
   x=(i-2)*.098;c.tube('swept_hair_lock',[v(x+.04,1.88,.04),v(x-.04,1.78,.157),v(x-.065,1.696+(i%2)*.055,.206)],[.069,.086,.004],hair,'head',segments=8,sides=10,depth=.45)
  for s in (-1,1):
   # Thick rounded-rectangle spectacles, sized to remain unmistakable onstage.
   x=s*.12;points=[v(x-.101,1.625,.255),v(x+.090,1.625,.255),v(x+.103,1.603,.261),v(x+.091,1.515,.255),v(x-.084,1.515,.255),v(x-.103,1.538,.259),v(x-.101,1.625,.255)]
   c.line('black_glasses_frame',points,.015,'ink')
   c.line('glasses_temple',[v(s*.219,1.613,.246),v(s*.286,1.614,.05)],.013,'ink')
  c.line('glasses_bridge',[v(-.028,1.586,.265),v(0,1.600,.274),v(.028,1.586,.265)],.014,'ink')
 else:
  c.sphere('brown_hair_volume',v(0,1.77,-.025),(.30,.22,.166),hair,n=20,m=12)
  for i in range(6):
   x=(i-2.4)*.091;c.tube('side_swept_hair',[v(x+.09,1.875,.018),v(x,1.79,.157),v(x-.065,1.695+(i%2)*.036,.204)],[.072,.085,.006],hair,'head',segments=9,sides=10,depth=.48)
  c.line('hair_part',[v(.11,1.89,.017),v(.14,1.818,.14)],.010,'chocolate')
 if jiji:
  # Lower cloth follows the moving thighs, keeping the dress around raised knees.
  # The same field deforms hem/lace/fruit details with the underlying skirt.
  for part in c.parts:
   hips=part.vertex_groups.get('hips')
   if not hips:continue
   left=part.vertex_groups.get('thigh_L') or part.vertex_groups.new(name='thigh_L')
   right=part.vertex_groups.get('thigh_R') or part.vertex_groups.new(name='thigh_R')
   for vertex in part.data.vertices:
    weight=next((g.weight for g in vertex.groups if g.group==hips.index),0)
    if weight<.999 or vertex.co.z>=.80:continue
    amount=min(.76,max(0,(.80-vertex.co.z)/.30)*.76);side=min(1,max(0,.5+vertex.co.x/.32))
    hips.add([vertex.index],1-amount,'REPLACE');left.add([vertex.index],amount*side,'REPLACE');right.add([vertex.index],amount*(1-side),'REPLACE')
 return c

def animal(kind):
 c=Cast(kind)
 colors={'cat':('fur','fur_light'),'frog':('green','green_light'),'dog':('chocolate','fur'),'capybara':('fur','fur_light'),'panda':('cream','ink')}
 coat,bib=colors[kind];frog=kind=='frog';panda=kind=='panda';headz=1.30 if kind!='dog' else 1.32
 c.setup_rig(v(0,.58),v(0,.79),v(0,1.04),v(0,1.14),v(0,headz),v(.28,1.02),v(.44,.79,.01),v(.48,.64,.08),v(.19,.54),v(.23,.34),v(.24,.12))
 c.body('round_body',[(.44,.20,0),(.49,.31,0),(.61,.39,0),(.78,.38,0),(.94,.32,0),(1.08,.24,0),(1.13,.12,0)],coat,depth=.78)
 c.sphere('belly_patch',v(0,.79,.267),(.24,.065,.26),bib,'spine',n=20,m=12)
 limbcoat='ink' if panda else coat;c.limbs(limbcoat,limbcoat,armr=.095 if frog else .13,legr=.13,shoe=limbcoat)
 if frog:
  c.sphere('frog_head',v(0,1.28,.01),(.38,.255,.22),coat,n=24,m=14)
  c.sphere('wide_mouth',v(0,1.19,.19),(.29,.09,.098),bib,n=20,m=10)
  for s in (-1,1):c.sphere('eye_mound',v(s*.22,1.47,.075),(.125,.128,.13),coat,n=16,m=10)
  c.eyes(1.488,.178,gap=.22,size=.075,skin=coat);c.mouth(1.188,.281,width=.18)
  for suffix,sgn in [('L',1),('R',-1)]:
   h=c.bones['hand_'+suffix]
   for i in range(3):c.line('frog_finger',[(h[0],h[1],h[2]),(h[0]+sgn*(.07+i*.015),h[1]-.065+i*.035,h[2]-.02)],.019,coat,'hand_'+suffix)
 else:
  sc=(.34,.27,.29) if kind!='dog' else (.28,.27,.30)
  c.sphere('animal_head',v(0,headz),sc,coat,n=24,m=14)
  if kind=='cat':
   for s in (-1,1):
    # Rounded triangular ears are tapered custom tubes, avoiding cone primitives.
    c.tube('cat_ear',[v(s*.22,1.46,-.025),v(s*.27,1.65,-.02)],[.135,.105,.012],coat,'head',segments=7,sides=14,depth=.56)
    c.tube('ear_velvet',[v(s*.223,1.52,.047),v(s*.264,1.63,.045)],[.065,.047,.008],'pink','head',segments=5,sides=12,depth=.3)
   for s in (-1,1):c.sphere('muzzle',v(s*.10,1.2,.246),(.12,.071,.084),'fur_light',n=16,m=8)
   c.sphere('nose',v(0,1.235,.31),(.04,.024,.026),'pink',n=12,m=8)
   for s in (-1,1):
    for i in range(2):c.line('whisker',[v(s*.135,1.21-i*.044,.28),v(s*.31,1.25-i*.061,.263)],.005,'ink')
   for x in (-.11,0,.11):c.line('tabby_forehead',[v(x,1.49,.212),v(x*.9,1.43,.245)],.027,'chocolate')
   c.line('curling_tail',[v(.12,.57,-.19),v(.39,.64,-.23),v(.52,.97,-.22),v(.49,1.16,-.22)],.066,coat,'hips',sides=12)
  elif kind=='dog':
   for s in (-1,1):
    c.sphere('long_floppy_ear',v(s*.283,1.19,-.014),(.13,.102,.34),'chocolate',n=18,m=12)
    c.line('ear_fold',[v(s*.34,1.35,.068),v(s*.35,1.16,.08),v(s*.29,1.03,.058)],.017,'fur')
   c.sphere('hound_muzzle',v(0,1.25,.24),(.19,.17,.10),'fur',n=20,m=10)
   c.sphere('wet_nose',v(0,1.279,.375),(.08,.045,.048),'ink',n=14,m=8)
   c.line('wag_tail',[v(.07,.58,-.19),v(.30,.70,-.29),v(.32,.93,-.27)],.037,'chocolate','hips')
   c.line('collar',[v(-.18,1.095,.08),v(0,1.07,.155),v(.18,1.095,.08)],.038,'teal','neck',sides=10)
   c.sphere('collar_tag',v(0,1.04,.196),(.04,.012,.045),'gold','neck',n=12,m=8)
  elif kind=='capybara':
   c.sphere('broad_capy_muzzle',v(0,1.23,.18),(.27,.21,.17),'fur',n=22,m=12)
   for s in (-1,1):
    c.sphere('tiny_round_ear',v(s*.245,1.51,-.03),(.072,.07,.085),coat,n=14,m=10)
    c.sphere('nostril',v(s*.067,1.29,.38),(.018,.012,.015),'chocolate',n=10,m=6)
   c.mouth(1.14,.355,width=.074)
  elif panda:
   for s in (-1,1):
    c.sphere('panda_ear',v(s*.25,1.54,-.03),(.11,.086,.11),'ink',n=16,m=10)
    c.sphere('panda_eye_patch',v(s*.14,1.35,.233),(.105,.04,.132),'ink',n=16,m=10)
   c.sphere('panda_muzzle',v(0,1.205,.24),(.17,.078,.103),'cream',n=18,m=10)
   c.sphere('nose',v(0,1.243,.317),(.045,.027,.031),'ink',n=12,m=8)
  if kind=='capybara':
   start=len(c.parts)
   c.line('headphone_band',[v(-.345,1.30),v(-.33,1.53),v(-.17,1.665),v(.17,1.665),v(.33,1.53),v(.345,1.30)],.032,'ink','head',sides=10)
   for sign in (-1,1):
    c.sphere('headphone_cup',v(sign*.343,1.32),(.069,.119,.146),'ink','head',n=14,m=10)
    c.sphere('headphone_accent',v(sign*.401,1.32),(.018,.087,.105),'teal','head',n=12,m=8)
   for part in c.parts[start:]:part['role']='dj'
  c.eyes(headz+.055,.247 if kind not in ('dog','panda') else .266,gap=.14 if kind!='dog' else .115,size=.062,skin=coat if not panda else 'ink')
  if kind!='capybara':c.mouth(headz-.18,.299 if kind!='dog' else .357,width=.05)
 return c

def monster(kind):
 c=Cast(kind);tower=kind=='monster-tower';star=kind=='monster-star';coat='gold' if tower else 'pink' if star else 'purple';hz=2.06 if tower else 1.35 if star else 1.53
 shoulderz=1.34 if tower else 1.02 if star else 1.15
 c.setup_rig(v(0,.66),v(0,.99),v(0,shoulderz),v(0,hz-.2),v(0,hz),v(.19 if tower else .28,shoulderz),v(.42 if tower else .5,shoulderz-.24,.015),v(.58 if tower else .62,shoulderz-.37,.06),v(.18,.64),v(.27,.34),v(.31,.12))
 if tower:
  c.body('tall_swaying_body',[(.57,.22,0),(.69,.31,0),(.90,.31,0),(1.16,.23,0),(1.39,.15,0),(1.68,.16,0),(1.92,.19,0),(2.13,.17,0),(2.24,.1,0),(2.265,.005,0)],coat,depth=.84)
  c.sphere('tower_face',v(0,2.05,.10),(.18,.105,.19),coat,'head',n=20,m=12)
  for s in (-1,1):c.line('soft_horns',[v(s*.09,2.22),v(s*.12,2.40)],.032,'gold_dark','head',sides=10);c.sphere('horn_tip',v(s*.12,2.405),(.06,.045,.059),'gold','head',n=12,m=8)
  c.eyes(2.08,.197,gap=.08,size=.052,skin=coat);c.mouth(1.98,.208,width=.04)
 elif star:
  # One closed rounded five-lobe star silhouette, front/back domed rather than stacked balls.
  points=[];n=60;rings=9;verts=[];weights=[];faces=[]
  for j in range(rings):
   phi=math.pi*j/(rings-1);depth=-math.cos(phi)*.24
   for i in range(n):
    theta=TAU*i/n+math.pi/2;r=(.40+.18*(.5+.5*math.cos(5*(theta-math.pi/2))))*math.sin(phi)
    x=r*math.cos(theta);z=1.15+r*math.sin(theta);verts.append((x,depth,z))
    if z<.95:
     t=min(1,max(0,(z-.65)/.30));weights.append({'hips':1-t,'spine':t})
    else:
     t=min(1,max(0,(z-.95)/.40));weights.append({'spine':1-t,'chest':t})
   if j:
    for i in range(n):a=(j-1)*n+i;b=(j-1)*n+(i+1)%n;faces.append((a,b,b+n,a+n))
  c.mesh('soft_five_point_star',verts,faces,coat,weights)
  c.sphere('star_face_plane',v(0,1.22,.185),(.23,.094,.25),coat,'head',n=20,m=12)
  c.eyes(1.3,.272,gap=.105,size=.057,skin=coat);c.mouth(1.17,.274,width=.047)
  for s in (-1,1):c.sphere('star_cheek',v(s*.18,1.195,.235),(.055,.015,.025),'red','head',n=12,m=6)
 else:
  c.body('squishy_pear_body',[(.53,.23,0),(.62,.42,0),(.81,.49,0),(1.01,.47,0),(1.22,.37,0),(1.43,.30,0),(1.64,.25,0),(1.77,.13,0),(1.80,.01,0)],coat,depth=.78)
  c.sphere('blob_face_plane',v(0,1.51,.16),(.27,.106,.22),coat,'head',n=20,m=12)
  c.sphere('belly',v(0,.91,.322),(.29,.084,.31),'lilac','spine',n=20,m=12)
  for x,z in [(-.17,1.75),(.13,1.78)]:c.sphere('soft_head_nub',v(x,z),(.085,.079,.099),coat,'head',n=12,m=8)
  c.eyes(1.56,.272,gap=.12,size=.064,skin=coat);c.mouth(1.44,.273,width=.057)
 c.limbs(coat,coat,armr=.067 if tower else .092 if star else .14,legr=.095 if tower else .106 if star else .15,shoe=coat)
 return c

KINDS=['human-jiji','human-subeike','human-lx','cat','frog','dog','capybara','panda','monster-blob','monster-tower','monster-star']
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
results=[];objects=[]
for kind in KINDS:
 if args.only and args.only!=kind:continue
 builder=human(kind) if kind.startswith('human') else monster(kind) if kind.startswith('monster') else animal(kind)
 factor={'frog':.77,'cat':.87}.get(kind,1)
 if factor!=1:
  for part in builder.parts:
   for vertex in part.data.vertices:vertex.co*=factor
  builder.bones={name:tuple(factor*v for v in co) for name,co in builder.bones.items()}
 arm,mesh,tris=builder.finish();results.append({'kind':kind,'triangles':tris,'bytes':(OUT/(kind+'.glb')).stat().st_size});objects.append((arm,mesh))
 # Hide completed characters while constructing the next.
 arm.hide_render=True;mesh.hide_render=True
(OUT/'manifest.json').write_text(json.dumps({'generator':'scripts/avatars/generate_club_avatars.py','provenance':'Original code-authored geometry; human appearance follows user-provided character references. No external models or textures.','rig':'club-v1-18-joints','avatars':results},indent=2)+'\n')
if args.preview:
 for i,(arm,mesh) in enumerate(objects):
  arm.hide_render=False;mesh.hide_render=False;arm.location=( (i%5-2)*1.55,(i//5)*2.2,0);arm.rotation_euler[2]=-.12
  # Sample choreographed pose for visual QA only; export was in rest pose.
  for name,rot in {'hips':(0,.025,.07),'spine':(.02,-.02,-.1),'upperArm_L':(.05,.1,-.52),'forearm_L':(-.5,.0,-.38),'upperArm_R':(-.05,-.12,.28),'forearm_R':(-.8,0,.12),'thigh_L':(-.05,0,-.09),'shin_L':(.11,0,0),'head':(-.04,0,.06)}.items():
   bone=arm.pose.bones[name];bone.rotation_mode='XYZ';bone.rotation_euler=rot
 scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=False
 scene.render.resolution_x=1800;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
 scene.world.color=(.25,.25,.25)
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.018));floor=bpy.context.object;floor.data.materials.append(mat('DAC9ED'))
 def area(name,loc,energy,color,size):
  data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size;ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob.location=loc;ob.rotation_euler=(Vector((0,1,1))-ob.location).to_track_quat('-Z','Y').to_euler()
 area('key',(0,-5,8),1300,(1,.88,.78),7);area('cool_rim',(4,4,6),1500,(.5,.73,1),6);area('fill',(-6,-1,4),900,(.8,.7,1),5)
 data=bpy.data.cameras.new('preview_camera');cam=bpy.data.objects.new('preview_camera',data);bpy.context.collection.objects.link(cam);scene.camera=cam;cam.location=(5,-14,9);cam.rotation_euler=(Vector((0,1,1.1))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=9.4
 scene.view_settings.view_transform='AgX';preview=ROOT.parent/'avatar-offline-previews';preview.mkdir(exist_ok=True);scene.render.filepath=str(preview/'cast-preview.png');bpy.ops.wm.save_as_mainfile(filepath=str(preview/'cast-preview.blend'));bpy.ops.render.render(write_still=True)

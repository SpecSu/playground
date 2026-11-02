"""Original compact sulphur-crested cockatoo DJ. Blender 4.3, no external assets.
Run: blender -b -t 4 -P scripts/avatars/cockatoo/generate_cockatoo.py
Writes only into generated/ unless --output-dir selects an isolated review directory. Authoring coordinates: X right, -Y front, Z up;
GLB export is Y-up, +Z front. Existing eighteen upright-axis bones plus crest.
"""
import bpy, bmesh, math, json, hashlib, argparse, sys
from pathlib import Path
from mathutils import Vector
parser=argparse.ArgumentParser();parser.add_argument("--output-dir",type=Path);args=parser.parse_args(sys.argv[sys.argv.index("--")+1:]if "--"in sys.argv else[])
ROOT=(args.output_dir or Path(__file__).resolve().parent/'generated').resolve();ROOT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
TAU=math.tau
PARTS=[]
def V(x,z,f=0):return Vector((x,-f,z))
def clamp(t):return max(0,min(1,t))
def smooth(t):t=clamp(t);return t*t*(3-2*t)
def linear(t):return ((t+.055)/1.055)**2.4 if t>.04045 else t/12.92
COLORS={'white':'FCFAF3','ivory':'EDEADB','yellow':'FFDA27','pale_yellow':'FFEB85','beak':'34373C','foot':'41474D','frame':'101318','lens':'252C35','glint':'87929E'}
GROUPS={'white':'White_flock','ivory':'White_flock','yellow':'Sulphur_crest','pale_yellow':'Sulphur_crest','beak':'Graphite_beak_feet','foot':'Graphite_beak_feet','frame':'Obsidian_sunglasses','lens':'Obsidian_sunglasses','glint':'Obsidian_sunglasses'}
M={}
for name,h in COLORS.items():
 m=bpy.data.materials.new(name);m.use_nodes=True;rgb=[linear(int(h[i:i+2],16)/255)for i in (0,2,4)];m.diffuse_color=(*rgb,1)
 bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=.44;bs.inputs['Specular IOR Level'].default_value=.32;m['surface_group']=GROUPS[name];M[name]=m
JOINTS={'root':V(0,0),'hips':V(0,.72),'spine':V(0,1.10),'chest':V(0,1.58),'neck':V(0,1.78),'head':V(0,2.04,.025),'crest':V(0,2.38,-.02)}
for side,s in [('L',1),('R',-1)]:
 for name,p in {'upperArm':V(.455,1.62,.015),'forearm':V(.69,1.265,.12),'hand':V(.56,.935,.34),'thigh':V(.255,.66),'shin':V(.26,.365,.025),'foot':V(.26,.13,.055)}.items():JOINTS[name+'_'+side]=Vector((p.x*s,p.y,p.z))
def body_weights(p):
 z=p[2]
 if z<.72:return {'hips':1}
 if z<1.1:t=smooth((z-.72)/.38);return {'hips':1-t,'spine':t}
 t=smooth((z-1.10)/.48);return {'spine':1-t,'chest':t}
def neck_weights(p):
 t=smooth((p[2]-1.56)/.35);return {'chest':1-t,'neck':t}
def head_weights(p):
 t=smooth((p[2]-1.66)/.22);return {'neck':1-t,'head':t}
def mesh(name,verts,faces,color,bone='head',weights=None):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(M[color]);data.update()
 ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);ob['avatar_part']=True;ob['semantic_part']=name;PARTS.append(ob)
 for p in data.polygons:p.use_smooth=True
 bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(data);bm.free()
 groups={}
 for i,p in enumerate(verts):
  w=weights[i] if weights is not None else ({bone:1}if isinstance(bone,str)else bone(p));total=sum(w.values())
  for joint,value in w.items():
   if value<=1e-6:continue
   if joint not in groups:groups[joint]=ob.vertex_groups.new(name=joint)
   groups[joint].add([i],value/total,'REPLACE')
 return ob

def sphere(name,center,scale,color,bone='head',n=24,m=16,exponent=2):
 verts=[center+Vector((0,0,scale[2]))];faces=[]
 def power(v):return math.copysign(abs(v)**(2/exponent),v)
 for j in range(1,m):
  p=math.pi*j/m
  for i in range(n):
   t=TAU*i/n;verts.append(center+Vector((scale[0]*math.sin(p)*power(math.cos(t)),scale[1]*math.sin(p)*power(math.sin(t)),scale[2]*math.cos(p))))
 bottom=len(verts);verts.append(center-Vector((0,0,scale[2])))
 for i in range(n):faces.append((0,1+i,1+(i+1)%n))
 for j in range(m-2):
  for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
 for i in range(n):faces.append((bottom,1+(m-2)*n+(i+1)%n,1+(m-2)*n+i))
 return mesh(name,verts,faces,color,bone)
def bezier(a,b,c,d,steps=16):return [(1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d for t in [i/steps for i in range(steps+1)]]
def sweep(name,points,widths,depths,color,bone='head',sides=12,weights=None):
 verts=[];faces=[];ws=[]
 for j,p in enumerate(points):
  p=Vector(p);t=j/(len(points)-1);tangent=(Vector(points[min(j+1,len(points)-1)])-Vector(points[max(0,j-1)])).normalized();side=tangent.cross(Vector((0,1,0))).normalized()
  if side.length<.1:side=Vector((1,0,0))
  depth=tangent.cross(side).normalized();w=widths[j]if isinstance(widths,list)else widths;d=depths[j]if isinstance(depths,list)else depths
  for i in range(sides):
   angle=TAU*i/sides;verts.append(p+side*math.cos(angle)*w+depth*math.sin(angle)*d);ws.append(weights(t)if weights else ({bone:1}if isinstance(bone,str)else bone(verts[-1])))
  if j:
   for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
 for j in (0,len(points)-1):
  idx=len(verts);verts.append(points[j]);ws.append(ws[j*sides])
  for i in range(sides):a=j*sides+i;b=j*sides+(i+1)%sides;faces.append((idx,b,a)if j==0 else(idx,a,b))
 return mesh(name,verts,faces,color,bone,ws)
def feather(name,points,width,depth,color,bone='head',steps=14,weights=None):
 path=bezier(*points,steps=steps);ws=[.003+width*(max(0,math.sin(math.pi*t))**.65)*(1-.2*t)for t in [i/steps for i in range(steps+1)]];ds=[.003+depth*max(0,math.sin(math.pi*i/steps))**.6 for i in range(steps+1)]
 return sweep(name,path,ws,ds,color,bone,sides=12,weights=weights)
def line(name,points,r,color,bone='head',sides=10):return sweep(name,points,r,r,color,bone,sides)

# One uninterrupted body-neck-head surface avoids toy-part collar seams.
PROFILE=[(.405,.016,.014,-.01),(.45,.19,.14,-.01),(.57,.36,.27,-.01),(.77,.49,.37,-.01),(1.02,.56,.424,-.01),(1.23,.54,.414,-.005),(1.43,.47,.365,0),(1.61,.395,.312,0),(1.72,.352,.294,.01),(1.82,.388,.315,.018),(1.94,.450,.357,.02),(2.055,.47,.371,.02),(2.17,.450,.351,.02),(2.29,.378,.30,.018),(2.39,.270,.219,.016),(2.45,.129,.106,.015),(2.470,.008,.007,.014)]
verts=[];faces=[];ws=[];sides=36;steps=4
joint_heights=[('hips',.72),('spine',1.10),('chest',1.58),('neck',1.78),('head',2.00)]
def trunk_weights(z):
 if z<=joint_heights[0][1]:return {'hips':1}
 if z>=joint_heights[-1][1]:return {'head':1}
 for (a,az),(b,bz)in zip(joint_heights,joint_heights[1:]):
  if z<=bz:t=smooth((z-az)/(bz-az));return {a:1-t,b:t}
for j in range((len(PROFILE)-1)*steps+1):
 k=min(len(PROFILE)-2,j//steps);t=(j-k*steps)/steps;z=PROFILE[k][0]*(1-t)+PROFILE[k+1][0]*t;values=[]
 for axis in (1,2,3):
  p0=PROFILE[max(0,k-1)][axis];p1=PROFILE[k][axis];p2=PROFILE[k+1][axis];p3=PROFILE[min(len(PROFILE)-1,k+2)][axis]
  values.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
 rx,rd,f=values
 for i in range(sides):angle=TAU*i/sides;verts.append(V(rx*math.cos(angle),z,f+rd*math.sin(angle)));ws.append(trunk_weights(z))
 if j:
  for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
for ring,index in [(0,0),((len(PROFILE)-1)*steps,-1)]:
 z,rx,rd,f=PROFILE[index];idx=len(verts);verts.append(V(0,z,f));ws.append(trunk_weights(z))
 for i in range(sides):faces.append((idx,ring*sides+i,ring*sides+(i+1)%sides))
mesh('Body_neck_head_continuous',verts,faces,'white',weights=ws)
# Subtle sulphur cheek marks are characteristic of white cockatoos.
for s in (-1,1):
 sphere('Pale_ear_patch_'+str(s),V(s*.430,2.005,.019),(.047,.079,.094),'pale_yellow','head',n=16,m=10)

# High, swept-back yellow quiff made from independent rounded leaf feathers.
# All carry the crest bone so the performer can bounce the yellow fan.
for i,(x,tipx,tipz,tipf,width)in enumerate([(-.155,-.245,2.665,-.27,.074),(-.100,-.161,2.745,-.31,.082),(-.038,-.068,2.785,-.345,.089),(.03,.041,2.775,-.37,.083),(.09,.148,2.715,-.40,.076),(.14,.220,2.63,-.395,.064)]):
 feather('Crest_swept_plume_%02d'%i,[V(x,2.365,.055),V(x*.98,2.59,.015),V(tipx,tipz+.015,tipf+.12),V(tipx,tipz,tipf)],width,.041,'yellow','crest',steps=18)
# Short rear yellow collar feathers retain the signature even from behind.
for s in (-1,1):
 feather('Crest_rear_plume_'+str(s),[V(s*.13,2.37,-.12),V(s*.24,2.47,-.23),V(s*.25,2.53,-.4),V(s*.23,2.48,-.48)],.066,.038,'yellow','crest',steps=12)

# Strong curved upper mandible, sculpted as a continuous tapering hook.
beak_profile=[(2.204,.038,.038,.322),(2.178,.095,.066,.378),(2.120,.137,.090,.432),(2.054,.141,.101,.468),(1.982,.116,.102,.503),(1.922,.077,.075,.531),(1.872,.039,.041,.527),(1.846,.004,.007,.496)]
verts=[];faces=[];n=28
for j,(z,rx,rd,f)in enumerate(beak_profile):
 for i in range(n):t=TAU*i/n;verts.append(V(rx*math.cos(t),z,f+rd*math.sin(t)))
 if j:
  for i in range(n):a=(j-1)*n+i;b=(j-1)*n+(i+1)%n;faces.append((a,b,b+n,a+n))
for j in (0,len(beak_profile)-1):
 z,rx,rd,f=beak_profile[j];idx=len(verts);verts.append(V(0,z,f))
 for i in range(n):faces.append((idx,j*n+i,j*n+(i+1)%n))
mesh('Beak_upper_hook',verts,faces,'beak')
sphere('Beak_lower_mandible',V(0,1.91,.371),(.103,.086,.077),'beak',n=22,m=12)

# Squared, thick, jet-black sunglasses, with restrained graphite lens reflections.
for s in(-1,1):
 lens=sphere('Sunglasses_frame_'+str(s),V(s*.239,2.159,.332),(.240,.083,.151),'frame',n=28,m=16,exponent=3.7)
 # Move outer edges back along the round skull; keeps face wear snug in profile.
 for vertex in lens.data.vertices:vertex.co.y+=.27*abs(vertex.co.x)**2
 lens=sphere('Sunglasses_lens_'+str(s),V(s*.239,2.159,.401),(.194,.027,.105),'lens',n=24,m=12,exponent=3.3)
 for vertex in lens.data.vertices:vertex.co.y+=.27*abs(vertex.co.x)**2
 # Soft vertical reflected bar, subtle enough to read black at game scale.
 glint=sphere('Sunglasses_reflection_'+str(s),V(s*.325,2.194,.407-.27*(.325**2)),(.013,.004,.045),'glint',n=10,m=8)
 line('Sunglasses_temple_'+str(s),[V(s*.453,2.174,.286),V(s*.470,2.169,.125),V(s*.435,2.132,-.13)],.027,'frame')
line('Sunglasses_bridge',[V(-.064,2.197,.421),V(0,2.214,.439),V(.064,2.197,.421)],.034,'frame')

# Compact wings with a broad upper cover and visibly layered long flight feathers.
for side,s in [('L',1),('R',-1)]:
 a,e,h=[JOINTS[k+'_'+side]for k in('upperArm','forearm','hand')]
 def wing_weights(t,side=side):
  u=smooth((t-.32)/.37);v=smooth((t-.84)/.16)
  return {'upperArm_'+side:(1-u)*(1-v),'forearm_'+side:u*(1-v),'hand_'+side:v}
 path=bezier(a+V(-s*.03,.025,-.02),a.lerp(e,.7)+V(s*.07,.01,-.02),e.lerp(h,.4),h,steps=22)
 widths=[.11+.075*math.sin(math.pi*i/22)-.052*i/22 for i in range(23)]
 sweep('Wing_continuous_'+side,path,widths,[w*.67 for w in widths],'white',sides=18,weights=wing_weights)
 sphere('Wing_shoulder_cover_'+side,a+V(s*.028,-.015,.02),(.179,.134,.21),'white','upperArm_'+side,n=20,m=14)
 for j in range(4):
  out=.03+j*.057
  top=e+V(s*(out-.05),.10-.035*j,.027)
  end=h+V(s*(out-.06),-.065+.028*j,.033)
  feather('Wing_primary_'+side+'_'+str(j),[top,top.lerp(end,.35)+V(s*.025,.0,.04),top.lerp(end,.78)+V(s*.018,0,.05),end],.075,.043,'white' if j%2==0 else 'ivory','forearm_'+side,steps=13,
   weights=lambda t,side=side:{'forearm_'+side:1-smooth((t-.58)/.42),'hand_'+side:smooth((t-.58)/.42)})
 for j in range(3):
  top=a+V(s*(-.025+j*.063),-.01,.108)
  end=e+V(s*(-.015+j*.061),.018,.087)
  feather('Wing_coverts_'+side+'_'+str(j),[top,top.lerp(end,.32)+V(s*.025,.015,.025),top.lerp(end,.75),end],.07,.041,'white','upperArm_'+side,steps=11,
   weights=lambda t,side=side:{'upperArm_'+side:1-smooth((t-.72)/.28),'forearm_'+side:smooth((t-.72)/.28)})
 # Short hand fan stays close to the wrist and becomes a scratching feather tip.
 for j in range(3):
  start=h+V(s*(j-1)*.043,.045,.0);end=h+V(s*(j-1)*.052,-.104-(.016 if j==1 else 0),.050)
  feather('Wing_fingertip_'+side+'_'+str(j),[start,start.lerp(end,.3),start.lerp(end,.8),end],.043,.031,'white','hand_'+side,steps=9)
 # Bird trousers disappear smoothly under body; stout legs and three forward toes.
 hip,knee,foot=[JOINTS[k+'_'+side]for k in('thigh','shin','foot')]
 path=bezier(hip,hip.lerp(knee,.6),knee.lerp(foot,.50),foot+V(0,.015),steps=14)
 sweep('Leg_down_'+side,path,[.155-.08*i/14 for i in range(15)],[.127-.063*i/14 for i in range(15)],'white',sides=16,
  weights=lambda t,side=side:{'thigh_'+side:1-smooth((t-.3)/.6),'shin_'+side:smooth((t-.3)/.6)})
 sphere('Ankle_scales_'+side,foot+V(0,.031,0),(.079,.070,.118),'foot','foot_'+side,n=16,m=12)
 sphere('Foot_pad_'+side,V(s*.26,.075,.09),(.151,.184,.073),'foot','foot_'+side,n=20,m=12)
 for j in range(3):
  dx=(j-1)*.094;endf=.33-(.045 if j!=1 else 0)
  toe=bezier(V(s*.26+dx*.62,.099,.13),V(s*.26+dx,.102,.21),V(s*.26+dx*1.15,.060,endf-.025),V(s*.26+dx*1.15,.046,endf),steps=9)
  sweep('Toe_'+side+'_'+str(j),toe,[.041*(1-.52*i/9)for i in range(10)],[.035*(1-.56*i/9)for i in range(10)],'foot','foot_'+side,sides=10)
 # Rear toe is compact enough to stay inside the booth collision region.
 feather('Rear_toe_'+side,[V(s*.26,.10,-.015),V(s*.29,.09,-.1),V(s*.29,.055,-.17),V(s*.29,.048,-.19)],.039,.028,'foot','foot_'+side,steps=8)

# Three compact overlapping white tail feathers, swept down at the back.
for j in range(3):
 x=(j-1)*.12
 feather('Tail_feather_'+str(j),[V(x*.5,.95,-.24),V(x,.81,-.45),V(x,.54,-.49),V(x,.405+abs(j-1)*.07,-.455)],.104,.05,'ivory' if j==1 else 'white','hips',steps=13)

adata=bpy.data.armatures.new('Cockatoo_skeleton');arm=bpy.data.objects.new('Cockatoo_rig',adata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
parents={'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck','crest':'head'}
for side in('L','R'):parents.update({'upperArm_'+side:'chest','forearm_'+side:'upperArm_'+side,'hand_'+side:'forearm_'+side,'thigh_'+side:'hips','shin_'+side:'thigh_'+side,'foot_'+side:'shin_'+side})
for name,co in JOINTS.items():b=adata.edit_bones.new(name);b.head=co;b.tail=co+Vector((0,0,.1));b.roll=0
for name,parent in parents.items():adata.edit_bones[name].parent=adata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in PARTS:ob.parent=arm;mod=ob.modifiers.new('Soft wing articulation','ARMATURE');mod.object=arm
arm['model_kind']='dj-cockatoo';arm['provenance']='Original code-authored sulphur-crested cockatoo, no third-party models or textures';arm['rig']='club-v1-18-joints + crest';arm['front_axis']='+Z in GLB';arm['purpose']='Dedicated resident DJ'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'dj-cockatoo.blend'))
# Four opaque materials and four named skinned draws, retaining semantic discoverability.
exports=[]
roughness={'White_flock':.42,'Sulphur_crest':.38,'Graphite_beak_feet':.37,'Obsidian_sunglasses':.21}
parts_by_group={group:[ob for ob in PARTS if ob.data.materials[0]["surface_group"]==group] for group in roughness}
for group in roughness:
 material=bpy.data.materials.new(group);material.use_nodes=True;bs=material.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=roughness[group];bs.inputs['Specular IOR Level'].default_value=.32
 vc=material.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='avatar_color';material.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color'])
 group_parts=parts_by_group[group];names=[ob.name for ob in group_parts]
 for ob in group_parts:
  color=ob.data.materials[0].diffuse_color;attr=ob.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER')
  for d in attr.data:d.color=color
  ob.data.materials.clear();ob.data.materials.append(material)
 bpy.ops.object.select_all(action='DESELECT')
 for ob in group_parts:ob.select_set(True)
 bpy.context.view_layer.objects.active=group_parts[0];bpy.ops.object.join();ob=bpy.context.object;ob.name=group+'_skin';ob['semantic_parts']=names
 # Collapse only export copies; original semantic surfaces stay in the authoring blend.
 dec=ob.modifiers.new('Compact smooth game topology','DECIMATE');dec.ratio=.68;dec.use_collapse_triangulate=True;bpy.ops.object.modifier_apply(modifier=dec.name)
 exports.append(ob)
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for ob in exports:ob.select_set(True)
bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(ROOT/'dj-cockatoo.glb'),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
tris=sum(sum(len(p.vertices)-2 for p in ob.data.polygons)for ob in exports)
metrics={'kind':'dj-cockatoo','triangles':tris,'bytes':(ROOT/'dj-cockatoo.glb').stat().st_size,'material_groups':4,'joints':19,'rig':'club-v1-18-joints + crest','sha256':hashlib.sha256((ROOT/'dj-cockatoo.glb').read_bytes()).hexdigest(),'provenance':'Original geometry; no external models or textures','axes':'Y-up, +Z front in GLB','authoring_blend':'dj-cockatoo.blend','generator':'generate_cockatoo.py'}
(ROOT/'asset-metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print('COCKATOO_READY',json.dumps(metrics),flush=True)

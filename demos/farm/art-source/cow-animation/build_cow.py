"""Reproducible Blender cow study. Blender 4.3+: blender -b -t 6 --python build_cow.py
Game coordinates are +Y up, +Z forward; B() converts to Blender Z-up/-Y-forward.
Run with -- --preview for the offline-rendered motion preview after exporting.
"""
import bpy, math, os, sys, json
from mathutils import Vector, Matrix, Quaternion
from pathlib import Path
from math import sin, cos, pi
HERE=Path(__file__).resolve().parent
OUT=HERE.parent.parent/'public/models/farm'
OUT.mkdir(parents=True,exist_ok=True)
PREVIEW=HERE/'preview'; PREVIEW.mkdir(exist_ok=True)
FPS=24

def B(v): return Vector((v[0],-v[2],v[1]))
def G(v): return Vector((v[0],v[2],-v[1]))
def clamp(x,a=0,b=1):return max(a,min(b,x))
def smooth(a,b,x):
 t=clamp((x-a)/(b-a)); return t*t*(3-2*t)
def mix(a,b,t):return a*(1-t)+b*t
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials):bpy.data.materials.remove(block)
scene=bpy.context.scene; scene.render.fps=FPS; scene.frame_start=0
assets=[]

def mat(name,color,rough=.75):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
 return m
cream=mat('warm ivory hide',(.91,.82,.65));brown=mat('cocoa hoof',(.20,.105,.072));pink=mat('soft rose muzzle',(.64,.325,.27));inner=mat('warm ear lining',(.64,.30,.26));black=mat('espresso eyes',(.025,.018,.014),.22);shine=mat('eye glints',(1,.98,.88),.2);horn=mat('rounded butter horns',(.73,.58,.34));mint=mat('sage pendant',(.21,.47,.34));lip=mat('mouth and hoof grooves',(.095,.05,.032));spot=(.23,.12,.075)

# Bone rest positions are in game coordinates.
rest={};parents={};lens={}
def bone(name,h,t,parent=None,deform=True):
 rest[name]=(Vector(h),Vector(t));parents[name]=parent;lens[name]=(Vector(t)-Vector(h)).length
 return name
bone('cow_root',(0,0,0),(0,.16,0),None,False)
bone('cow_body',(0,.65,-.30),(0,.65,.10),'cow_root')
bone('cow_neck_01',(0,.60,.10),(0,.91,.26),'cow_body')
bone('cow_neck_02',(0,.91,.26),(0,1.01,.44),'cow_neck_01')
bone('cow_head',(0,1.01,.44),(0,1.01,.68),'cow_neck_02')
bone('cow_jaw',(0,.88,.53),(0,.84,.75),'cow_head')
head_rest=Vector((0,1.01,.44)); mouth_rest=Vector((0,.84,.765))

def ik(a,t,l1,l2,bend=1):
 d=t-a; dist=clamp(d.length,.0001,l1+l2-.00001);axis=d.normalized()
 x=(l1*l1-l2*l2+dist*dist)/(2*dist);h=math.sqrt(max(0,l1*l1-x*x))
 perp=Vector((0,-axis.z,axis.y)).normalized()*bend
 return a+axis*x+perp*h
legdata={}
for end,z in [('front',.23),('back',-.34)]:
 for side,x in [('L',-.235),('R',.235)]:
  tag=f'{end}_{side}'; hip=Vector((x,.62,z));foot=Vector((x,.08,z+.012))
  l1,l2=.305,.255;bend=1 if end=='front' else -1;knee=ik(hip,foot,l1,l2,bend)
  upper=bone(f'cow_{tag}_upper',hip,knee,'cow_body')
  lower=bone(f'cow_{tag}_lower',knee,foot,upper)
  ankle=bone(f'cow_{tag}_hoof',foot,foot+Vector((0,0,.11)),lower)
  legdata[tag]=dict(hip=hip,foot=foot,knee=knee,l1=l1,l2=l2,bend=bend,bones=(upper,lower,ankle))
bone('cow_tail_01',(0,.76,-.51),(.035,.61,-.59),'cow_body')
bone('cow_tail_02',(.035,.61,-.59),(.055,.40,-.61),'cow_tail_01')
for side,s in [('L',-1),('R',1)]:bone(f'cow_ear_{side}',(s*.205,1.105,.405),(s*.365,1.11,.39),'cow_head')
bone('feeding-mouth',mouth_rest,mouth_rest+Vector((0,0,.035)),'cow_head',False)
bone('animal-support',(0,.345,-.06),(0,.38,-.06),'cow_body',False)
bone('animal-head',head_rest,head_rest+Vector((0,.04,0)),'cow_head',False)
bone('animal-ground',(0,0,0),(0,.04,0),'cow_root',False)

bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='Cow_Armature';rig.data.name='Cow_Skeleton'
bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
for name,(h,t) in rest.items():
 eb=rig.data.edit_bones.new(name);eb.head=B(h);eb.tail=B(t);eb.use_deform=not name.startswith('animal-') and name not in ['cow_root','feeding-mouth']
 if parents[name]:eb.parent=rig.data.edit_bones[parents[name]]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;rig.data.display_type='OCTAHEDRAL';assets.append(rig)
for p in rig.pose.bones:p.rotation_mode='QUATERNION'

# Smooth intersecting shapes are welded into one closed hide, not rigid toy segments.
def uv(name,p,s,material=cream,segments=24,rings=16):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=B(p));o=bpy.context.object;o.name=name;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if material:o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 return o

def tube(name,pts,radius,material=cream,res=12):
 bpy.ops.object.select_all(action='DESELECT')
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=res;cu.bevel_depth=radius;cu.bevel_resolution=3;cu.use_fill_caps=True
 sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
 for bp,p in zip(sp.bezier_points,pts):bp.co=B(p);bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o)
 bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object
 if material:o.data.materials.append(material)
 for f in o.data.polygons:f.use_smooth=True
 return o

def bind(o,weights):
 # weights is a function of world-space game coordinate, or a single bone name.
 for name in rest:o.vertex_groups.new(name=name)
 world=o.matrix_world
 for v in o.data.vertices:
  p=G(world@v.co);w={weights:1} if isinstance(weights,str) else weights(p)
  total=sum(w.values())
  for name,value in w.items():
   if value>1e-5:o.vertex_groups[name].add([v.index],value/total,'REPLACE')
 mod=o.modifiers.new('Real skeletal skinning','ARMATURE');mod.object=rig;o.parent=rig;assets.append(o);return o

def rigid(o,name):return bind(o,name)
parts=[uv('torso union',(0,.66,-.09),(.35,.31,.47)),uv('shoulder union',(0,.71,.23),(.24,.255,.24)),uv('neck union',(0,.865,.31),(.19,.235,.185)),uv('face union',head_rest,(.26,.25,.245),segments=32,rings=20)]
for tag,d in legdata.items():
 hip,knee,foot=d['hip'],d['knee'],d['foot']
 parts.extend([uv(tag+' shoulder',hip,(.105,.145,.115)),tube(tag+' continuous leg',[hip,knee,foot+Vector((0,.045,0))],.073)])
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();hide=bpy.context.object;hide.name='Cow_Connected_Hide'
rem=hide.modifiers.new('Weld anatomy','REMESH');rem.mode='VOXEL';rem.voxel_size=.023;rem.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=rem.name)
sm=hide.modifiers.new('Soft anatomical junctions','SMOOTH');sm.factor=.75;sm.iterations=5;bpy.ops.object.modifier_apply(modifier=sm.name)
# Put object-space vertices in armature rest space.
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)

def dist_seg(p,a,b):
 t=clamp((p-a).dot(b-a)/(b-a).length_squared);return (p-(a+(b-a)*t)).length,t

def hide_weights(p):
 x,y,z=p
 if y<.53 and abs(x)>.13 and z<.43:
  tag=min(legdata,key=lambda n:abs(x-legdata[n]['hip'].x)+abs(z-legdata[n]['hip'].z))
  d=legdata[tag];u,l,f=d['bones'];k=d['knee'].y
  body=smooth(.43,.59,y);low=1-smooth(k-.07,k+.09,y)
  return {'cow_body':body,u:(1-body)*(1-low),l:(1-body)*low}
 neck=max(smooth(.10,.32,z)*smooth(.62,.91,y),smooth(.25,.43,z)*smooth(.47,.72,y))
 if neck<.001:return {'cow_body':1}
 a=Vector((0,.60,.10));b=Vector((0,.91,.26));c=head_rest
 d1,t1=dist_seg(p,a,b);d2,t2=dist_seg(p,b,c)
 # Follow the neck centreline with a broad crossfade at the cervical joints.
 along=(t1*lens['cow_neck_01']) if d1<d2 else lens['cow_neck_01']+t2*lens['cow_neck_02']
 n2=smooth(.24,.40,along);h=max(smooth(.40,.52,along),smooth(.36,.49,z)*smooth(.65,.83,y))
 return {'cow_body':1-neck,'cow_neck_01':neck*(1-n2)*(1-h),'cow_neck_02':neck*n2*(1-h),'cow_head':neck*h}
bind(hide,hide_weights)
weights=[{g.group:g.weight for g in v.groups} for v in hide.data.vertices]
adj=[set() for _ in hide.data.vertices]
for e in hide.data.edges:adj[e.vertices[0]].add(e.vertices[1]);adj[e.vertices[1]].add(e.vertices[0])
for _ in range(2):
 next_weights=[]
 for i,w in enumerate(weights):
  total={k:.6*v for k,v in w.items()};neighbors=adj[i]
  for j in neighbors:
   for k,v in weights[j].items():total[k]=total.get(k,0)+.4*v/max(1,len(neighbors))
  top=sorted(total.items(),key=lambda kv:-kv[1])[:4];norm=sum(v for k,v in top);next_weights.append({k:v/norm for k,v in top if v>.00001})
 weights=next_weights
for vg in hide.vertex_groups:vg.remove(list(range(len(hide.data.vertices))))
for i,w in enumerate(weights):
 for k,v in w.items():hide.vertex_groups[k].add([i],v,'REPLACE')
# Pigment is vertex color on the continuous skin; no floating dark surface decals.
colors=hide.data.color_attributes.new(name='HideColor',type='FLOAT_COLOR',domain='POINT')
patches=[(Vector((.31,.72,-.25)),Vector((.15,.18,.22))),(Vector((-.32,.70,.05)),Vector((.13,.20,.21))),(Vector((-.11,.88,-.40)),Vector((.19,.13,.17))),(Vector((-.12,1.13,.56)),Vector((.10,.10,.10)))]
for v in hide.data.vertices:
 p=G(v.co);coverage=0
 for center,scale in patches:
  q=p-center;d=math.sqrt(sum((q[i]/scale[i])**2 for i in range(3)))
  d+=.075*sin(p.x*36+p.z*17)*sin(p.y*31);coverage=max(coverage,1-smooth(.89,1.08,d))
 colors.data[v.index].color=tuple(mix(cream.diffuse_color[i],spot[i],coverage) for i in range(3))+(1,)
skinmat=mat('Ivory and cocoa vertex-painted hide',(1,1,1));nodes=skinmat.node_tree.nodes;vc=nodes.new('ShaderNodeVertexColor');vc.layer_name='HideColor';skinmat.node_tree.links.new(vc.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);hide.data.materials.clear();hide.data.materials.append(skinmat)
# Distinct skinned details: eyes, muzzle, rounded ears, horns, cloven hooves.
rigid(uv('pink velvet muzzle',(0,.885,.632),(.222,.125,.14),pink,32,20),'cow_head')
rigid(uv('lower lip',(0,.821,.684),(.15,.033,.06),pink),'cow_jaw')
rigid(tube('smile',[(-.07,.817,.743),(0,.802,.75),(.07,.817,.743)],.0055,lip),'cow_jaw')
for side,s in [('L',-1),('R',1)]:
 rigid(uv('nostril '+side,(s*.085,.902,.758),(.024,.015,.009),brown),'cow_head')
 rigid(uv('bright eye '+side,(s*.145,1.025,.644),(.031,.042,.023),black,24,16),'cow_head')
 rigid(uv('eye highlight '+side,(s*.145-.008,1.039,.665),(.008,.010,.006),shine,16,12),'cow_head')
 rigid(uv('cheek '+side,(s*.214,.932,.594),(.044,.023,.025),pink),'cow_head')
 ear=uv('soft ear '+side,(s*.301,1.109,.398),(.137,.066,.073));ear.rotation_euler[1]=s*.15
 # Pigment follows the actual ear surface, avoiding separate intersecting inset geometry.
 ec=ear.data.color_attributes.new(name='HideColor',type='FLOAT_COLOR',domain='POINT')
 for v in ear.data.vertices:
  ep=G(v.co);r=math.sqrt((ep.x/.10)**2+(ep.y/.043)**2);c=(1-smooth(.58,1.08,r))*smooth(.025,.055,ep.z)
  ec.data[v.index].color=tuple(mix(cream.diffuse_color[i],inner.diffuse_color[i],c) for i in range(3))+(1,)
 ear.data.materials.clear();ear.data.materials.append(skinmat);rigid(ear,'cow_ear_'+side)
 rigid(tube('rounded horn '+side,[(s*.15,1.205,.39),(s*.187,1.282,.375),(s*.178,1.329,.40)],.031,horn),'cow_head')
 rigid(uv('horn tip '+side,(s*.178,1.329,.40),(.029,.03,.029),horn),'cow_head')
for tag,d in legdata.items():
 f=d['foot'];name=d['bones'][2]
 rigid(uv('cloven hoof '+tag,f+Vector((0,0,.012)),(.09,.08,.108),brown),'%s'%name)
 rigid(tube('hoof cleft '+tag,[f+Vector((0,-.041,.111)),f+Vector((0,.025,.112))],.004,lip),name)
rigid(tube('flexible tail base',[(0,.76,-.51),(.035,.61,-.59),(.055,.40,-.61)],.022),lambda p:{'cow_tail_01':smooth(.48,.65,p.y),'cow_tail_02':1-smooth(.48,.65,p.y)})
rigid(uv('tail tassel',(.055,.39,-.61),(.046,.072,.04),brown),'cow_tail_02')
rigid(uv('sage chest pendant',(0,.65,.481),(.035,.045,.014),mint),'cow_neck_01')

# Absolute skeletal target transforms; no constraints are required at runtime.
restM={n:rig.data.bones[n].matrix_local.copy() for n in rest}

def matrix_at(name,position,rotation=None):
 rot=rotation or Quaternion((1,0,0,0));m=rot.to_matrix().to_4x4()@restM[name].to_3x3().to_4x4();m.translation=B(position);return m

def point_matrix(name,a,b):
 old=B(rest[name][1]-rest[name][0]);new=B(b-a);return matrix_at(name,a,old.rotation_difference(new))

def rx(a):return Quaternion((1,0,0),a)
def pose(kind,t,duration):
 drink=0;sip=0
 if kind=='drink_enter':drink=smooth(0,1,t/duration)
 elif kind=='drink_loop':drink=1;sip=sin(t/duration*6*pi)
 elif kind=='drink_exit':drink=1-smooth(0,1,t/duration)
 walking=kind=='walk';phase=t/duration*2*pi
 # Tiny physiological motion, never a vertical bob of every hoof.
 body_shift=Vector((0,-.020*drink,.035*drink))
 if walking:body_shift.y+=-.025+.007*(1-cos(phase*2));body_shift.x=.007*sin(phase)
 bodyrot=rx(.025*drink)
 def bodypoint(p):return rest['cow_body'][0]+G(bodyrot@B(p-rest['cow_body'][0]))+body_shift
 M={'cow_root':restM['cow_root'].copy()};M['cow_body']=matrix_at('cow_body',bodypoint(rest['cow_body'][0]),bodyrot)
 neckbase=bodypoint(rest['cow_neck_01'][0]);head=head_rest.copy();angle=.012*sin(phase) if kind=='idle' else 0
 if walking:head.y+=.006*sin(phase*2);angle=.018*sin(phase)
 # Authored contact exactly (0,.045,.72) at the stable middle of the sip cycle.
 drinkangle=math.radians(50)+.004*sip
 offset=G(rx(drinkangle)@B(mouth_rest-head_rest))
 target=Vector((0,.045+.003*sip,.72))-offset
 head=head.lerp(target,drink);angle=mix(angle,drinkangle,drink)
 neckmid=ik(neckbase,head,lens['cow_neck_01'],lens['cow_neck_02'],-1)
 M['cow_neck_01']=point_matrix('cow_neck_01',neckbase,neckmid)
 M['cow_neck_02']=point_matrix('cow_neck_02',neckmid,head)
 headrot=rx(angle);M['cow_head']=matrix_at('cow_head',head,headrot)
 # Small jaw action is not the main drink pose: the entire neck does the lowering.
 jawpos=head+G(headrot@B(rest['cow_jaw'][0]-head_rest))
 M['cow_jaw']=matrix_at('cow_jaw',jawpos,headrot@rx(.014*drink*(.5+.5*sip)))
 for tag,d in legdata.items():
  hip=bodypoint(d['hip']);foot=d['foot'].copy()
  if walking:
   offsets={'front_L':0,'back_R':.25,'front_R':.5,'back_L':.75};u=(t/duration+offsets[tag])%1;duty=.66;stride=.58*duty
   if u<duty:foot.z+=stride*(.5-u/duty)
   else:
    sw=(u-duty)/(1-duty);foot.z+=stride*(-.5+smooth(0,1,sw));foot.y+=.105*sin(pi*sw)**1.2
   # Keep the leg chain within reach while all stance hooves remain on ground.
   maxreach=d['l1']+d['l2']-.001;delta=foot-hip
   if delta.length>maxreach:
    maxz=math.sqrt(max(.0001,maxreach**2-(foot.y-hip.y)**2));foot.z=hip.z+clamp(foot.z-hip.z,-maxz,maxz)
  knee=ik(hip,foot,d['l1'],d['l2'],d['bend']);u,l,f=d['bones']
  M[u]=point_matrix(u,hip,knee);M[l]=point_matrix(l,knee,foot);M[f]=matrix_at(f,foot)
 # Secondary motion remains attached to the deform skeleton.
 for side,s in [('L',-1),('R',1)]:
  n='cow_ear_'+side;p=head+G(headrot@B(rest[n][0]-head_rest));flutter=.025*sin(phase*2+s)+drink*.08*s
  M[n]=matrix_at(n,p,headrot@Quaternion((0,1,0),flutter))
 for n in ['cow_tail_01','cow_tail_02']:
  parent=parents[n];rel=restM[parent].inverted()@restM[n]
  base=M[parent]@rel;rot=Quaternion((0,0,1),.09*sin(phase)+(0 if n.endswith('01') else .04*cos(phase)))
  M[n]=base@rot.to_matrix().to_4x4()
 for n in rest:
  if n not in M:M[n]=M[parents[n]]@(restM[parents[n]].inverted()@restM[n]) if parents[n] else restM[n]
  localrest=restM[parents[n]].inverted()@restM[n] if parents[n] else restM[n]
  localpose=M[parents[n]].inverted()@M[n] if parents[n] else M[n]
  rig.pose.bones[n].matrix_basis=localrest.inverted()@localpose
 return M

clips={'idle':3.0,'walk':1.2,'drink_enter':1.1,'drink_loop':2.6,'drink_exit':1.3}
rig.animation_data_create();actions={}
for kind,duration in clips.items():
 action=bpy.data.actions.new(kind);action.use_fake_user=True;rig.animation_data.action=action;frames=round(duration*FPS)
 for fr in range(frames+1):
  scene.frame_set(fr);pose(kind,fr/frames*duration,duration)
  for pb in rig.pose.bones:
   pb.keyframe_insert('location',frame=fr,group=pb.name);pb.keyframe_insert('rotation_quaternion',frame=fr,group=pb.name);pb.keyframe_insert('scale',frame=fr,group=pb.name)
 for fc in action.fcurves:
  for k in fc.keyframe_points:k.interpolation='LINEAR'
 actions[kind]=action
rig.animation_data.action=actions['idle'];scene.frame_set(0);pose('idle',0,3);bpy.context.view_layer.update()
# Catch construction regressions before any export or preview.
assert all(any(m.type=='ARMATURE' for m in o.modifiers) for o in assets if o.type=='MESH'), 'Every visible cow mesh must remain skinned.'
assert min(v.co.z for v in hide.data.vertices)<.15, 'Continuous white legs must reach into the hooves.'
# Save model source before constructing any preview set dressing.
scene.frame_end=72;scene['asset_contract']='Game +Y up, +Z forward; hoof datum Y=0; in-place clips; feeding-mouth = (0,.045,.72) in drink_loop.'
rig['walk_stride_m']=.58;rig['walk_cycle_seconds']=1.2;rig['drink_contact_game']=[0,.045,.72]
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'cow-animated.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in assets:o.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/'cow-animated.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=True,export_animation_mode='ACTIONS',export_anim_single_armature=True,export_force_sampling=True,export_frame_range=False,export_def_bones=False,export_apply=False,export_extras=True)
report={'source':'Blender 4.3.2, deterministic Python construction','bones':len(rest),'mesh_objects':len(assets)-1,'connected_hide_vertices':len(hide.data.vertices),'connected_hide_faces':len(hide.data.polygons),'clips':{k:round(v*FPS)/FPS for k,v in clips.items()},'walk_stride_m':.58,'game_coordinates':{'up':'+Y','forward':'+Z','ground_y':0},'bones_for_runtime':{'head':'cow_head','neck':['cow_neck_01','cow_neck_02'],'mouth':'feeding-mouth','support':'animal-support'},'mouth_idle':list(mouth_rest),'mouth_drink':[0,.045,.72],'support_idle':[0,.345,-.06]}
(HERE/'asset-contract.json').write_text(json.dumps(report,indent=2))
print('COW_ASSET_EXPORTED',json.dumps(report),flush=True)

# True offline Blender previews, never passed off as browser/WebGL evidence.
if '--preview' in sys.argv or '--stills' in sys.argv:
 for o in assets:
  if o.type=='MESH':o.select_set(False)
 ground=mat('sage display floor',(.38,.49,.29));water=mat('shallow aqua water',(.12,.54,.57),.23);rim=mat('muted clay basin',(.57,.61,.43))
 bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.006));bpy.context.object.data.materials.append(ground)
 # Shallow, wide water disk stays under the authored mouth, leaving all hooves on dry ground.
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.26,depth=.024,location=B((0,.023,.78)));basin=bpy.context.object;basin.name='Preview basin';basin.data.materials.append(rim)
 bevel=basin.modifiers.new('Soft bowl lip','BEVEL');bevel.width=.025;bevel.segments=3
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=.228,depth=.005,location=B((0,.043,.78)));bpy.context.object.data.materials.append(water)
 for o in [basin,bpy.context.object]:
  for p in o.data.polygons:p.use_smooth=True
 # Area lighting and orthographic three-quarter camera make front/back legs legible.
 world=scene.world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.72,.80,.68,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6
 for name,loc,power,size in [('Key',(3,-4,6),450,5),('Fill',(-4,-2,3),250,4),('Rim',(0,4,5),350,3)]:
  bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.rotation_euler=(Vector((0,0,.6))-o.location).to_track_quat('-Z','Y').to_euler()
 bpy.ops.object.camera_add(location=(2.8,-4.2,2.15));cam=bpy.context.object;cam.rotation_euler=(B((0,.62,.14))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.05;scene.camera=cam
 scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.cycles.device='CPU';scene.render.resolution_x=640;scene.render.resolution_y=640;scene.render.resolution_percentage=100
 scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';scene.render.film_transparent=False
 stills=[('idle',0),('walk',.2),('walk',.7),('drink_enter',.6),('drink_loop',.4),('drink_exit',.75)]
 for i,(kind,t) in enumerate(stills):
  rig.animation_data.action=actions[kind];scene.frame_set(round(t*FPS));scene.render.filepath=str(PREVIEW/f'still-{i:02}-{kind}.png');bpy.ops.render.render(write_still=True)
 if '--stills' in sys.argv:
  print('COW_OFFLINE_STILLS_READY',flush=True);sys.exit(0)
 # 8.5 second 12fps motion study: idle -> walking -> drinking entry / sip / exit.
 scene.render.resolution_x=512;scene.render.resolution_y=512;scene.cycles.samples=16
 sequence=[('idle',.5),('walk',2.4),('drink_enter',1.1),('drink_loop',2.6),('drink_exit',1.3),('idle',.5)]
 i=0
 for kind,span in sequence:
  rig.animation_data.action=actions[kind]
  for j in range(round(span*12)):
   t=(j/12)%clips[kind];scene.frame_set(round(t*FPS));scene.render.filepath=str(PREVIEW/f'frame-{i:04}.png');bpy.ops.render.render(write_still=True);i+=1
 print('COW_OFFLINE_PREVIEW_FRAMES',i,flush=True)

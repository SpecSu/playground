"""Original species-specific vinyl animal cast, authored from reference direction.
This generator never writes shipping assets. Inspect isolated GLBs before install.
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/animal-diversity/generate_animals.py -- --output-dir /absolute/review
"""
import argparse, ast, bpy, bmesh, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--only');args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.output_dir.resolve();OUT.mkdir(parents=True,exist_ok=True)
if OUT==REPO/'public'/'avatars':raise RuntimeError('Generate into review directory; inspect before shipping.')
SPEC=json.loads((HERE/'rig-spec.json').read_text())['species']
TAU=math.tau
COLORS={'ink':'292A30','cream':'FFF2D7','white':'FFFBF1','cat':'ED9B42','cat_dark':'B66730','cat_bib':'FFE3AC','frog':'9FAF48','frog_dark':'72873C','frog_bib':'E8DCA6','frog_ink':'343C25','dog':'B97F52','dog_dark':'754A33','dog_bib':'F5D6A6','pink':'D98382','capy':'B88454','capy_dark':'8B583A','capy_muzzle':'A47147','panda':'F9EDDA','panda_black':'313039','gloss':'191B20','gold':'DAAA50'}
M={}
def linear(c):return ((c+.055)/1.055)**2.4 if c>.04045 else c/12.92
def mat(name):
 if name in M:return M[name]
 rgb=[linear(int(COLORS[name][i:i+2],16)/255) for i in (0,2,4)]
 m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,1);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*rgb,1);bs.inputs['Roughness'].default_value=.58;bs.inputs['Specular IOR Level'].default_value=.24;M[name]=m;return m
def V(x,z,f=0):return Vector((x,-f,z))
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def signed(v,e):return math.copysign(abs(v)**e,v)
def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 M.clear()
class Animal:
 def __init__(self,kind):
  self.kind=kind;self.parts=[];self.parents={'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck'};spec=SPEC[kind];self.spec=spec
  self.joints={'root':V(0,0)}
  for key in ('hips','spine','chest','neck','head'):self.joints[key]=V(*spec[key])
  for suffix,sgn in [('L',1),('R',-1)]:
   for key,source in [('upperArm','shoulder'),('forearm','elbow'),('hand','hand'),('thigh','hip'),('shin','knee'),('foot','ankle')]:
    x,z,f=spec[source];self.joints[key+'_'+suffix]=V(sgn*x,z,f)
   self.parents.update({'upperArm_'+suffix:'chest','forearm_'+suffix:'upperArm_'+suffix,'hand_'+suffix:'forearm_'+suffix,'thigh_'+suffix:'hips','shin_'+suffix:'thigh_'+suffix,'foot_'+suffix:'shin_'+suffix})
  for name,parent in [('tail','hips'),('tailTip','tail'),('ear_L','head'),('ear_R','head')]:
   if name in spec:self.joints[name]=V(*spec[name]);self.parents[name]=parent
 def mesh(self,name,verts,faces,color,weights):
  data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(mat(color));data.update();ob=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(ob);self.parts.append(ob)
  for poly in data.polygons:poly.use_smooth=True
  groups={}
  for i,w in enumerate(weights):
   for joint,amount in w.items():
    if amount<=0:continue
    if joint not in groups:groups[joint]=ob.vertex_groups.new(name=joint)
    groups[joint].add([i],amount,'REPLACE')
  ob['surface_group']='gloss' if color in ('gloss',) else 'vinyl'
  return ob
 def ellipsoid(self,name,center,scale,color,bone='head',n=28,m=18,exp=1,pear=0):
  # Preserve smooth major silhouettes, budget detail below the display pixel scale.
  n=max(10,2*round(n*.75/2));m=max(8,round(m*.72))
  center=Vector(center);verts=[center+Vector((0,0,scale[2]))];faces=[]
  for j in range(1,m):
   phi=math.pi*j/m;z=signed(math.cos(phi),exp);r=math.sin(phi)**exp
   for i in range(n):
    theta=TAU*i/n;verts.append(center+Vector((scale[0]*r*signed(math.cos(theta),exp)*(1-pear*z),scale[1]*r*signed(math.sin(theta),exp)*(1-pear*z),scale[2]*z)))
  bottom=len(verts);verts.append(center-Vector((0,0,scale[2])))
  for i in range(n):faces.append((0,1+i,1+(i+1)%n))
  for j in range(m-2):
   for i in range(n):a=1+j*n+i;b=1+j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
  for i in range(n):faces.append((bottom,1+(m-2)*n+(i+1)%n,1+(m-2)*n+i))
  return self.mesh(name,verts,faces,color,[bone(v) if callable(bone) else {bone:1} for v in verts])
 def belly_patch(self,name,z,rx,rz,color,body_center,body_scale,pear=0):
  # A thin painted oval follows the actual rounded torso rather than a flat medallion.
  bx,bz,bf=body_center;bw,bd,bh=body_scale
  def point(x,height):
   nz=max(-.999,min(.999,(height-bz)/bh));r=math.sqrt(1-nz*nz)*(1-pear*nz);xx=bw*r;front=bf+bd*r*math.sqrt(max(0,1-((x-bx)/max(.001,xx))**2))+.004
   return V(x,height,front)
  verts=[point(0,z)];faces=[];n=32;rings=7
  for ring in range(1,rings+1):
   u=ring/rings
   for i in range(n):a=TAU*i/n;verts.append(point(rx*u*math.cos(a),z+rz*u*math.sin(a)))
  for i in range(n):faces.append((0,1+i,1+(i+1)%n))
  for ring in range(rings-1):
   for i in range(n):a=1+ring*n+i;b=1+ring*n+(i+1)%n;faces.append((a,b,b+n,a+n))
  return self.mesh(name,verts,faces,color,[self.weight_body(p) for p in verts])
 def sweep(self,name,points,radii,color,bone='head',depth=1,sides=14):
  points=[Vector(v) for v in points];verts=[];faces=[];weights=[]
  for j,point in enumerate(points):
   t=j/(len(points)-1);tangent=(points[min(j+1,len(points)-1)]-points[max(0,j-1)]).normalized();ref=Vector((0,1,0))
   if abs(tangent.dot(ref))>.95:ref=Vector((1,0,0))
   side=tangent.cross(ref).normalized();other=tangent.cross(side).normalized();r=radii[j] if isinstance(radii,list) else radii
   for i in range(sides):
    a=TAU*i/sides;verts.append(point+side*(math.cos(a)*r)+other*(math.sin(a)*r*depth));weights.append(bone(t) if callable(bone) else {bone:1})
   if j:
    for i in range(sides):a=(j-1)*sides+i;b=(j-1)*sides+(i+1)%sides;faces.append((a,b,b+sides,a+sides))
  for j in (0,len(points)-1):
   idx=len(verts);verts.append(points[j]);weights.append(bone(j/(len(points)-1)) if callable(bone) else {bone:1})
   for i in range(sides):faces.append((idx,j*sides+(i+1)%sides,j*sides+i) if j==0 else (idx,j*sides+i,j*sides+(i+1)%sides))
  return self.mesh(name,verts,faces,color,weights)
 def curve(self,name,control,width,color,bone='head',depth=1,sides=10,segments=24,taper=False):
  a,b,c,d=[Vector(p) for p in control];points=[];radii=[]
  for i in range(segments+1):
   t=i/segments;points.append(a*(1-t)**3+b*3*(1-t)**2*t+c*3*(1-t)*t*t+d*t**3);radii.append(max(.001,width*(1-t)**.5) if taper else width)
  return self.sweep(name,points,radii,color,bone,depth,min(sides,12))
 def line(self,name,points,width,color,bone='head'):
  return self.sweep(name,points,width,color,bone,sides=8)
 def weight_body(self,p):
  keys=['hips','spine','chest'];axis=1 if self.kind=='capybara' else 2;value=-p[axis] if axis==1 else p[axis];zs=[-self.joints[k][axis] if axis==1 else self.joints[k][axis] for k in keys]
  if value<=zs[0]:return {keys[0]:1}
  if value>=zs[-1]:return {keys[-1]:1}
  i=0 if value<zs[1] else 1;t=smooth((value-zs[i])/(zs[i+1]-zs[i]));return {keys[i]:1-t,keys[i+1]:t}
 def limb(self,side,front,color,radii,foot_scale,foot_color=None):
  names=[k+'_'+side for k in (('upperArm','forearm','hand') if front else ('thigh','shin','foot'))];a,e,h=[self.joints[k] for k in names]
  points=[];rs=[]
  # Quadratic spline through the elbow/knee, with a smooth tangent at the middle.
  for i in range(19):
   t=i/18
   if t<=.5:u=t*2;point=a.lerp(e,u);radius=radii[0]*(1-u)+radii[1]*u
   else:u=(t-.5)*2;point=e.lerp(h,u);radius=radii[1]*(1-u)+radii[2]*u
   points.append(point);rs.append(radius)
  def weights(t):
   if t<.25:return {names[0]:1}
   if t<.70:u=smooth((t-.25)/.45);return {names[0]:1-u,names[1]:u}
   u=smooth((t-.80)/.20);return {names[1]:1-u,names[2]:u}
  self.sweep(('foreleg_' if front else 'hindleg_')+side,points,rs,color,weights,depth=.92,sides=12)
  self.ellipsoid('joint_round_'+names[0],a,(radii[0],radii[0]*.92,radii[0]),color,names[0],n=18,m=12)
  self.ellipsoid('joint_round_'+names[1],e,(radii[1],radii[1]*.92,radii[1]),color,names[1],n=18,m=12)
  pos=h.copy()
  if not front or self.kind=='capybara':pos.z=foot_scale[2];pos.y-=foot_scale[1]*.20
  self.ellipsoid('paw_'+names[-1],pos,foot_scale,foot_color or color,names[-1],n=22,m=14,exp=.83)
 def eye(self,x,z,f,rx,rz,skin,mood='deadpan',bone='head'):
  # Half-lidded graphic eyes integrated into the surface, with only small highlights.
  if mood=='bright':self.ellipsoid('eye_white',V(x,z,f),(rx,.023,rz),'cream',bone,n=24,m=16)
  else:
   # Only the exposed lower sclera is modeled: no floating white rim above the lid.
   boundary=[];tilt=(-.13 if x<0 else .13) if mood=='mischief' else (.08 if x<0 else -.08)
   for i in range(33):
    a=math.pi-math.asin(.2)+(math.pi+2*math.asin(.2))*i/32;xx=math.cos(a);zz=math.sin(a)+tilt*xx;boundary.append((xx,zz))
   verts=[V(x,z-rz*.28,f+.014)];faces=[]
   for ring in range(1,6):
    u=ring/5
    for xx,zz in boundary:verts.append(V(x+rx*xx*u,z+rz*(-.28*(1-u)+zz*u),f+.014*(1-u*u)))
   for i in range(33):faces.append((0,1+i,1+(i+1)%33))
   for ring in range(4):
    for i in range(33):a=1+ring*33+i;b=1+ring*33+(i+1)%33;faces.append((a,b,b+33,a+33))
   self.mesh('lower_sclera',verts,faces,'cream',[{bone:1} for _ in verts])
  self.ellipsoid('eye_pupil',V(x+(.006 if x<0 else -.006),z-rz*.24,f+.008),(rx*.43,.009,rz*.59),'gloss',bone,n=18,m=12)
  if mood=='bright':
   self.ellipsoid('eye_spark',V(x-rx*.10,z+rz*.05,f+.032),(rx*.13,.003,rz*.14),'white',bone,n=10,m=8)
   return
  # Lid is a custom curved upper-half cap. Its straight edge controls expression.
  verts=[];faces=[];seg=18
  tilt=(-.13 if x<0 else .13) if mood=='mischief' else (.08 if x<0 else -.08)
  for row in range(5):
   u=row/4
   for i in range(seg+1):
    v=-1+2*i/seg;xx=x+rx*1.045*v;bottom=z+rz*(.20+tilt*v);top=z+rz*1.08*math.sqrt(max(0,1-v*v));zz=bottom*(1-u)+max(bottom,top)*u
    verts.append(V(xx,zz,f+.016+.004*math.sin(math.pi*i/seg)))
    if row and i:a=(row-1)*(seg+1)+i-1;faces.append((a,a+1,a+1+seg+1,a+seg+1))
  self.mesh('soft_upper_lid',verts,faces,skin,[{bone:1} for _ in verts])
  pts=[V(x-rx+2*rx*i/18,z+rz*(.20+tilt*(-1+2*i/18)),f+.023) for i in range(19)]
  self.line('lid_edge',pts,.008,'frog_ink' if self.kind=='frog' else 'ink',bone)
 def smile(self,z,f,width,color='ink',mode='smile'):
  points=[]
  for i in range(25):
   x=-width+2*width*i/24;zz=z+(.035 if mode=='frown' else -.020)*math.sin(math.pi*i/24)
   points.append(V(x,zz,f+.003*math.sin(math.pi*i/24)))
  self.line('mouth',points,.009 if self.kind!='frog' else .012,color)

def cat(c):
 c.ellipsoid('cat_round_body',V(0,.55),(.355,.275,.37),'cat',c.weight_body,pear=.10,n=32,m=22)
 c.belly_patch('cat_cream_belly',.54,.265,.264,'cat_bib',(0,.55,0),(.355,.275,.37),pear=.10)
 for side in ('L','R'):c.limb(side,True,'cat',[.095,.073,.062],(.077,.073,.082));c.limb(side,False,'cat',[.091,.078,.066],(.11,.142,.075))
 c.ellipsoid('cat_squishy_head',V(0,1.035,.015),(.405,.285,.302),'cat',n=36,m=24,exp=.89)
 for s in (-1,1):
  # Rounded triangular ears, broad at the roots and softly tapered at the tips.
  c.curve('cat_ear',[V(s*.275,1.22,-.015),V(s*.29,1.31,-.01),V(s*.325,1.41,-.01),V(s*.323,1.445,-.01)],.119,'cat',depth=.50,sides=16,segments=14,taper=True)
  c.curve('cat_inner_ear',[V(s*.285,1.277,.048),V(s*.301,1.32,.055),V(s*.319,1.40,.02),V(s*.32,1.417,.01)],.063,'cat_bib',depth=.22,sides=12,segments=12,taper=True)
  c.ellipsoid('cat_cream_cheek',V(s*.118,.92,.252),(.179,.060,.104),'cat_bib',n=24,m=16)
  c.eye(s*.159,1.055,.283,.080,.092,'cat','mischief')
  c.line('cat_brow',[V(s*.075,1.171,.249),V(s*.142,1.181,.259),V(s*.217,1.163,.247)],.015,'cat_dark')
  for k in range(2):c.line('cat_whisker',[V(s*.24,.94-k*.05,.283),V(s*.36,.96-k*.073,.250)],.0055,'cat_dark')
 c.ellipsoid('cat_nose',V(0,.96,.333),(.037,.018,.025),'dog_dark',n=18,m=12,exp=.8)
 c.line('cat_nose_philtrum',[V(0,.94,.335),V(0,.904,.324)],.007,'dog_dark')
 for s in (-1,1):c.curve('cat_smirk',[V(0,.905,.323),V(s*.022,.876,.326),V(s*.075,.892,.318),V(s*.086,.917,.307)],.007,'dog_dark',segments=14,sides=8)
 for k in (-1,0,1):c.curve('cat_forehead_stripe',[V(k*.080,1.304,.11),V(k*.07,1.26,.19),V(k*.052,1.217,.25),V(k*.048,1.207,.255)],.018 if k else .023,'cat_dark',depth=.4,segments=12,sides=8,taper=True)
 def tw(t):u=smooth((t-.30)/.40);return {'tail':1-u,'tailTip':u}
 c.curve('cat_curled_tail',[V(0,.43,-.24),V(.32,.33,-.56),V(.65,.54,-.35),V(.50,.89,-.29)],.063,'cat',tw,segments=36,sides=16,taper=True)

def frog(c):
 c.ellipsoid('frog_low_pear_body',V(0,.505,-.015),(.355,.257,.363),'frog',c.weight_body,n=34,m=22,pear=.17)
 c.belly_patch('frog_soft_belly',.46,.28,.266,'frog_bib',(0,.505,-.015),(.355,.257,.363),pear=.17)
 for side,s in [('L',1),('R',-1)]:
  c.limb(side,True,'frog',[.078,.065,.045],(.068,.063,.043));c.limb(side,False,'frog',[.126,.106,.055],(.107,.156,.055))
  c.ellipsoid('frog_powerful_haunch',V(s*.35,.287,-.060),(.176,.177,.165),'frog','thigh_'+side,n=26,m=18)
  # Spread toes and hanging fingers, unmistakably amphibian rather than mitten hands.
  for digit in range(3):
   x=s*(.365+digit*.059)
   c.curve('frog_toe',[V(s*.395,.057,.16),V(x,.045,.24),V(x+s*.02,.04,.28),V(x+s*.026,.04,.30)],.027,'frog','foot_'+side,segments=8,sides=8,taper=True)
   hx=s*(.411+digit*.035)
   c.curve('frog_finger',[V(s*.445,.206,.135),V(hx,.16,.15),V(hx,.135,.15),V(hx+s*.006,.12,.15)],.021,'frog','hand_'+side,segments=8,sides=8,taper=True)
 c.ellipsoid('frog_wide_face',V(0,.736,.052),(.351,.264,.232),'frog',n=36,m=24,exp=.88)
 for s in (-1,1):
  c.ellipsoid('frog_eye_mound',V(s*.205,.913,.040),(.143,.157,.158),'frog',n=28,m=18)
  c.eye(s*.20,.918,.198,.088,.088,'frog','deadpan')
  c.ellipsoid('frog_nostril',V(s*.046,.805,.311),(.012,.007,.010),'frog_ink',n=12,m=8)
 c.smile(.665,.307,.224,'frog_ink','frown')
 # Mouth corners droop naturally; no repeated human cheek makeup.
 for s in (-1,1):c.line('frog_mouth_corner',[V(s*.223,.666,.307),V(s*.232,.648,.297)],.010,'frog_ink')

def dog(c):
 c.ellipsoid('dog_lean_body',V(0,1.025),(.235,.19,.34),'dog',c.weight_body,n=30,m=20,pear=.13)
 c.belly_patch('dog_chest_bib',1.096,.16,.257,'dog_bib',(0,1.025,0),(.235,.19,.34),pear=.13)
 c.ellipsoid('dog_long_neck',V(0,1.367,.012),(.126,.129,.223),'dog','neck',n=24,m=18)
 for side in ('L','R'):c.limb(side,True,'dog',[.080,.061,.052],(.063,.071,.083));c.limb(side,False,'dog',[.10,.075,.057],(.093,.157,.075),'dog_dark')
 c.ellipsoid('dog_long_head',V(0,1.653,.035),(.235,.219,.294),'dog',n=32,m=24,pear=-.04)
 for side,s in [('L',1),('R',-1)]:
  # Draping ears hang down from actual ear bones, with soft rounded lower ends.
  c.curve('dog_draped_ear',[V(s*.195,1.744,.0),V(s*.328,1.72,-.012),V(s*.31,1.36,.035),V(s*.29,1.303,.077)],.090,'dog_dark','ear_'+side,depth=.48,sides=16,segments=28)
  c.ellipsoid('dog_ear_round_end',V(s*.29,1.303,.077),(.09,.043,.077),'dog_dark','ear_'+side,n=22,m=14)
  c.eye(s*.095,1.702,.236,.057,.073,'dog','deadpan')
  c.line('dog_brow',[V(s*.043,1.806,.184),V(s*.09,1.823,.188),V(s*.147,1.80,.183)],.012,'dog_dark')
  c.ellipsoid('dog_muzzle_jowl',V(s*.063,1.524,.292),(.105,.144,.093),'dog_bib',n=26,m=18)
 c.ellipsoid('dog_nose',V(0,1.573,.418),(.083,.039,.052),'gloss',n=24,m=16,exp=.76)
 c.line('dog_philtrum',[V(0,1.535,.425),V(0,1.482,.409)],.008,'dog_dark')
 c.smile(1.474,.410,.062,'dog_dark')
 def tw(t):u=smooth((t-.25)/.6);return {'tail':1-u,'tailTip':u}
 c.curve('dog_tapered_tail',[V(0,.87,-.16),V(.08,.91,-.34),V(.15,1.10,-.41),V(.03,1.185,-.40)],.054,'dog',tw,segments=26,sides=14,taper=True)

def capybara(c):
 c.ellipsoid('capy_horizontal_barrel',V(0,.613,-.02),(.337,.52,.39),'capy',c.weight_body,n=36,m=24,exp=.83)
 for side,s in [('L',1),('R',-1)]:
  c.limb(side,True,'capy',[.105,.080,.071],(.092,.128,.085),'capy_dark');c.limb(side,False,'capy',[.133,.094,.080],(.103,.139,.085),'capy_dark')
  # Broad rear haunches flow into four short, grounded legs.
  c.ellipsoid('capy_haunch',V(s*.221,.43,-.30),(.15,.186,.213),'capy','thigh_'+side,n=24,m=18)
 c.ellipsoid('capy_low_neck',V(0,.76,.315),(.285,.238,.281),'capy','neck',n=30,m=20,exp=.9)
 c.ellipsoid('capy_long_box_head',V(0,.927,.493),(.28,.289,.243),'capy',n=34,m=24,exp=.69)
 c.ellipsoid('capy_blunt_muzzle',V(0,.826,.708),(.238,.153,.164),'capy_muzzle',n=32,m=22,exp=.59)
 for s in (-1,1):
  c.ellipsoid('capy_round_ear',V(s*.204,1.154,.402),(.061,.055,.081),'capy',n=22,m=16)
  c.ellipsoid('capy_inner_ear',V(s*.207,1.159,.449),(.031,.011,.044),'capy_dark',n=16,m=12)
  c.eye(s*.193,1.014,.713,.033,.042,'capy','deadpan')
  c.ellipsoid('capy_nostril',V(s*.092,.879,.861),(.024,.010,.014),'capy_dark',n=16,m=10)
  c.line('capy_foot_toe',[V(s*.26-.028,.066,.493),V(s*.26-.028,.032,.497)],.006,'dog_dark','hand_'+('L' if s==1 else 'R'))
  c.line('capy_foot_toe',[V(s*.26+.028,.066,.493),V(s*.26+.028,.032,.497)],.006,'dog_dark','hand_'+('L' if s==1 else 'R'))
 c.line('capy_mouth_vertical',[V(0,.820,.865),V(0,.735,.860)],.008,'capy_dark');c.line('capy_unbothered_mouth',[V(-.058,.724,.855),V(0,.734,.86),V(.058,.724,.855)],.008,'capy_dark')
 # Preserve the optional historical accessory; resident DJ remains the cockatoo.
 start=len(c.parts)
 c.curve('capy_headphone_band',[V(-.29,.995,.433),V(-.32,1.29,.433),V(.32,1.29,.433),V(.29,.995,.433)],.023,'ink',segments=32,sides=10)
 for s in (-1,1):c.ellipsoid('capy_headphone_cup',V(s*.30,.983,.449),(.045,.072,.089),'ink',n=18,m=12)
 for ob in c.parts[start:]:ob['role']='dj'

def panda(c):
 body=c.ellipsoid('panda_heavy_pear_body',V(0,.79),(.457,.329,.525),'panda',c.weight_body,n=36,m=26,pear=.20)
 body.data.materials.append(mat('panda_black'))
 for poly in body.data.polygons:
  if sum(body.data.vertices[i].co.z for i in poly.vertices)/len(poly.vertices)>1.02:poly.material_index=1
 # Black shoulder color is painted on one continuous torso surface; no layered seam.
 for side in ('L','R'):c.limb(side,True,'panda_black',[.13,.118,.093],(.109,.105,.116));c.limb(side,False,'panda_black',[.135,.115,.10],(.135,.172,.08))
 c.ellipsoid('panda_soft_square_head',V(0,1.429,.025),(.407,.285,.324),'panda',n=38,m=26,exp=.85,pear=.06)
 for s in (-1,1):
  c.ellipsoid('panda_round_ear',V(s*.278,1.704,-.028),(.105,.080,.112),'panda_black',n=26,m=18)
  c.ellipsoid('panda_eye_patch',V(s*.151,1.46,.286),(.103,.032,.13),'panda_black',n=26,m=18)
  c.eye(s*.148,1.475,.317,.046,.058,'panda_black','deadpan')
 c.ellipsoid('panda_soft_muzzle',V(0,1.31,.286),(.14,.050,.096),'panda',n=26,m=18)
 c.ellipsoid('panda_nose',V(0,1.349,.333),(.05,.023,.036),'gloss',n=20,m=14,exp=.8)
 c.line('panda_nose_line',[V(0,1.326,.35),V(0,1.277,.342)],.008,'panda_black')
 c.line('panda_deadpan_mouth',[V(-.05,1.271,.33),V(0,1.279,.342),V(.05,1.271,.33)],.008,'panda_black')
 c.ellipsoid('panda_little_tail',V(0,.56,-.326),(.092,.08,.086),'panda','hips',n=20,m=14)

def export(c):
 # Center the quadruped's complete solid silhouette on its navigation root.
 # The horizontal barrel remains long; neither head nor rear overhang the body radius.
 if c.kind=='capybara':
  for ob in c.parts:
   for vertex in ob.data.vertices:vertex.co.y=(vertex.co.y+.167)*.87
  for name,co in c.joints.items():
   if name!='root':co.y=(co.y+.167)*.87
 data=bpy.data.armatures.new(c.kind+'_skeleton');arm=bpy.data.objects.new(c.kind+'_rig',data);bpy.context.collection.objects.link(arm);arm['speciesRig']='quadruped' if c.kind=='capybara' else 'animal-v2';arm['bodyPlan']=c.spec['bodyPlan'];arm['revision']='species-anatomy-v3';bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name,co in c.joints.items():bone=data.edit_bones.new(name);bone.head=co;bone.tail=co+Vector((0,0,.10));bone.roll=0
 for name,parent in c.parents.items():data.edit_bones[name].parent=data.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 for ob in c.parts:ob.parent=arm;mod=ob.modifiers.new('Species soft articulation','ARMATURE');mod.object=arm
 # Save the native authored scene before vertex-color draw consolidation.
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(c.kind+'.blend')))
 groups={}
 for name,rough in [('vinyl',.61),('gloss',.30)]:
  m=bpy.data.materials.new('Animal_'+name);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.22;vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='avatar_color';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);groups[name]=m
 for ob in c.parts:
  attr=ob.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER');old=list(ob.data.materials)
  for poly in ob.data.polygons:
   for loop in poly.loop_indices:attr.data[loop].color=old[poly.material_index].diffuse_color
  ob.data.materials.clear();ob.data.materials.append(groups[ob.get('surface_group','vinyl')]);bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 joined=[]
 for role,parts in [(None,[o for o in c.parts if o.get('role')!='dj']),('dj',[o for o in c.parts if o.get('role')=='dj'])]:
  if not parts:continue
  bpy.ops.object.select_all(action='DESELECT')
  for ob in parts:ob.select_set(True)
  bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();ob=bpy.context.object;ob.name=c.kind+('_headphones' if role else '_skin');joined.append(ob)
  if role:ob['role']=role
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
 for ob in joined:ob.select_set(True)
 bpy.context.view_layer.objects.active=arm
 path=OUT/(c.kind+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
 triangles=sum(sum(len(p.vertices)-2 for p in ob.data.polygons) for ob in joined)
 main=[o for o in joined if o.get('role')!='dj'];verts=[v.co for o in main for v in o.data.vertices];bounds=[[min(v[i] for v in verts),max(v[i] for v in verts)] for i in range(3)]
 return {'kind':c.kind,'triangles':triangles,'bytes':path.stat().st_size,'materialGroups':sum(len(o.data.materials) for o in joined),'revision':'species-anatomy-v3','bodyPlan':c.spec['bodyPlan'],'bones':len(c.joints),'authoredBoundsBlender':bounds,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'generator':'scripts/avatars/animal-diversity/generate_animals.py','provenance':'Original procedural animal sculpts and species-specific skeletal proportions authored from user reference direction; no third-party models or textures.'}
results=[]
for kind in ['cat','frog','dog','capybara','panda']:
 if args.only and args.only!=kind:continue
 clear();c=Animal(kind);globals()[kind](c);entry=export(c);results.append(entry);print('SPECIES_READY',json.dumps(entry),flush=True)
(OUT/'revision-manifest.json').write_text(json.dumps({'avatars':results},indent=2)+'\n')

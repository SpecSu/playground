"""Original rounded cast revision. Isolated authoring only; never writes public assets.
Reuses the approved sculpt's math/weighted tailoring, without invoking legacy exports.
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/polished-cast/generate_polished.py -- --output-dir /absolute/review
"""
import ast, argparse, bpy, bmesh, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',type=Path,default=HERE/'generated');parser.add_argument('--only');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.output_dir.resolve()
if OUT==REPO/'public'/'avatars':raise RuntimeError('Generate in isolated review directory, then inspect before installing.')
OUT.mkdir(parents=True,exist_ok=True)
TAU=math.tau

def clear():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)

def legacy_helpers():
 # Only explicit geometry definitions are imported: no guard, CLI, scene or export.
 source=HERE.parent/'generate_club_avatars.py';tree=ast.parse(source.read_text().replace('faces=[];n=64', 'faces=[];n=128'))
 wanted={'COLORS','MATERIALS','TAU'}
 nodes=[node for node in tree.body if isinstance(node,(ast.FunctionDef,ast.ClassDef)) or isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in wanted for t in node.targets)]
 ns={'bpy':bpy,'bmesh':bmesh,'math':math,'Vector':Vector,'OUT':OUT}
 exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),ns)
 return ns

def sample_geometry():
 source=HERE.parent/'sample-subeike'/'generate_sample.py'
 text=source.read_text().split('# Existing 18-joint local-axis convention')[0]
 # Polygon density is reduced at authoring, not by a shape-changing decimator.
 text=text.replace("    verts=[(center[0],center[1],center[2]+scale[2])]", "    n=min(n,18);m=min(m,10)\n    verts=[(center[0],center[1],center[2]+scale[2])]")
 text=text.replace("    verts=[];faces=[];ws=[]\n", "    sides=min(sides,12)\n    verts=[];faces=[];ws=[]\n").replace('color,bone,sides=10)', 'color,bone,sides=8)')
 text=text.replace('sides=48;levels=35','sides=40;levels=29').replace('n=40\n    for j,(z,r,f)', 'n=32\n    for j,(z,r,f)')
 old=sys.argv;sys.argv=['blender','--','--output-dir',str(OUT)]
 ns={'__file__':str(source),'__name__':'rounded_sculpt_source'}
 try:exec(compile(text,str(source),'exec'),ns)
 finally:sys.argv=old
 return ns

def remove(parts,predicate):
 for ob in list(parts):
  if predicate(ob):parts.remove(ob);bpy.data.objects.remove(ob,do_unlink=True)

def recolor(ns,key,color,rough=None):
 m=ns['M'][key];rgb=[ns['linear'](int(color[i:i+2],16)/255) for i in (0,2,4)]
 m.diffuse_color=(*rgb,1);bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*rgb,1)
 if rough is not None:bs.inputs['Roughness'].default_value=rough

def build_human(kind):
 clear();n=sample_geometry();parts=n['PARTS'];V=n['V'];sphere=n['sphere'];sweep=n['sweep'];line=n['line'];bezier=n['bezier'];patch=n['face_patch'];oval=n['oval'];front=n['head_front'];body=n['body'];material=n['material'];M=n['M'];jiji=kind=='human-jiji';lx=kind=='human-lx'
 # Keep the continuous cheeks/jaw and fitted body; replace all expression surfaces.
 remove(parts,lambda o:o.name.startswith(('Eye_','Pupil_','Upper_eyelid_','Brow_','Graphic_nose','Smile_','Hair_')))
 recolor(n,'skin','FFC48D');recolor(n,'blush','EDAB89')
 for key,col in [('hair','9C1836' if jiji else '28272F' if lx else '774A31'),('hair_light','B42543' if jiji else '34323B' if lx else '875537'),('hair_dark','6F112E' if jiji else '201F26' if lx else '563826')]:recolor(n,key,col)
 # Rounded, friendly eyes; matte curved mouth avoids teeth and faceted smiles.
 for s in (-1,1):
  x=s*.139
  patch('Eye_white_'+str(s),oval(x,1.626,.090,.074,32,tilt=s*.004),'white',.006,3,.001)
  patch('Pupil_'+str(s),oval(x+.018,1.622,.043,.064,28),'face_ink',.012,3,.001)
  patch('Eye_spark_'+str(s),oval(x+.006,1.650,.010,.012,14),'white',.015,2,.0005)
  pts=[V(x+.092*math.cos(math.pi*i/18),1.627+.074*math.sin(math.pi*i/18),front(x+.092*math.cos(math.pi*i/18),1.627+.074*math.sin(math.pi*i/18))+.014) for i in range(19)]
  line('Soft_lid_'+str(s),pts,.007,'face_ink')
  if jiji:
   for k in range(2):
    xx=x+s*(.076+k*.010);zz=1.672-k*.013
    line('Lash_'+str(s)+str(k),[V(xx,zz,front(xx,zz)+.015),V(xx+s*.024,zz+.018,front(xx,zz)+.015)],.008,'face_ink')
  pts=[V(x-.068+.136*i/16,1.765+.013*math.sin(math.pi*i/16),front(x-.068+.136*i/16,1.765+.013*math.sin(math.pi*i/16))+.012) for i in range(17)]
  line('Soft_brow_'+str(s),pts,.011 if jiji else .015,'hair_dark')
  # Delicate peach cheek dots are physically on the skin, not floating balls.
  patch('Cheek_'+str(s),oval(s*.237,1.480,.042,.021,22),'blush',.002,3,0)
 sphere('Button_nose',V(0,1.525,front(0,1.525)+.008),(.025,.024,.027),'skin',n=20,m=12)
 pts=[]
 for i in range(25):
  x=-.073+.146*i/24;z=1.426-.027*math.sin(math.pi*i/24)
  pts.append(V(x,z,front(x,z)+.010))
 line('Quiet_smile',pts,.008,'mouth')
 # Skull-wrapping smooth cap: no disconnected chunks or tube-cut bang ends.
 verts=[];faces=[];ns=48;rings=16
 for j in range(rings):
  u=j/(rings-1)
  for i in range(ns):
   theta=TAU*i/ns;f=max(0,-math.sin(theta));bottom=1.395+.09*abs(math.cos(theta))+.45*f
   z=bottom+(2.062-bottom)*u
   if z<1.925:
    rx,rd,hf=n['profile_at'](z);rx+=.018;rd+=.018;exp=n['EXP'];ct=math.cos(theta);st=math.sin(theta)
    verts.append((rx*math.copysign(abs(ct)**(2/exp),ct),-hf+rd*math.copysign(abs(st)**(2/exp),st),z))
   else:
    q=math.sqrt(max(.0002,1-((z-1.72)/.347)**2));verts.append((.365*q*math.cos(theta),.02+.28*q*math.sin(theta),z))
  if j:
   for i in range(ns):a=(j-1)*ns+i;b=(j-1)*ns+(i+1)%ns;faces.append((a,b,b+ns,a+ns))
 cap=len(verts);verts.append((0,.02,2.069))
 for i in range(ns):faces.append(((rings-1)*ns+i,(rings-1)*ns+(i+1)%ns,cap))
 n['mesh']('Hair_cap',verts,faces,'hair')
 def lock(name,control,width,depth,color='hair'):
  points=bezier(control,22);widths=[];depths=[]
  for i in range(23):
   t=i/22;envelope=(.76+.24*math.sin(math.pi*t))*(1-t)**.60
   widths.append(max(.002,width*envelope));depths.append(max(.002,depth*envelope))
  sweep(name,points,widths,depths,color,sides=12)
 if jiji:
  for i,(x,tip) in enumerate([(-.23,-.25),(-.08,-.075),(.085,.115),(.23,.275)]):
   lock('Rounded_fringe_'+str(i),[V(x*.65,2.00,.095),V(x*.88,1.94,.24),V(x,1.82,.283),V(tip,1.737+(.014 if i in (0,3) else 0),.25)],.11,.042,'hair_light' if i==1 else 'hair')
  for s in (-1,1):
   points=[];widths=[]
   for i in range(41):
    t=i/40;x=s*(.33+.062*math.sin(t*math.pi*3.2));z=1.69-.63*t
    points.append(V(x,z,-.018+.02*t));widths.append(.091*(1-.75*t**3))
   sweep('Flowing_twin_curl_'+str(s),points,widths,[w*.76 for w in widths],'hair',sides=14)
 else:
  lock('Sweep_main',[V(.10,2.035,-.025),V(-.13,2.12,.16),V(-.32,1.95,.29),V(-.31,1.76,.18)],.142,.047,'hair')
  lock('Sweep_front',[V(.13,2.021,.09),V(.04,2.09,.27),V(-.20,1.91,.33),V(-.218,1.77,.25)],.119,.041,'hair_light')
  lock('Sweep_center',[V(.13,2.018,.09),V(.17,2.05,.24),V(.045,1.91,.31),V(.002,1.795,.26)],.082,.037,'hair')
  lock('Sweep_right',[V(.14,2.016,.02),V(.35,2.04,.10),V(.33,1.9,.26),V(.32,1.77,.17)],.103,.045,'hair')
 if lx:
  # Preserve base sneakers and hands; replace jacket panels with a rounded hoodie.
  remove(parts,lambda o:o.name.startswith(('Jacket_','Lapel_','Golden_','Sunglass_','Rolled_cuff_')))
  recolor(n,'jacket','34343C');recolor(n,'pants','292A33');recolor(n,'cuff','383941')
  M['hood']=material('Hoodie_charcoal','30313A',.78,'cloth');M['rib']=material('Hoodie_rib','42424B',.82,'cloth');M['frame_black']=material('Frames_black','17191F',.31,'gloss')
  remove(parts,lambda o:o.name=='Tee')
  body('Hoodie_body',[(.696,.18,0),(.72,.218,0),(.80,.232,0),(.96,.247,0),(1.10,.253,0),(1.16,.204,0),(1.187,.089,0)],'hood',.72)
  body('Hoodie_hem',[(.701,.190,0),(.713,.221,0),(.749,.225,0),(.768,.223,0)],'rib',.74)
  sphere('Hood_fold',V(0,1.145,-.055),(.236,.178,.101),'hood','chest',n=24,m=12)
  line('Hood_front_edge',[V(-.14,1.17,.091),V(-.10,1.143,.144),V(0,1.112,.168),V(.10,1.143,.144),V(.14,1.17,.091)],.018,'rib','chest')
  sphere('Kangaroo_pocket',V(0,.844,.167),(.147,.027,.074),'rib','spine',n=24,m=12)
  for side,s in [('L',1),('R',-1)]:
   # Full sleeves around the existing smooth forearms, with soft ribbed cuffs.
   for ob in parts:
    if ob.name.startswith('Forearm_'+side):ob.data.materials.clear();ob.data.materials.append(M['hood'])
   a,e,h=[Vector(n['JOINTS'][k+'_'+side]) for k in ('upperArm','forearm','hand')]
   sweep('Wrist_rib_'+side,[e.lerp(h,.74),e.lerp(h,.84),e.lerp(h,.94)],[.068,.072,.064],[.061,.064,.057],'rib','forearm_'+side,sides=16)
   line('Drawstring_'+side,[V(s*.061,1.118,.182),V(s*.064,1.028,.19),V(s*.067,.992,.191)],.008,'rib','chest')
   # Rounded rectangular rims conform to the true head surface, no square tube corners.
   points=[]
   for i in range(65):
    a=TAU*i/64;xx=s*.139+.112*math.copysign(abs(math.cos(a))**.50,math.cos(a));zz=1.63+.088*math.copysign(abs(math.sin(a))**.50,math.sin(a))
    points.append(V(xx,zz,front(xx,zz)+.032))
   line('Spectacle_rim_'+side,points,.014,'frame_black')
   line('Spectacle_temple_'+side,[V(s*.248,1.673,front(s*.248,1.673)+.029),V(s*.348,1.666,.023)],.010,'frame_black')
  line('Spectacle_bridge',[V(-.026,1.657,front(-.026,1.657)+.036),V(0,1.667,front(0,1.667)+.036),V(.026,1.657,front(.026,1.657)+.036)],.012,'frame_black')
 if jiji:
  # Retain smooth hands/skin and replace outfit as one softly flared dress.
  remove(parts,lambda o:o.name.startswith(('Tee','Trouser_','Jacket_','Lapel_','Golden_','Sunglass_','Sleeve_','Rolled_cuff_','Sneaker_','Sole_','Toe_seam_','Lace_')))
  M['dress']=material('Dress_cranberry','A91435',.80,'cloth');M['red']=material('Bows_strawberry','D82949',.72,'cloth');M['lace']=material('Lace_ivory','FFF5E9',.86,'cloth');M['sock']=M['lace'];M['leaf']=material('Strawberry_leaf','438B4F',.77,'cloth');M['watch']=material('Watch_brass','C39A48',.32,'gloss')
  body('Dress_continuous',[(.466,.319,0),(.487,.35,0),(.55,.343,0),(.66,.304,0),(.78,.236,0),(.86,.194,0),(.98,.196,0),(1.10,.226,0),(1.16,.132,0)],'dress',.82)
  body('Lace_hem',[(.457,.313,0),(.472,.351,0),(.498,.353,0)],'lace',.83)
  for side,s in [('L',1),('R',-1)]:
   a,e,h=[Vector(n['JOINTS'][k+'_'+side]) for k in ('upperArm','forearm','hand')]
   points=bezier([a+Vector((-s*.035,0,.018)),a.lerp(e,.40),a.lerp(e,.74),e.lerp(h,.15)],16)
   widths=[.050+.057*math.sin(math.pi*(i/16)*.88) for i in range(17)]
   sweep('Puff_sleeve_'+side,points,widths,[w*.83 for w in widths],'lace',weights=lambda t,side=side:n['limb_weights'](side,'upperArm','forearm',t,.75),sides=18)
   hip,knee,foot=[Vector(n['JOINTS'][k+'_'+side]) for k in ('thigh','shin','foot')]
   points=bezier([hip,hip.lerp(knee,.6),knee.lerp(foot,.4),foot],18)
   sweep('Leg_'+side,points,.080,.077,'skin',weights=lambda t,side=side:n['limb_weights'](side,'thigh','shin',t,.54),sides=16)
   sweep('Sock_'+side,[foot,foot+Vector((0,0,.15))],[.084,.086],[.080,.080],'sock','shin_'+side,sides=18)
   sphere('Maryjane_'+side,V(foot.x,.092,.085),(.124,.193,.087),'dress','foot_'+side,n=24,m=12)
   sphere('Shoe_sole_'+side,V(foot.x,.032,.084),(.128,.198,.031),'hair_dark','foot_'+side,n=24,m=10)
   line('Shoe_strap_'+side,[V(foot.x-.097,.144,.06),V(foot.x,.174,.08),V(foot.x+.097,.144,.06)],.014,'red','foot_'+side)
  for i in range(4):
   z=.86+i*.058
   for s in (-1,1):line('Dress_lacing',[V(s*.041,z,.165),V(-s*.041,z+.046,.165)],.008,'lace','spine')
  # Bonnet brim and accessories reuse the original identity, with smoother contours.
  L=legacy_helpers();c=L['Cast'](kind);c.bones=n['JOINTS'].copy()
  original_sphere=c.sphere
  def prop_sphere(name,center,scale,color,bone='head',n=16,m=10):
   if name!='bonnet_crown':n=min(n,14);m=min(m,8)
   return original_sphere(name,center,scale,color,bone,n=n,m=m)
  c.sphere=prop_sphere
  L['COLORS'].update({'burgundy':'A91435','cream':'FFF5E9','berry':'D82949','redhair':'9C1836'})
  c.sphere('bonnet_crown',L['v'](0,2.04,-.02),(.422,.31,.148),'burgundy',n=32,m=16)
  L['ribbon'](c,'bonnet_soft_brim',(0,0,0),.50,.35,1.978,'burgundy')
  L['ribbon'](c,'bonnet_white_lace',(0,0,0),.516,.363,1.967,'cream',ruffles=16)
  for s in (-1,1):L['bow'](c,s*.343,1.70,.04,'berry',size=.045)
  L['bow'](c,-.14,2.164,.12,'burgundy',size=.075)
  L['strawberry'](c,-.20,2.102,.273,size=.064)
  c.sphere('watch_rim',L['v'](.005,2.103,.298),(.066,.020,.073),'gold_dark',n=24,m=12)
  c.sphere('watch_face',L['v'](.005,2.103,.32),(.054,.006,.061),'cream',n=24,m=12)
  c.line('watch_hands',[L['v'](-.018,2.128,.328),L['v'](.005,2.103,.328),L['v'](.036,2.118,.328)],.005,'chocolate')
  c.sphere('white_cat_charm',L['v'](.198,2.096,.272),(.080,.02,.060),'cream',n=20,m=12)
  for s in (-1,1):
   c.tube('charm_ear',[L['v'](.198+s*.051,2.134,.27),L['v'](.198+s*.06,2.168,.27)],[.023,.005],'cream','head',segments=4,sides=10,depth=.5)
   c.sphere('charm_eye',L['v'](.198+s*.028,2.093,.295),(.006,.004,.010),'ink',n=8,m=6)
  L['bow'](c,.26,2.135,.294,'berry',size=.026)
  for x,z in [(-.23,.57),(0,.54),(.23,.57)]:L['strawberry'](c,x,z,.254,size=.045,bone='hips')
  L['bow'](c,0,.807,.186,'berry','spine',size=.073)
  for i in range(7):
   x=(i-3)*.027;c.sphere('necklace_bead',L['v'](x,1.203-abs(i-3)*.004,.11),(.012,.012,.014),['pink','gold','teal'][i%3],'neck',n=8,m=6)
  c.sphere('strawberry_backpack',L['v'](0,.97,-.213),(.188,.117,.205),'berry','chest',n=20,m=12)
  for o in c.parts:
   for mat in o.data.materials:
    mat['surface_group']='gloss' if mat.name in ('gold','gold_dark') else 'cloth'
   parts.append(o)
  # Soft hem follows the hips and thighs, including fruit and bows.
  for o in parts:
   group=o.vertex_groups.get('hips')
   if group is None:continue
   for vert in o.data.vertices:
    weight=next((g.weight for g in vert.groups if g.group==group.index),0)
    if weight<.999 or vert.co.z>=.80:continue
    amount=min(.76,max(0,(.80-vert.co.z)/.30)*.76);side=max(0,min(1,.5+vert.co.x/.32));group.add([vert.index],1-amount,'REPLACE')
    for name,w in [('thigh_L',amount*side),('thigh_R',amount*(1-side))]:(o.vertex_groups.get(name) or o.vertex_groups.new(name=name)).add([vert.index],w,'REPLACE')
 # Softer, slightly broader face proportions; every head feature moves together.
 for o in parts:
  for vert in o.data.vertices:
   head=o.vertex_groups.get('head');weight=next((g.weight for g in vert.groups if head and g.group==head.index),0)
   if weight>.99:
    vert.co.x*=1.03;vert.co.z=1.60+(vert.co.z-1.60)*.96
 return parts,n['JOINTS']

def build_animal(kind):
 clear();L=legacy_helpers();c=L['animal'](kind);V=L['v'];coat,bib={'cat':('fur','fur_light'),'frog':('green','green_light'),'dog':('chocolate','fur'),'capybara':('fur','fur_light'),'panda':('cream','ink')}[kind]
 # Species expressions replace the repeated sleepy human eyelids and eyebrows.
 remove(c.parts,lambda o:o.name.startswith(('eye_white','pupil','sleepy_upper_lid','eyebrow','mouth','wide_mouth','animal_head','broad_capy_muzzle','nostril','panda_eye_patch','panda_muzzle','panda_ear','tiny_round_ear','headphone_','nose','wet_nose','hound_muzzle')))
 def eye(x,z,f,rx=.039,rz=.057,color='ink'):
  c.sphere('bright_eye',V(x,z,f),(rx,.021,rz),color,n=20,m=12)
  c.sphere('eye_glint',V(x-.010,z+.019,f+.021),(.010,.004,.012),'white',n=10,m=8)
 if kind=='frog':
  # Wide friendly mouth and eyes high on the protruding eye mounds.
  for s in (-1,1):
   c.sphere('frog_eye_white',V(s*.22,1.486,.190),(.074,.030,.079),'cream',n=20,m=12);eye(s*.22,1.486,.219,.033,.050)
   c.sphere('frog_cheek',V(s*.265,1.22,.219),(.046,.012,.025),'pink',n=14,m=8)
  c.line('frog_smile',[V(-.25+.50*i/28,1.245-.033*math.sin(math.pi*i/28),.248+.02*math.sin(math.pi*i/28)) for i in range(29)],.012,'teal_dark')
  for s in (-1,1):c.sphere('frog_nostril',V(s*.074,1.32,.259),(.010,.006,.008),'teal_dark',n=8,m=6)
 elif kind=='capybara':
  # Large blunt rectangular muzzle, high tiny ears and high-set dark eyes.
  c.sphere('capybara_long_head',V(0,1.345,.095),(.322,.343,.274),'fur',n=28,m=18)
  c.sphere('capybara_blunt_muzzle',V(0,1.242,.281),(.286,.208,.181),'fur',n=28,m=16)
  for s in (-1,1):
   c.sphere('capybara_high_ear',V(s*.255,1.572,-.073),(.071,.059,.077),'fur',n=18,m=12)
   c.sphere('capybara_inner_ear',V(s*.262,1.577,-.018),(.033,.012,.036),'chocolate',n=14,m=8)
   eye(s*.205,1.438,.345,.029,.036)
   c.sphere('capybara_nostril',V(s*.097,1.29,.483),(.023,.009,.012),'chocolate',n=12,m=8)
  c.line('capybara_smile',[V(-.072,1.167,.475),V(0,1.158,.479),V(.072,1.167,.475)],.009,'chocolate')
  # Optional original headphones remain separately controllable.
  start=len(c.parts);c.line('headphone_band',[V(-.345,1.37,-.055),V(-.34,1.60,-.055),V(-.16,1.71,-.055),V(.16,1.71,-.055),V(.34,1.60,-.055),V(.345,1.37,-.055)],.025,'ink')
  for s in (-1,1):c.sphere('headphone_cup',V(s*.347,1.38,-.03),(.052,.094,.112),'ink',n=16,m=10)
  for o in c.parts[start:]:o['role']='dj'
 elif kind=='panda':
  c.sphere('panda_round_head',V(0,1.36,.012),(.377,.277,.318),'cream',n=28,m=18)
  for s in (-1,1):
   c.sphere('panda_round_ear',V(s*.273,1.619,-.056),(.111,.082,.115),'ink',n=20,m=12)
   patch=c.sphere('panda_black_patch',V(s*.145,1.40,.252),(.092,.027,.124),'ink',n=22,m=14)
   c.sphere('panda_eye_white',V(s*.145,1.421,.280),(.041,.011,.050),'white',n=16,m=10);eye(s*.145,1.421,.291,.021,.032)
  c.sphere('panda_white_muzzle',V(0,1.231,.259),(.171,.073,.106),'cream',n=22,m=14)
  c.sphere('panda_nose',V(0,1.276,.33),(.046,.024,.030),'ink',n=16,m=10)
  c.line('panda_smile',[V(-.053,1.205,.322),V(0,1.19,.328),V(.053,1.205,.322)],.009,'ink')
  # Pale belly and a black shoulder band identify the giant panda clearly.
  for ob in c.parts:
   if ob.name.startswith('belly_patch'):ob.data.materials.clear();ob.data.materials.append(L['mat']('cream'))
  c.body('panda_shoulder_band',[(.91,.327,0),(.97,.300,0),(1.08,.241,0),(1.12,.14,0)],'ink',depth=.80)
 elif kind=='cat':
  c.sphere('cat_round_head',V(0,1.32,.004),(.352,.260,.282),coat,n=26,m=16)
  # Original ears, tabby marks, cheek whiskers and curling tail remain.
  for s in (-1,1):eye(s*.139,1.363,.252,.047,.061)
  c.sphere('cat_pink_nose',V(0,1.239,.319),(.031,.019,.022),'pink',n=16,m=10)
  for s in (-1,1):c.line('cat_mouth',[V(0,1.22,.320),V(s*.029,1.196,.316),V(s*.059,1.203,.310)],.007,'chocolate')
 elif kind=='dog':
  c.sphere('dog_head',V(0,1.34,.01),(.297,.273,.309),'chocolate',n=26,m=16)
  for s in (-1,1):
   c.sphere('dog_muzzle',V(s*.065,1.21,.251),(.125,.106,.090),'fur_light',n=20,m=12);eye(s*.119,1.399,.265,.043,.056)
   c.sphere('dog_brow_spot',V(s*.126,1.49,.246),(.059,.013,.030),'fur',n=16,m=10)
  c.sphere('dog_black_nose',V(0,1.253,.356),(.066,.036,.045),'ink',n=20,m=12)
  c.sphere('dog_tongue',V(.014,1.12,.304),(.036,.018,.047),'pink',n=16,m=10)
  c.line('dog_mouth',[V(-.061,1.169,.333),V(0,1.155,.344),V(.065,1.171,.331)],.010,'chocolate')
 # Rounded shoulder volumes seal the old tube-cap transition to each torso.
 for side in ('L','R'):
  a=Vector(c.bones['upperArm_'+side]);a.x*=.95
  radius=.102 if kind=='frog' else .133
  c.sphere('rounded_shoulder_'+side,tuple(a),(radius,radius*.97,radius*1.03),'ink' if kind=='panda' else coat,'upperArm_'+side,n=18,m=12)
 for ob in c.parts:
  ob['surface_group']='gloss' if any(word in ob.name for word in ('bright_eye','eye_glint','eye_white','nose','nostril')) else 'cloth'
 # More height contrast, without multiplying the torso collision envelope.
 targets={'frog':1.04,'cat':1.35,'dog':1.65,'capybara':1.94,'panda':2.28}
 top=max(v.co.z for o in c.parts for v in o.data.vertices);bottom=min(v.co.z for o in c.parts for v in o.data.vertices)
 sz=targets[kind]/(top-bottom);sx={'frog':.74,'cat':.88,'dog':.96,'capybara':1.01,'panda':1.04}[kind]
 for o in c.parts:
  for vert in o.data.vertices:vert.co.x*=sx;vert.co.y*=sx;vert.co.z=(vert.co.z-bottom)*sz
  for mat in o.data.materials:mat['surface_group']='gloss' if mat.name in ('ink','gold','gold_dark') else 'cloth'
 c.bones={k:(co[0]*sx,co[1]*sx,(co[2]-bottom)*sz if k!='root' else 0) for k,co in c.bones.items()}
 return c.parts,c.bones

def export(kind,parts,joints):
 adata=bpy.data.armatures.new(kind+'_skeleton');arm=bpy.data.objects.new(kind+'_rig',adata);bpy.context.collection.objects.link(arm);bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 parents={'hips':'root','spine':'hips','chest':'spine','neck':'chest','head':'neck'}
 for side in ('L','R'):parents.update({'upperArm_'+side:'chest','forearm_'+side:'upperArm_'+side,'hand_'+side:'forearm_'+side,'thigh_'+side:'hips','shin_'+side:'thigh_'+side,'foot_'+side:'shin_'+side})
 for name,co in joints.items():b=adata.edit_bones.new(name);b.head=co;b.tail=Vector(co)+Vector((0,0,.10));b.roll=0
 for name,parent in parents.items():adata.edit_bones[name].parent=adata.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 for ob in parts:ob.parent=arm;mod=ob.modifiers.new('Soft dance deformation','ARMATURE');mod.object=arm
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(kind+'.blend')))
 groups={}
 for group,rough in [('skin',.56),('hair',.53),('cloth',.80),('gloss',.32)]:
  mat=bpy.data.materials.new('Rounded_'+group);mat.use_nodes=True;bs=mat.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.24;vc=mat.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='avatar_color';mat.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);groups[group]=mat
 for ob in parts:
  attr=ob.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER');old=list(ob.data.materials)
  for poly in ob.data.polygons:
   rgba=old[poly.material_index].diffuse_color
   for loop in poly.loop_indices:attr.data[loop].color=rgba
  # One group per authored part; legacy multi-colored sleeve parts are not used.
  group=ob.get('surface_group',old[0].get('surface_group','cloth'));ob.data.materials.clear();ob.data.materials.append(groups[group])
  bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 main=[o for o in parts if o.get('role')!='dj'];accessory=[o for o in parts if o.get('role')=='dj'];joined=[]
 for obs,role in [(main,None),(accessory,'dj')]:
  if not obs:continue
  bpy.ops.object.select_all(action='DESELECT')
  for ob in obs:ob.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.join();ob=bpy.context.object;ob.name=kind+('_headphones' if role else '_skin')
  if role:ob['role']=role
  joined.append(ob)
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
 for ob in joined:ob.select_set(True)
 bpy.context.view_layer.objects.active=arm
 path=OUT/(kind+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
 tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in joined)
 return {'kind':kind,'triangles':tris,'bytes':path.stat().st_size,'materialGroups':sum(len(o.data.materials) for o in joined),'revision':'rounded-cast-v2','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'generator':'scripts/avatars/polished-cast/generate_polished.py','provenance':'Original code-authored rounded character revision from user-provided illustrations; no external models or textures.'}

results=[]
for kind in ['human-jiji','human-subeike','human-lx','cat','frog','dog','capybara','panda']:
 if args.only and args.only!=kind:continue
 parts,joints=build_human(kind) if kind.startswith('human') else build_animal(kind)
 results.append(export(kind,parts,joints));print('POLISHED_READY',kind,results[-1],flush=True)
(OUT/'revision-manifest.json').write_text(json.dumps({'avatars':results},indent=2)+'\n')

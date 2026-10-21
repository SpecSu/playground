"""Original, reference-grounded meme vinyl sculptures. Generate away from shipping.
blender -b -t 4 --python-exit-code 1 -P scripts/avatars/meme-cast/generate_memes.py -- --output-dir /tmp/meme-review
The shared primitive/rig library is loaded without its generator entry point.
"""
import argparse, ast, bpy, bmesh, hashlib, json, math, sys
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[2]
BASE=HERE.parent/'animal-diversity'/'generate_animals.py'
module=ast.parse(BASE.read_text())
# Reuse the established mesh, skin-weight and bone-axis contract, never its assets.
shared=[node for node in module.body if isinstance(node,(ast.Import,ast.ImportFrom,ast.FunctionDef,ast.ClassDef)) or isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('TAU','COLORS','M') for t in node.targets)]
exec(compile(ast.Module(body=shared,type_ignores=[]),str(BASE),'exec'))
p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--only',choices=['banana-cat','sword-shield-dog']);args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=args.output_dir.resolve();OUT.mkdir(parents=True,exist_ok=True)
if OUT==REPO/'public'/'avatars':raise RuntimeError('Inspect exported GLBs before installation.')
COLORS.update({'banana':'F6D12C','banana_light':'FFE15C','banana_seam':'BF9220','banana_spot':'795122','stem':'70502C','cat_fur':'C4BBA8','cat_face':'E8E2D2','cat_mask':'AAA08F','cat_nose':'BE8584','tear':'64C9EC','tear_light':'C8F4FF','dog_gold':'C28D54','dog_top':'AC713D','dog_cream':'F5DEAE','dog_lid':'99683D','dog_nose':'272522','shield':'696C69','shield_inner':'777D78','shield_rim':'A88E58','shield_boss':'B8A371','steel':'AAB4BC','steel_edge':'E0E7E8','handle':'353230','rivet':'C2B38E'})
SPEC={
 'banana-cat':{'bodyPlan':'closed-banana-suit','hips':[0,.28,0],'spine':[0,.62,0],'chest':[0,.88,0],'neck':[0,1.015,0],'head':[0,1.13,.02],'shoulder':[.22,.56,0],'elbow':[.30,.43,.012],'hand':[.35,.37,.06],'hip':[.12,.245,0],'knee':[.135,.15,.018],'ankle':[.145,.058,.035]},
 'sword-shield-dog':{'bodyPlan':'squat-cheems-frog','hips':[0,.28,0],'spine':[0,.39,0],'chest':[0,.50,0],'neck':[0,.54,.035],'head':[0,.59,.06],'shoulder':[.37,.52,0],'elbow':[.48,.48,.045],'hand':[.59,.53,.095],'hip':[.31,.255,-.045],'knee':[.43,.15,-.008],'ankle':[.425,.06,.13]}}

def banana_weights(p):
 z=p.z
 if z<.86:return Animal.weight_body(current,p)
 t=smooth((z-.86)/.20);return {'chest':1-t,'head':t}

def dog_weights(p):
 z=p.z
 if z<.40:return Animal.weight_body(current,p)
 t=smooth((z-.40)/.15);return {'chest':1-t,'head':t}

def banana(c):
 # A single smooth closed banana peel, with the modest lateral bend of the meme.
 suit=c.ellipsoid('closed_yellow_banana_suit',V(0,.87,-.015),(.258,.212,.674),'banana',banana_weights,n=42,m=36,pear=-.12)
 for v in suit.data.vertices:
  t=max(0,(v.co.z-.90)/.65);v.co.x-=.09*t*t
 # Longitudinal peel lines wrap the silhouette instead of floating off the skin.
 for side in (-1,1):
  points=[]
  for i in range(27):
   z=.25+i*1.20/26;nz=(z-.87)/.674;r=math.sqrt(max(.001,1-nz*nz))*(1+.12*nz);x=side*.258*r*.72-.09*max(0,(z-.9)/.65)**2;f=-.015+.212*r*.704+.002;points.append(V(x,z,f))
  c.sweep('subtle_banana_longitudinal_seam',points,[.004+(.003 if i<6 else 0) for i in range(27)],'banana_seam',lambda t:banana_weights(points[round(t*26)]),sides=6,depth=.45)
 # Warm scuffed peel tip is a small integrated paint-like patch.
 c.ellipsoid('banana_bottom_brown_tip',V(0,.229,.018),(.106,.14,.047),'banana_spot','hips',n=20,m=12)
 for x,z,f in [(-.09,.32,.103),(.125,.44,.145),(-.178,.66,.123)]:c.ellipsoid('banana_natural_brown_freckle',V(x,z,f),(.016,.005,.028),'banana_seam',banana_weights,n=12,m=8)
 c.curve('banana_brown_top_stem',[V(-.065,1.489,-.012),V(-.085,1.57,-.022),V(-.119,1.67,-.018),V(-.126,1.715,-.013)],.046,'stem','head',depth=.82,sides=12,segments=9)
 c.ellipsoid('banana_stem_cut',V(-.126,1.714,-.013),(.039,.034,.012),'banana_spot','head',n=14,m=10)
 # The cat stays INSIDE the upper face window; no exposed ears or second head.
 c.ellipsoid('cat_face_window_rim',V(-.008,1.116,.171),(.230,.069,.227),'banana_light','head',n=34,m=24,exp=.85)
 c.ellipsoid('inset_sad_cat_face',V(-.008,1.116,.205),(.211,.052,.207),'cat_face','head',n=36,m=26,exp=.88)
 for side in (-1,1):
  x=-.008+side*.083
  c.ellipsoid('cat_soft_grey_eye_mask',V(x,1.147,.248),(.071,.014,.082),'cat_mask','head',n=22,m=16)
  c.ellipsoid('sad_wet_cat_eye',V(x,1.152,.262),(.041,.018,.050),'gloss','head',n=26,m=18)
  c.ellipsoid('eye_catchlight',V(x-.011,1.174,.280),(.012,.003,.012),'white','head',n=12,m=8)
  c.ellipsoid('eye_lower_gleam',V(x+.015,1.127,.279),(.006,.002,.007),'tear_light','head',n=10,m=8)
  c.curve('worried_raised_inner_brow',[V(x-side*.045,1.245,.247),V(x-side*.035,1.253,.248),V(x+side*.026,1.232,.249),V(x+side*.047,1.212,.24)],.010,'cat_mask','head',sides=8,segments=10)
  c.ellipsoid('cat_small_muzzle_cheek',V(-.008+side*.048,1.046,.256),(.061,.022,.040),'white','head',n=20,m=14)
  # Compact turquoise crying arcs keep the recognizable meme readable at club scale.
  c.curve('blue_crying_tear_stream',[V(x+side*.027,1.128,.276),V(side*.256,1.135,.277),V(side*.314,.993,.255),V(side*.311,.919,.252)],.0115,'tear','head',sides=8,segments=18)
  c.ellipsoid('tear_droplet',V(side*.311,.909,.251),(.017,.010,.026),'tear','head',n=14,m=10)
  for k in range(2):c.line('little_cat_whisker',[V(-.008+side*.09,1.047-k*.022,.262),V(-.008+side*.172,1.044-k*.027,.246)],.0035,'cat_mask','head')
 c.ellipsoid('tiny_pink_cat_nose',V(-.008,1.072,.283),(.025,.010,.018),'cat_nose','head',n=16,m=12,exp=.8)
 c.line('cat_philtrum',[V(-.008,1.057,.285),V(-.008,1.032,.285)],.0045,'cat_mask','head')
 c.curve('small_downturned_cat_mouth',[V(-.046,1.002,.272),V(-.024,1.032,.283),V(.012,1.032,.283),V(.035,1.002,.272)],.0045,'cat_mask','head',sides=8,segments=14)
 for side in ['L','R']:
  c.limb(side,True,'cat_fur',[.057,.051,.043],(.052,.052,.057))
  c.limb(side,False,'cat_fur',[.066,.058,.048],(.070,.099,.058))
 # Minimal tabby marks give the inset face the original kitty identity.
 for x in [-.048,-.008,.032]:c.line('soft_tabby_forehead',[V(x,1.298,.229),V(x,1.274,.246)],.008,'cat_mask','head')

def prop_prism(c,name,outline,front,depth,color,bone,bevel=.012):
 # Rounded chamfered solid outline in the X/Z plane, all rigidly hand weighted.
 center=Vector((sum(x for x,z in outline)/len(outline),sum(z for x,z in outline)/len(outline)))
 verts=[];n=len(outline)
 for offset,inset in [(front,bevel),(front-bevel,0),(front-depth+bevel,0),(front-depth,bevel)]:
  for x,z in outline:
   vec=Vector((x,z));delta=(vec-center).normalized()*inset;vec-=delta;verts.append(V(vec.x,vec.y,offset))
 faces=[]
 for row in range(3):
  for i in range(n):faces.append((row*n+i,row*n+(i+1)%n,(row+1)*n+(i+1)%n,(row+1)*n+i))
 faces += [tuple(range(n-1,-1,-1)),tuple(range(3*n,4*n))]
 ob=c.mesh(name,verts,faces,color,[{bone:1} for _ in verts])
 for poly in ob.data.polygons:poly.use_smooth=False
 return ob

def dog(c):
 # One wide low spherical head/body is the defining Cheems Frog silhouette.
 c.ellipsoid('drog_single_squat_round_body',V(0,.53,-.016),(.445,.342,.421),'dog_gold',dog_weights,n=44,m=32,pear=.075)
 # Lower ivory face blends into the belly, conforming to the same rounded surface.
 original=c.weight_body;c.weight_body=dog_weights
 c.belly_patch('cream_lower_face_and_belly',.408,.362,.268,'dog_cream',(0,.53,-.016),(.445,.342,.421),pear=.075)
 c.weight_body=original
 for side,s in [('L',1),('R',-1)]:
  c.limb(side,True,'dog_gold',[.078,.072,.065],(.070,.069,.082))
  c.limb(side,False,'dog_gold',[.122,.085,.053],(.098,.100,.045))
  c.ellipsoid('splayed_frog_dog_haunch',V(s*.349,.221,-.068),(.155,.157,.125),'dog_gold','thigh_'+side,n=24,m=16)
  for k in range(3):
   x=s*(.347+k*.065)
   c.curve('splayed_short_dog_toe',[V(s*.42,.069,.17),V(x,.047,.236),V(x+s*.017,.045,.285),V(x+s*.018,.045,.295)],.025,'dog_gold','foot_'+side,sides=8,segments=6,taper=True)
  # Tiny folded ears blend into the round head, rather than pointed dog ears.
  c.ellipsoid('barely_visible_folded_ear',V(s*.305,.755,-.100),(.044,.065,.062),'dog_top','head',n=20,m=14)
  c.ellipsoid('cream_eye_brow_patch',V(s*.159,.700,.276),(.089,.022,.055),'dog_gold','head',n=26,m=18)
  # Warm squinted eyes with a slanted smile, closer to Cheems than generic puppy.
  c.ellipsoid('squinting_black_cheems_eye',V(s*.156,.705,.307),(.061,.016,.027),'gloss','head',n=24,m=14)
  c.ellipsoid('subtle_cheems_eye_glint',V(s*.143,.711,.324),(.008,.003,.007),'white','head',n=10,m=8)
  c.line('cheems_squinted_upper_lid',[V(s*.097,.711,.312),V(s*.149,.731,.315),V(s*.214,.701,.303)],.009,'dog_lid','head')
  c.curve('cheems_raised_brow',[V(s*.093,.783,.272),V(s*.132,.793,.280),V(s*.194,.778,.271),V(s*.223,.754,.256)],.012,'dog_lid','head',sides=8,segments=8)
  c.ellipsoid('soft_cream_cheek',V(s*.112,.498,.316),(.15,.056,.112),'dog_cream','head',n=28,m=20)
  c.ellipsoid('dog_small_cheek_shade',V(s*.313,.514,.232),(.070,.017,.087),'dog_gold','head',n=18,m=14)
 c.ellipsoid('cheems_forward_muzzle',V(-.026,.539,.348),(.155,.095,.092),'dog_cream','head',n=30,m=20)
 c.ellipsoid('prominent_black_cheems_nose',V(-.055,.573,.427),(.078,.041,.055),'gloss','head',n=26,m=18,exp=.78)
 for x in [-.088,-.026]:c.ellipsoid('nose_nostril',V(x,.566,.463),(.011,.004,.008),'dog_nose','head',n=10,m=8)
 c.curve('cheems_lopsided_grin',[V(-.152,.462,.370),V(-.053,.419,.368),V(.13,.442,.382),V(.196,.505,.353)],.012,'dog_nose','head',sides=8,segments=16)
 c.ellipsoid('grin_corner',V(.186,.505,.360),(.029,.014,.022),'dog_nose','head',n=14,m=10)
 # Knife in character-right (viewer-left), visibly a wide chef's knife.
 hx=-.603
 prop_prism(c,'black_knife_handle',[(hx-.027,.407),(hx+.030,.414),(hx+.032,.657),(hx-.024,.661)],.132,.064,'handle','hand_R',.008)
 for z in [.445,.611]:c.ellipsoid('knife_handle_rivet',V(hx+.001,z,.139),(.009,.004,.009),'rivet','hand_R',n=12,m=8)
 blade=[(hx-.090,.641),(hx+.047,.668),(hx+.020,.975),(hx-.080,1.318),(hx-.106,1.237),(hx-.139,1.020)]
 prop_prism(c,'broad_pointed_chef_knife_blade',blade,.136,.030,'steel','hand_R',.007)
 # A narrow honed edge catches light along the curved left cutting side.
 prop_prism(c,'bright_honed_knife_edge',[(hx-.090,.641),(hx-.139,1.020),(hx-.106,1.237),(hx-.080,1.318),(hx-.084,1.231),(hx-.109,1.024),(hx-.069,.646)],.140,.010,'steel_edge','hand_R',.001)
 # Three curled fingers physically wrap the visible black handle.
 for z in [.485,.528,.568]:c.ellipsoid('curled_knife_grip_finger',V(-.602,z,.176),(.052,.032,.023),'dog_gold','hand_R',n=16,m=10)
 # Pointed dark medieval shield, generous face, bronze rim and raised boss.
 sx=.633;outline=[(sx,.935),(sx+.097,.871),(sx+.200,.837),(sx+.183,.489),(sx+.126,.319),(sx,.203),(sx-.126,.319),(sx-.183,.489),(sx-.200,.837),(sx-.097,.871)]
 prop_prism(c,'antique_bronze_shield_rim',outline,.238,.075,'shield_rim','hand_L',.016)
 inner=[(sx+(x-sx)*.86,.573+(z-.573)*.88) for x,z in outline]
 prop_prism(c,'dark_pointed_shield_face',inner,.256,.034,'shield','hand_L',.012)
 c.line('shield_vertical_ridge',[V(sx,.862,.266),V(sx,.289,.266)],.010,'shield_rim','hand_L')
 c.line('shield_cross_ridge',[V(sx-.158,.599,.263),V(sx+.158,.599,.263)],.010,'shield_rim','hand_L')
 c.ellipsoid('shield_central_boss',V(sx,.599,.266),(.073,.027,.092),'shield_boss','hand_L',n=24,m=18)
 for x,z in [(sx,.898),(sx-.168,.814),(sx+.168,.814),(sx-.132,.382),(sx+.132,.382),(sx,.242)]:c.ellipsoid('shield_rim_rivet',V(x,z,.251),(.010,.005,.010),'rivet','hand_L',n=12,m=8)
 for points in [[(sx-.12,.731),(sx-.035,.685)],[(sx+.089,.455),(sx+.047,.403)],[(sx+.13,.76),(sx+.109,.712)]]:c.line('shield_subtle_battle_scuff',[V(x,z,.280) for x,z in points],.003,'shield_inner','hand_L')

class MemeAnimal(Animal):
 def ellipsoid(self,name,center,scale,color,bone='head',n=28,m=18,exp=1,pear=0):
  if name.startswith('joint_round_'):n=12;m=8
  elif self.kind=='sword-shield-dog' and name not in ['drog_single_squat_round_body','prominent_black_cheems_nose']:
   n=max(10,round(n*.82));m=max(8,round(m*.82))
  elif self.kind=='banana-cat' and name.startswith('paw_'):n=18;m=12
  return super().ellipsoid(name,center,scale,color,bone,n,m,exp,pear)

def export_meme(c):
 # Original export contract with per-model metadata; no existing asset is written.
 data=bpy.data.armatures.new(c.kind+'_skeleton');arm=bpy.data.objects.new(c.kind+'_rig',data);bpy.context.collection.objects.link(arm)
 for key,value in {'speciesRig':'animal-v2','bodyPlan':c.spec['bodyPlan'],'revision':'meme-cast-v1','memeIdentity':c.kind}.items():arm[key]=value
 bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 for name,co in c.joints.items():bone=data.edit_bones.new(name);bone.head=co;bone.tail=co+Vector((0,0,.10));bone.roll=0
 for name,parent in c.parents.items():data.edit_bones[name].parent=data.edit_bones[parent]
 bpy.ops.object.mode_set(mode='OBJECT')
 for ob in c.parts:ob.parent=arm;mod=ob.modifiers.new('Meme soft articulation','ARMATURE');mod.object=arm
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(c.kind+'.blend')))
 groups={}
 for name,rough in [('vinyl',.52),('gloss',.22)]:
  m=bpy.data.materials.new('Meme_'+name);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Roughness'].default_value=rough;bs.inputs['Specular IOR Level'].default_value=.28;vc=m.node_tree.nodes.new('ShaderNodeVertexColor');vc.layer_name='avatar_color';m.node_tree.links.new(vc.outputs['Color'],bs.inputs['Base Color']);groups[name]=m
 for ob in c.parts:
  attr=ob.data.color_attributes.new(name='avatar_color',type='FLOAT_COLOR',domain='CORNER');old=list(ob.data.materials)
  for poly in ob.data.polygons:
   for loop in poly.loop_indices:attr.data[loop].color=old[poly.material_index].diffuse_color
  ob.data.materials.clear();ob.data.materials.append(groups[ob.get('surface_group','vinyl')]);bm=bmesh.new();bm.from_mesh(ob.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free()
 bpy.ops.object.select_all(action='DESELECT')
 for ob in c.parts:ob.select_set(True)
 bpy.context.view_layer.objects.active=c.parts[0];bpy.ops.object.join();skin=bpy.context.object;skin.name=c.kind+'_skin';skin['memeIdentity']=c.kind
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);skin.select_set(True);bpy.context.view_layer.objects.active=arm
 path=OUT/(c.kind+'.glb');bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_animations=False,export_skins=True,export_all_influences=False,export_yup=True,export_apply=False,export_extras=True)
 triangles=sum(len(poly.vertices)-2 for poly in skin.data.polygons);verts=[v.co for v in skin.data.vertices];bounds=[[min(v[i] for v in verts),max(v[i] for v in verts)] for i in range(3)]
 result={'kind':c.kind,'triangles':triangles,'bytes':path.stat().st_size,'materialGroups':len(skin.data.materials),'revision':'meme-cast-v1','bodyPlan':c.spec['bodyPlan'],'bones':len(c.joints),'authoredBoundsBlender':bounds,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'generator':'scripts/avatars/meme-cast/generate_memes.py','provenance':'Original procedural vinyl sculpture based on verified Banana Cat / Cheems Frog meme reference direction; no third-party model or texture.'}
 print('MEME_READY',json.dumps(result),flush=True);return result
results=[]
for kind,build in [('banana-cat',banana),('sword-shield-dog',dog)]:
 if args.only and args.only!=kind:continue
 clear();current=MemeAnimal(kind);build(current);results.append(export_meme(current))
(OUT/'revision-manifest.json').write_text(json.dumps({'avatars':results},indent=2)+'\n')
(OUT/'rig-spec.json').write_text(json.dumps({'coordinateConvention':'x, height, forward; canonical18 +Z bone tails','species':SPEC},indent=2)+'\n')

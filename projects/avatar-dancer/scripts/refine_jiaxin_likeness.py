"""Bounded local Jiaxin likeness correction; retains native body topology and skin."""
import bpy,sys,argparse,math,json,collections
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--output',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.output).resolve();assert 'public' not in out.parts;out.parent.mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.import_scene.gltf(filepath=str(Path(a.input).resolve()));body=max((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:len(o.data.vertices));arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE');arm.data.pose_position='REST';bpy.context.view_layer.update();original=[v.co.copy()for v in body.data.vertices]
def smooth(lo,hi,x):
 t=max(0,min(1,(x-lo)/(hi-lo)));return t*t*(3-2*t)
for v in body.data.vertices:
 x,y,z=v.co
 if z<.815:continue
 # Lower cheeks retain ordinary fullness rather than a sharpened avatar jaw.
 face=smooth(.015,.060,x)*math.exp(-((z-.853)/.022)**2)
 v.co.y=y*(1+.035*face)
 # Preserve the native nose; gently broaden nostril/mid-nose area only.
 nose=math.exp(-((z-.880)/.008)**2)*math.exp(-(y/.014)**4)*smooth(.072,.083,x)
 v.co.y+=y*.045*nose
 if .825<z<.8975:
  stretch=smooth(.825,.843,z)*smooth(.005,.05,x);v.co.z=z-(.8975-z)*.09*stretch
 if z>.935:
  t=smooth(.935,.965,z);v.co.z=.935+(z-.935)*(1-.25*t);v.co.x=.025+(x-.025)*(1-.06*t)
 # Round the existing thin wire rim, without replacing eyes or face topology.
 cy=.0235 if y>0 else -.0235;r=math.sqrt(((y-cy)/.0195)**2+((z-.8975)/.0137)**2)
 frame=smooth(.055,.075,x)*smooth(.45,.8,r)*(1-smooth(1.15,1.8,r))*smooth(.003,.012,abs(y))
 if .866<z<.928:
  v.co.z+=((z-.8975)*.08+.0015)*frame;v.co.y+=(cy+(y-cy)*.80-y)*frame
# Weld-aware gentle smoothing only on crown hair, not brow or skin.
keys={i:tuple(round(c,6)for c in co)for i,co in enumerate(original)};groups=collections.defaultdict(list);adj=collections.defaultdict(set)
for i,k in keys.items():groups[k].append(i)
for edge in body.data.edges:
 x,y=[keys[i]for i in edge.vertices]
 if x!=y:adj[x].add(y);adj[y].add(x)
positions={k:sum((body.data.vertices[i].co for i in ids),Vector())/len(ids)for k,ids in groups.items()}
for k,ids in groups.items():
 if k[2]<.944 or not adj[k]:continue
 avg=sum((positions[q]for q in adj[k]),Vector())/len(adj[k]);co=positions[k].lerp(avg,.23*smooth(.944,.97,k[2]))
 for i in ids:body.data.vertices[i].co=co
body.data.update();changed=[(v.co-original[i]).length for i,v in enumerate(body.data.vertices)];assert all(changed[i]==0 for i,p in enumerate(original)if p.z<.815),'Neck/body unexpectedly changed'
arm.data.pose_position='POSE';bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_skins=True)
report={'source':a.input,'vertex_count':len(original),'changed_vertices':sum(x>1e-8 for x in changed),'max_delta':max(changed),'native_neck_below_z_815_unchanged':True,'faces_removed':0,'weights_unchanged':True,'height_before':max(p.z for p in original),'height_after':max(v.co.z for v in body.data.vertices),'bones':len(arm.data.bones),'clips':len(bpy.data.actions),'note':'Reference-directed bounded geometry trial, not an identity guarantee.'};out.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

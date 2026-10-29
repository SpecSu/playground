"""Compare Three.js JSON samples with Blender evaluated skins.
blender -b --factory-startup --python-exit-code 1 --python scripts/audit_runtime_skin_blender.py -- THREE.json REPORT.json
No source assets are changed. Hash verification prevents mixing moving candidates.
"""
import bpy,json,sys,math,hashlib,re
from pathlib import Path
from mathutils import Vector,kdtree
args=sys.argv[sys.argv.index('--')+1:];p=args[0];d=json.load(open(p));assert hashlib.sha256(Path(d['source']).read_bytes()).hexdigest()==d['sourceSha256'],'Source changed since Three.js sampling';bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.import_scene.gltf(filepath=d['source']);scene=bpy.context.scene
arms=[o for o in scene.objects if o.type=='ARMATURE'];meshes=[o for o in scene.objects if o.type=='MESH'];arm=arms[0]
for a in arms:
 a.data.pose_position='REST'
 for t in a.animation_data.nla_tracks:t.mute=True
bpy.context.view_layer.update()
# Both engines use same raw GLB scene. Blender coordinate conversion: (X,Y,Z) -> (X,Z,-Y).
def gltf(v):return Vector((v.x,v.z,-v.y))
lookup=[]
for o in meshes:
 ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get())
 for v in ev.data.vertices:lookup.append((o,v.index,gltf(ev.matrix_world@v.co)))
k=kdtree.KDTree(len(lookup))
for i,(_,_,v) in enumerate(lookup):k.insert(v,i)
k.balance();mapping=[]
for p in d['points']:
 co,i,dist=k.find(Vector(p['rest']))
 # Coincident material/UV/cap vertices may intentionally have distinct skinning.
 # Match named skin influences too; position-only matching can select the wrong one.
 def weight_error(index):
  ob,vi,_=lookup[index];weights={re.sub('[^a-zA-Z0-9]','',ob.vertex_groups[g.group].name):g.weight for g in ob.data.vertices[vi].groups if g.weight>0};wanted=p.get('influences',{})
  return sum(abs(weights.get(name,0)-wanted.get(name,0)) for name in set(weights)|set(wanted))
 options=k.find_range(Vector(p['rest']),max(1e-5,dist+1e-6))
 co,i,dist=min(options,key=lambda c:(weight_error(c[1]),c[2]));mapping.append((lookup[i][0],lookup[i][1]));p['restMatchError']=dist;p['weightMatchError']=weight_error(i)
arm.data.pose_position='POSE';results=[]
for clip in d['clips']:
 action=next(a for a in bpy.data.actions if a.name==clip['name'] or a.name.startswith(clip['name']+'_'));arm.animation_data.action=action
 for sample in clip['samples']:
  frame=sample['seconds']*scene.render.fps;scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();evs={o:o.evaluated_get(dg) for o in meshes};errors=[]
  for (o,i),point in zip(mapping,sample['points']):
   ev=evs[o];v=gltf(ev.matrix_world@ev.data.vertices[i].co);errors.append((v-Vector(point)).length)
  results.append({'clip':clip['name'],'seconds':sample['seconds'],'max':max(errors),'mean':sum(errors)/len(errors),'headMax':max((e for e,p in zip(errors,d['points']) if p.get('role')=='head'),default=0),'bodyMax':max((e for e,p in zip(errors,d['points']) if p.get('role')!='head'),default=0)})
out={'source':d['source'],'sourceSha256':d['sourceSha256'],'note':'CPU cross-engine skinning samples only; not rendered browser QA.','weightMatchMax':max(p['weightMatchError'] for p in d['points']),'restMatchMax':max(p['restMatchError'] for p in d['points']),'samples':results,'fps':scene.render.fps,'points':len(mapping),'sampledSourceNodes':sorted({n for p in d['points'] for n in p.get('sourceNodes',[])})};out['passed']=out['weightMatchMax']<1e-4 and out['restMatchMax']<1e-4 and max(s['max'] for s in results)<5e-4;json.dump(out,open(args[1],'w'),indent=2);print('AUDIT',json.dumps(out))

assert out['restMatchMax']<1e-4,'Rest-pose correspondence failed'
assert max(s['max'] for s in results)<5e-4,'Macroscopic cross-engine skin mismatch'
assert out['weightMatchMax']<1e-4,'Named skin influence correspondence failed'

"""Structural + authored animation seam regression checks; no WebGL claim."""
import json, math, struct, hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent
path=HERE.parent.parent/'public/models/farm/cow-animated.glb'
data=path.read_bytes();magic,version,total=struct.unpack_from('<4sII',data)
assert magic==b'glTF' and version==2 and total==len(data)
json_length=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+json_length]);binary=data[28+json_length:]
components={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
counts={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def values(index):
 a=g['accessors'][index];v=g['bufferViews'][a['bufferView']];fmt,size=components[a['componentType']];n=counts[a['type']];stride=v.get('byteStride',n*size);offset=v.get('byteOffset',0)+a.get('byteOffset',0)
 result=[struct.unpack_from('<'+fmt*n,binary,offset+i*stride) for i in range(a['count'])]
 if a.get('normalized'):
  maximum={5120:127,5121:255,5122:32767,5123:65535}[a['componentType']];result=[tuple(max(-1,x/maximum) for x in row) for row in result]
 return result
names={n.get('name'):i for i,n in enumerate(g['nodes'])}
assert len(g['skins'])==1 and len(g['skins'][0]['joints'])==26
for anchor in ['feeding-mouth','animal-support','animal-head','animal-ground','cow_head','cow_neck_01','cow_neck_02']:assert anchor in names
mesh_nodes=[n for n in g['nodes'] if 'mesh'in n];assert all('skin'in n for n in mesh_nodes)
weight_error=0;vertices=0
for node in mesh_nodes:
 skin=g['skins'][node['skin']]
 for p in g['meshes'][node['mesh']]['primitives']:
  a=p['attributes'];assert all(k in a for k in ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'])
  w=values(a['WEIGHTS_0']);j=values(a['JOINTS_0']);vertices+=len(w)
  for ws,js in zip(w,j):
   weight_error=max(weight_error,abs(sum(ws)-1));assert abs(sum(ws)-1)<.0001;assert all(0<=i<len(skin['joints']) for i in js)
clips={a['name']:a for a in g['animations']};assert set(clips)=={'idle','walk','drink_enter','drink_loop','drink_exit'}
def state(clip,at_end=False):
 result={}
 for channel in clips[clip]['channels']:
  sampler=clips[clip]['samplers'][channel['sampler']];data=values(sampler['output']);result[(channel['target']['node'],channel['target']['path'])]=data[-1 if at_end else 0]
 return result
def difference(a,b):
 err=0
 for key,x in a.items():
  y=b[key];e=math.sqrt(sum((u-v)**2 for u,v in zip(x,y)))
  if key[1]=='rotation':e=min(e,math.sqrt(sum((u+v)**2 for u,v in zip(x,y))))
  err=max(err,e)
 return err
seams={}
for clip in ['idle','walk','drink_loop']:
 seams[clip+'_loop']=difference(state(clip),state(clip,True));assert seams[clip+'_loop']<.0001,(clip,seams)
for a,b in [('idle','drink_enter'),('drink_enter','drink_loop'),('drink_loop','drink_exit'),('drink_exit','idle')]:
 seams[a+'->'+b]=difference(state(a,True),state(b));assert seams[a+'->'+b]<.0001,(a,b,seams)
durations={}
for name,a in clips.items():
 times=[t[0] for s in a['samplers'] for t in values(s['input'])];assert min(times)==0;durations[name]=max(times)
report={'sha256':hashlib.sha256(data).hexdigest(),'size_bytes':len(data),'skins':len(g['skins']),'joints':len(g['skins'][0]['joints']),'visible_mesh_nodes':len(mesh_nodes),'all_meshes_skinned':True,'skinned_vertices':vertices,'max_weight_sum_error':weight_error,'clip_durations_seconds':durations,'max_animation_seam_errors':seams,'scope':'Binary GLB structure, skin normalization and authored pose seams only. Runtime geometry and rendering need separate checks.'}
(HERE/'validation-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))

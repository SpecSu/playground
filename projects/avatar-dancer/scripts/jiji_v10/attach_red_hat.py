"""Attach only reviewed red bonnet primitives0–2; never old face/neck/scalp."""
import sys,copy,json,hashlib
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from restyle_jiji_headwear import Editor
from optimize_glb import read_glb
from test_neck_attachment import array

def attach(native,hat,dest):
 ed=Editor(native);d=ed.d;s,b,_=read_glb(hat);original=copy.deepcopy(d['meshes']);ed.b.extend(b'\0'*(-len(ed.b)%4));offset=len(ed.b);ed.b.extend(b)
 vm=len(d['bufferViews'])
 for v in s['bufferViews']:
  v=copy.deepcopy(v);v['byteOffset']=v.get('byteOffset',0)+offset;v['buffer']=0;d['bufferViews'].append(v)
 im=len(d.get('images',[]));sm=len(d.get('samplers',[]));tm=len(d.get('textures',[]));mm=len(d['materials'])
 for v in s.get('images',[]):
  v=copy.deepcopy(v);v['bufferView']+=vm;d.setdefault('images',[]).append(v)
 d.setdefault('samplers',[]).extend(copy.deepcopy(s.get('samplers',[])))
 for t in s.get('textures',[]):
  t=copy.deepcopy(t);t['source']+=im
  if 'sampler'in t:t['sampler']+=sm
  d.setdefault('textures',[]).append(t)
 def remap_material(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if k.endswith('Texture') and isinstance(x,dict) and 'index'in x:x['index']+=tm
    else:remap_material(x)
  elif isinstance(v,list):
   for x in v:remap_material(x)
 for m in s['materials']:
  m=copy.deepcopy(m);remap_material(m);d['materials'].append(m)
 stats=[]
 for pi,p in enumerate(s['meshes'][0]['primitives'][:3]):
  ids=np.array(array(s,b,p['indices'])).ravel();used=np.unique(ids);mapping=np.zeros(int(ids.max())+1,dtype=int);mapping[used]=np.arange(len(used));attrs={}
  for k,ai in p['attributes'].items():
   a=s['accessors'][ai];values=np.array(array(s,b,ai))[used]
   if k=='POSITION':values=values+np.array([-.020,0,0])
   attrs[k]=ed.add(values,a['type'],a['componentType'])
  # Native and source joint6 are both Head; no old donor nodes/skins are copied.
  j=np.array(array(d,ed.b,attrs['JOINTS_0']));w=np.array(array(d,ed.b,attrs['WEIGHTS_0']));assert set(j[w>1e-6])=={6}
  q={'attributes':attrs,'indices':ed.add(mapping[ids],'SCALAR',5125),'material':p['material']+mm,'extras':{'nativeRedBonnetOnly':True,'sourcePrimitive':pi}}
  d['meshes'][0]['primitives'].append(q);pos=np.array(array(d,ed.b,attrs['POSITION']));stats.append({'sourcePrimitive':pi,'triangles':len(ids)//3,'referencedMin':pos.min(0).tolist(),'referencedMax':pos.max(0).tolist()})
 assert d['meshes'][0]['primitives'][:len(original[0]['primitives'])]==original[0]['primitives']
 d.setdefault('extras',{})['nativeRedBonnet']={'source':str(hat),'sourceSHA256':hashlib.sha256(Path(hat).read_bytes()).hexdigest(),'onlyPrimitives':[0,1,2],'fit':'rigid translation X -0.020; original hat shape/material exact; review pending','oldDonorFaceNeckScalpExcluded':True,'geometry':stats};ed.save(dest);print(json.dumps(d['extras']['nativeRedBonnet']))
if __name__=='__main__':attach(*sys.argv[1:])

"""Regression: exported head must not retain a macroscopic open crop rim."""
import sys,struct,json,collections
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from optimize_glb import read_glb

def array(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];f={5126:'f',5125:'I',5123:'H',5121:'B'}[a['componentType']];s=struct.calcsize(f)*n;off=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+f*n,b,off+k*v.get('byteStride',s)) for k in range(a['count'])]

def open_edges(d,b,mesh):
 edges=collections.Counter();coords={}
 for p in mesh['primitives']:
  ps=array(d,b,p['attributes']['POSITION']);ids=[x[0] for x in array(d,b,p['indices'])];keys=[tuple(round(x,6) for x in p) for p in ps]
  for i in range(0,len(ids),3):
   tri=[keys[x] for x in ids[i:i+3]]
   for a,c in zip(tri,tri[1:]+tri[:1]):
    if a!=c:edges[tuple(sorted((a,c)))]+=1
 return [e for e,n in edges.items() if n==1]

def check(path):
 d,b,_=read_glb(path);headnode=next(n for n in d['nodes'] if 'mesh' in n and ('DONOR_HEAD' in n.get('name','') or 'CANONICAL' in n.get('name','')));head=d['meshes'][headnode['mesh']];es=open_edges(d,b,head);adj=collections.defaultdict(set)
 for a,c in es:adj[a].add(c);adj[c].add(a)
 groups=[]
 while adj:
  todo=[next(iter(adj))];vs=set()
  while todo:
   v=todo.pop()
   if v in vs:continue
   vs.add(v);todo.extend(adj.pop(v,[]))
  groups.append(vs)
 large=[g for g in groups if len(g)>10]
 assert not large,f'{Path(path).name}: open cropped head boundary: {[len(g) for g in large]}'
 assert len(d['animations'])==3
 meta=d.get('extras',{}).get('neckAttachment');assert meta,'Missing attachment provenance'
 patch=head['primitives'][1];pa=patch['attributes'];positions=array(d,b,pa['POSITION']);weights=array(d,b,pa['WEIGHTS_0']);joints=array(d,b,pa['JOINTS_0']);skin=d['skins'][0]
 assert all(abs(sum(w)-1)<2e-6 for w in weights),'Non-normalized new skin weights'
 assert all(0<=j<len(skin['joints']) for row in joints for j in row),'Invalid skin joint index'
 assert min(p[1] for p in positions)<=meta['baseY']+1e-6,'Attachment does not reach torso'
 base= head['primitives'][0]['attributes'];original_positions=array(d,b,base['POSITION']);original_weights=array(d,b,base['WEIGHTS_0']);original_joints=array(d,b,base['JOINTS_0']);lookup={tuple(round(x,6) for x in p):i for i,p in enumerate(original_positions)}
 matches=0
 for p,w,j in zip(positions,weights,joints):
  key=tuple(round(x,6) for x in p)
  if key not in lookup:continue
  i=lookup[key];got={k:v for k,v in zip(j,w) if v>1e-7};expected={k:v for k,v in zip(original_joints[i],original_weights[i]) if v>1e-7}
  assert all(abs(got.get(k,0)-v)<2e-6 for k,v in expected.items()),'Head/bridge edge skin mismatch'
  matches+=1
 assert matches>=meta['boundaryVertices'],'Not every crop-rim vertex is sewn with matching skin weights'
 return {'asset':Path(path).name,'large_open_head_loops':0,'animations':3}
if __name__=='__main__':
 for p in sys.argv[1:]:print(json.dumps(check(p)))

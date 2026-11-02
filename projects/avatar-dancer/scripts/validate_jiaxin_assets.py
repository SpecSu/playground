"""Read-only validation of the native whole-body third avatar (not a head transplant)."""
import sys,json,collections,math,hashlib
from pathlib import Path
from optimize_glb import read_glb,validate,metrics
from test_neck_attachment import array,open_edges
REQUIRED=['Hips','Head','LeftHand','RightHand','LeftShoulder','RightShoulder','LeftFoot','RightFoot']
def check(path):
 d,b,raw=read_glb(path);validate(d,b)
 assert len(d.get('animations',[]))==3,'Three dance clips required'
 names=[n.get('name','') for n in d['nodes']]
 assert all('skin' in n for n in d['nodes'] if 'mesh' in n),'Unskinned helper mesh leaked into asset'
 assert all(any(n.endswith(x) for n in names) for x in REQUIRED)
 assert all('uri' not in x for x in d.get('images',[])), 'External source images forbidden'
 triangles=0;vertices=0;native=None
 for mesh in d['meshes']:
  count=0
  for p in mesh['primitives']:
   a=p['attributes'];ps=array(d,b,a['POSITION']);ws=array(d,b,a['WEIGHTS_0']);js=array(d,b,a['JOINTS_0']);count+=len(ps);vertices+=len(ps)
   assert all(all(math.isfinite(x) for x in row) for row in ps)
   assert all(abs(sum(w)-1)<2e-5 for w in ws),'Weights must normalize'
   assert all(0<=j<len(d['skins'][0]['joints']) for row in js for j in row)
   triangles+=len(array(d,b,p['indices']))//3
  if count>20000:native=mesh
 assert native,'Native body must be retained'
 signature=[]
 for p in native['primitives']:
  a=p['attributes']
  for pos,w,j in zip(array(d,b,a['POSITION']),array(d,b,a['WEIGHTS_0']),array(d,b,a['JOINTS_0'])):
   signature.append((tuple(round(x,6) for x in pos),tuple(sorted((d['nodes'][d['skins'][0]['joints'][ji]].get('name'),round(wi,6)) for ji,wi in zip(j,w) if wi>1e-6))))
 body_hash=hashlib.sha256(repr(sorted(set(signature))).encode()).hexdigest()
 es=open_edges(d,b,native);adj=collections.defaultdict(set)
 for a,c in es:adj[a].add(c);adj[c].add(a)
 groups=[]
 while adj:
  todo=[next(iter(adj))];vs=set()
  while todo:
   v=todo.pop()
   if v in vs:continue
   vs.add(v);todo.extend(adj.pop(v,[]))
  if len(vs)>4:groups.append(vs)
 # glTF Y is body height; a cropped head at neck would expose a large ring here.
 neck=[g for g in groups if any(.73<p[1]<.86 for p in g)]
 assert not neck,'Open neck boundary found'
 assert triangles<55000,'Unexpected geometry expansion'
 return {'asset':str(path),'sha256':hashlib.sha256(raw).hexdigest(),'native_body_skin_signature':body_hash,'triangles':triangles,'vertices':vertices,'clips':[a.get('name') for a in d['animations']],'bones':len(d['skins'][0]['joints']),'native_open_edges':len(es),'large_open_neck_loops':len(neck),'metrics':metrics(d,b,len(raw)),'limitation':'Likeness is subjective and is not certified by this structural audit.'}
if __name__=='__main__':
 for arg in sys.argv[1:]:print(json.dumps(check(arg),ensure_ascii=False))

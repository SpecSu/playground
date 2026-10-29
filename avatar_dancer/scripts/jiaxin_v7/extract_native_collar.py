import os
import sys,io,json,collections,numpy as np
from pathlib import Path
from scipy.spatial import cKDTree
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parent.parent/'dance-stage/scripts'))
from restyle_jiji_headwear import Editor
from test_neck_attachment import array,open_edges
src=Path(__file__).resolve().parent.parent/'jiaxin-body-v6/candidate-v4.glb';out=Path(__file__).resolve().parent
ed=Editor(src);p=ed.d['meshes'][0]['primitives'][0];data={k:np.array(array(ed.d,ed.b,ai)).tolist()for k,ai in p['attributes'].items()};v=np.array(data['POSITION']);uv=np.array(data['TEXCOORD_0']);ids=np.array(array(ed.d,ed.b,p['indices'])).reshape(-1,3)
mat=ed.d['materials'][p['material']];im=ed.d['images'][ed.d['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']];bv=ed.d['bufferViews'][im['bufferView']];pic=np.asarray(Image.open(io.BytesIO(ed.b[bv['byteOffset']:bv['byteOffset']+bv['byteLength']])).convert('RGB'));rgb=pic[(uv[:,1]%1*pic.shape[0]).astype(int),(uv[:,0]%1*pic.shape[1]).astype(int)]
cloth=(rgb.max(1)<90)&(v[:,1]<.85)&(v[:,1]>.76);tree=cKDTree(v[cloth]);margin=.006
vals=np.maximum(.795-v[:,1],margin-tree.query(v)[0]).tolist();cache={};keep=[];cutindices=[]
def hit(i,j):
 key=tuple(sorted((int(i),int(j))))
 if key in cache:return cache[key]
 t=vals[i]/(vals[i]-vals[j]);k=len(data['POSITION']);cache[key]=k
 for name,a in data.items():
  if name in ['JOINTS_0','WEIGHTS_0']:continue
  q=(1-t)*np.array(a[i])+t*np.array(a[j]);q=q/max(np.linalg.norm(q),1e-12)if name=='NORMAL'else q;a.append(q.tolist())
 wd=collections.defaultdict(float)
 for vi,factor in [(i,1-t),(j,t)]:
  for bone,w in zip(data['JOINTS_0'][vi],data['WEIGHTS_0'][vi]):wd[bone]+=w*factor
 w=sorted(wd.items(),key=lambda x:-x[1])[:4];total=sum(x[1]for x in w);data['JOINTS_0'].append([x[0]for x in w]+[0]*(4-len(w)));data['WEIGHTS_0'].append([x[1]/total for x in w]+[0]*(4-len(w)));vals.append(0);cutindices.append(k);return k
fullcloth=0
for tri in ids:
 poly=[]
 for i,j in zip(tri,np.roll(tri,-1)):
  if vals[i]>=0:poly.append(int(i))
  if(vals[i]>=0)!=(vals[j]>=0):poly.append(hit(i,j))
 if cloth[tri].all():assert len(poly)==3;fullcloth+=1
 for k in range(1,len(poly)-1):keep.extend([poly[0],poly[k],poly[k+1]])
used=sorted(set(keep));remap={old:new for new,old in enumerate(used)}
for k,a in data.items():
 ac=ed.d['accessors'][p['attributes'][k]];p['attributes'][k]=ed.add([a[i]for i in used],ac['type'],ac['componentType'])
p['indices']=ed.add([remap[i]for i in keep],'SCALAR',5125);ed.d['meshes'][0]['primitives']=[p];ed.save(out/'native-collar-preserved.glb')
edges=open_edges(ed.d,ed.b,{'primitives':[p]});edges=[(a,b)for a,b in edges if min(a[1],b[1])>.795];adj=collections.defaultdict(list)
for a,b in edges:adj[a].append(b);adj[b].append(a)
loops=[]
while adj:
 start=next(iter(adj));cur=start;last=None;loop=[]
 while cur in adj:
  loop.append(cur);ns=adj.pop(cur);nxt=next((x for x in ns if x!=last),start);last,cur=cur,nxt
  if cur==start:break
 loops.append(loop)
report={'source':str(src),'output':str(out/'native-collar-preserved.glb'),'note':'Contract only: open upper skin seam intentionally awaiting new head. All original fully dark collar triangles remain; skin margin6mm above measured original darkshirt. No garment vertex moved. Native head/glasses removed.','sourceDarkClothMaxY':float(v[cloth,1].max()),'margin':margin,'fullyDarkClothTrianglesPreserved':fullcloth,'loops':loops,'loopSizes':[len(l)for l in loops]};json.dump(report,open(out/'collar-boundary.json','w'),indent=2);print({k:val for k,val in report.items()if k!='loops'})

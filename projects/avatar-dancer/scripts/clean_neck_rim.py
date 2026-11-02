"""LX-specific: clip only the ragged lower-neck garment rim to a clean curve.
Uses an angular upper envelope of the observed open rim, plus 0.006 normalized model
units. Retains every original vertex above that lower-neck curve unchanged;
new boundary intersections linearly interpolate UV/normal/skin influences.
"""
import sys,struct,json,collections,math
from pathlib import Path
import numpy as np
from optimize_glb import read_glb,validate,JSON_CHUNK,BIN_CHUNK
from test_neck_attachment import array,open_edges

def clean(source,dest):
 d,b,_=read_glb(source);binary=bytearray(b);p=d['meshes'][0]['primitives'][0];a=p['attributes'];data={k:[list(v) for v in array(d,b,ai)] for k,ai in a.items()};ps=data['POSITION'];oldn=len(ps);tri=[i[0] for i in array(d,b,p['indices'])];skin=d['skins'][0];ji=next(i for i,n in enumerate(skin['joints']) if d['nodes'][n]['name']=='mixamorig:Neck');anchor=np.linalg.inv(np.array(array(d,b,skin['inverseBindMatrices'])[ji]).reshape(4,4).T)[:3,3]
 edges=open_edges(d,b,{'primitives':[p]});adj=collections.defaultdict(set)
 for x,y in edges:adj[x].add(y);adj[y].add(x)
 comps=[]
 while adj:
  st=[next(iter(adj))];vs=set()
  while st:
   v=st.pop()
   if v in vs:continue
   vs.add(v);st.extend(adj.pop(v,[]))
  comps.append(vs)
 rim=np.array(list(max(comps,key=len)));angles=np.arctan2(rim[:,2]-anchor[2],rim[:,0]-anchor[0]);bins=128;grid=np.arange(bins)*2*math.pi/bins-math.pi;heights=[]
 for angle in grid:
  delta=np.abs(np.angle(np.exp(1j*(angles-angle))));near=delta<.12
  heights.append(float(max(rim[near,1]) if near.any() else rim[np.argmin(delta),1]))
 h=np.array(heights);h=np.maximum.reduce([np.roll(h,i) for i in [-2,-1,0,1,2]]);h=sum(np.roll(h,i) for i in [-2,-1,0,1,2])/5+.006
 def value(pos):
  angle=math.atan2(pos[2]-anchor[2],pos[0]-anchor[0]);q=(angle+math.pi)/(2*math.pi)*bins;k=int(q)%bins;cut=h[k]*(1-(q-int(q)))+h[(k+1)%bins]*(q-int(q));return pos[1]-cut
 values=[value(p) for p in ps];cache={}
 def intersection(i,j):
  key=tuple(sorted((i,j)))
  if key in cache:return cache[key]
  t=values[i]/(values[i]-values[j]);idx=len(ps);cache[key]=idx
  for k,arr in data.items():
   if k in ('JOINTS_0','WEIGHTS_0'):continue
   v=(1-t)*np.array(arr[i])+t*np.array(arr[j]);
   if k=='NORMAL':v/=max(1e-8,np.linalg.norm(v))
   arr.append(v.tolist())
  wd=collections.defaultdict(float)
  for v,f in [(i,1-t),(j,t)]:
   for joint,w in zip(data['JOINTS_0'][v],data['WEIGHTS_0'][v]):wd[joint]+=w*f
  w=sorted(wd.items(),key=lambda x:-x[1])[:4];total=sum(v for _,v in w);data['JOINTS_0'].append([j for j,_ in w]+[0]*(4-len(w)));data['WEIGHTS_0'].append([v/total for _,v in w]+[0]*(4-len(w)));values.append(0.);return idx
 kept=[];removed=0
 for k in range(0,len(tri),3):
  src=tri[k:k+3];poly=[]
  for i,j in zip(src,src[1:]+src[:1]):
   vi,vj=values[i],values[j]
   if vi>=0:poly.append(i)
   if (vi>=0)!=(vj>=0):poly.append(intersection(i,j))
  if len(poly)!=3 or poly!=src:removed+=1
  for j in range(1,len(poly)-1):kept.extend([poly[0],poly[j],poly[j+1]])
 def add(v,typ,comp):
  vals=np.asarray(v,dtype={5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[comp]);binary.extend(b'\0'*(-len(binary)%4));off=len(binary);binary.extend(vals.tobytes());iv=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':vals.nbytes});ia=len(d['accessors']);ac={'bufferView':iv,'componentType':comp,'count':len(v),'type':typ}
  if typ=='VEC3':ac.update(min=vals.min(0).tolist(),max=vals.max(0).tolist())
  d['accessors'].append(ac);return ia
 for k,arr in data.items():
  old=d['accessors'][a[k]];a[k]=add(arr,old['type'],old['componentType'])
 p['indices']=add(kept,'SCALAR',5125);d['buffers'][0]['byteLength']=len(binary);d.setdefault('extras',{})['neckRimCleanup']={'curve':'angular upper envelope +0.006','originalVertices':oldn,'newIntersections':len(ps)-oldn,'affectedLowerNeckTriangles':removed,'maxCutHeight':float(max(h)),'faceVerticesAboveCurveUnchanged':True}
 jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary.extend(b'\0'*(-len(binary)%4));payload=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<II',len(jb),JSON_CHUNK)+jb+struct.pack('<II',len(binary),BIN_CHUNK)+binary;dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload);dd,bb,_=read_glb(dest);validate(dd,bb)
 for k,old_index in read_glb(source)[0]['meshes'][0]['primitives'][0]['attributes'].items():
  assert array(dd,bb,dd['meshes'][0]['primitives'][0]['attributes'][k])[:oldn]==array(read_glb(source)[0],b,old_index),'Original face vertex attribute changed: '+k
 original_faces={tuple(tri[i:i+3]) for i in range(0,len(tri),3) if all(values[v]>=0 for v in tri[i:i+3])};new_faces={tuple(kept[i:i+3]) for i in range(0,len(kept),3)};assert original_faces<=new_faces,'Protected upper head face removed'
 assert bb[:len(b)]==b,'Original texture/animation/mesh bytes mutated'
 print(d['extras']['neckRimCleanup'])
if __name__=='__main__':clean(sys.argv[1],sys.argv[2])

import os
import sys,numpy as np,json
sys.path.insert(0,'scripts');from optimize_glb import read_glb;from test_neck_attachment import array
f=sys.argv[1];d,b,_=read_glb(f);p=next(p for m in d['meshes'] for p in m['primitives'] if 'Closed anatomical' in d['materials'][p['material']].get('name',''));v=np.array(array(d,b,p['attributes']['POSITION']));ids=np.array(array(d,b,p['indices'])).ravel().reshape(-1,3);tri=v[ids];a=tri[:,0];e1=tri[:,1]-a;e2=tri[:,2]-a;hits=set()
for i,t in enumerate(tri):
 for k in range(3):
  o=t[k];dire=t[(k+1)%3]-o;h=np.cross(np.broadcast_to(dire,e2.shape),e2);det=(e1*h).sum(1);valid=abs(det)>1e-12;inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=o-a;u=inv*(s*h).sum(1);q=np.cross(s,e1);vv=inv*(q*dire).sum(1);dist=inv*(e2*q).sum(1);ok=valid&(u>1e-6)&(vv>1e-6)&(u+vv<1-1e-6)&(dist>1e-6)&(dist<1-1e-6)
  for j in np.where(ok)[0]:
   if i!=j and not any(np.linalg.norm(x-y)<1e-7 for x in t for y in tri[j]):hits.add(tuple(sorted((i,int(j)))))
print(json.dumps({'nonAdjacentInteriorEdgeCrossings':len(hits),'pairs':sorted(hits)[:25],'limitation':'excludes coplanar/touch-only intersections and adjacent triangles'}))

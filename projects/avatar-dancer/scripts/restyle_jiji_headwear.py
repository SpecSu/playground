#!/usr/bin/env python3
"""Offline, source-preserving Jiji headwear surgery and procedural stage jewelry.
No face regeneration. Coordinates below are reviewed canonical Jiji GLB units.
"""
import argparse,collections,copy,io,json,math,struct,sys
from pathlib import Path
import numpy as np
from optimize_glb import read_glb,validate,JSON_CHUNK,BIN_CHUNK
from test_neck_attachment import array,open_edges,check

class Editor:
 def __init__(self,path):
  self.d,self.original,self.raw=read_glb(path);self.b=bytearray(self.original)
 def add(self,values,typ,comp=5126):
  vals=np.asarray(values,dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[comp]);self.b.extend(b'\0'*(-len(self.b)%4));off=len(self.b);self.b.extend(vals.tobytes());vi=len(self.d['bufferViews']);self.d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':vals.nbytes});ai=len(self.d['accessors']);a={'bufferView':vi,'componentType':comp,'count':len(vals),'type':typ}
  if typ=='VEC3':a.update(min=vals.min(0).tolist(),max=vals.max(0).tolist())
  self.d['accessors'].append(a);return ai
 def material(self,name,color,metal=.0,rough=.5,emissive=None):
  m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough}}
  if emissive:m['emissiveFactor']=emissive
  i=len(self.d['materials']);self.d['materials'].append(m);return i
 def primitive(self,vertices,faces,mat,joint,offset,colors=None,joints=None,weights=None):
  v=np.asarray(vertices,dtype=float)+offset;f=np.asarray(faces,dtype=int).reshape(-1,3);n=np.zeros_like(v)
  for tri in f:
   normal=np.cross(v[tri[1]]-v[tri[0]],v[tri[2]]-v[tri[0]])
   for i in tri:n[i]+=normal
  n/=np.maximum(1e-10,np.linalg.norm(n,axis=1))[:,None]
  attr={'POSITION':self.add(v,'VEC3'),'NORMAL':self.add(n,'VEC3'),'JOINTS_0':self.add(joints if joints is not None else [[joint,0,0,0]]*len(v),'VEC4',5123),'WEIGHTS_0':self.add(weights if weights is not None else [[1,0,0,0]]*len(v),'VEC4')}
  if colors is not None:attr['COLOR_0']=self.add(colors,'VEC4')
  return {'attributes':attr,'indices':self.add(f.ravel(),'SCALAR',5125),'material':mat,'extras':{'headwearGeometry':True}}
 def save(self,path):
  self.d['buffers'][0]['byteLength']=len(self.b);jb=json.dumps(self.d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);self.b.extend(b'\0'*(-len(self.b)%4));out=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(self.b))+struct.pack('<II',len(jb),JSON_CHUNK)+jb+struct.pack('<II',len(self.b),BIN_CHUNK)+self.b;path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(out);d,b,_=read_glb(path);validate(d,b)

def smooth(t):t=np.clip(t,0,1);return t*t*(3-2*t)
def clip_primary(ed,p,offset,mode):
 attrs=p['attributes'];data={k:[list(v) for v in array(ed.d,ed.b,ai)] for k,ai in attrs.items()};ps=data['POSITION'];oldn=len(ps);ids=[v[0] for v in array(ed.d,ed.b,p['indices'])]
 def value(p):
  x,y,z=np.array(p)-offset
  if mode=='red':return max(x+.018,.875-y,y-1.026)
  cut=.910+.038*smooth((x-.035)/.030)-.045*smooth((abs(z-.008)-.035)/.022)-.060*(1-smooth((x+.025)/.04))
  return max(max(cut,.855)-y,.924-y) if x>.055 and abs(z-.008)<.06 else max(cut,.855)-y
 vals=[float(value(v)) for v in ps];cache={}
 def hit(i,j,vi=None,vj=None):
  key=(*sorted((i,j)),round(float(vi),9) if vi is not None else None,round(float(vj),9) if vj is not None else None)
  if key in cache:return cache[key]
  t=vals[i]/(vals[i]-vals[j]) if vi is None else vi/(vi-vj);index=len(ps);cache[key]=index
  for k,arr in data.items():
   if k in ['JOINTS_0','WEIGHTS_0']:continue
   v=(1-t)*np.array(arr[i])+t*np.array(arr[j])
   if k=='NORMAL':v/=max(1e-10,np.linalg.norm(v))
   arr.append(v.tolist())
  wd=collections.defaultdict(float)
  for v,f in [(i,1-t),(j,t)]:
   for joint,w in zip(data['JOINTS_0'][v],data['WEIGHTS_0'][v]):wd[joint]+=w*f
  w=sorted(wd.items(),key=lambda q:-q[1])[:4];total=sum(v for j,v in w);data['JOINTS_0'].append([j for j,v in w]+[0]*(4-len(w)));data['WEIGHTS_0'].append([v/total for j,v in w]+[0]*(4-len(w)));vals.append(0);return index
 kept=[];affected=0
 def clip(poly,fn):
  result=[]
  for i,j in zip(poly,poly[1:]+poly[:1]):
   vi,vj=float(fn(ps[i])),float(fn(ps[j]))
   if vi>=-1e-10:result.append(i)
   if (vi>=-1e-10)!=(vj>=-1e-10):result.append(hit(i,j,vi,vj))
  return result
 for k in range(0,len(ids),3):
  tri=ids[k:k+3]
  polys=[clip(tri,value)]
  if polys!=[tri]:affected+=1
  for poly in polys:
   for jj in range(1,len(poly)-1):kept.extend([poly[0],poly[jj],poly[jj+1]])
 # Save clean referenced arrays; removed hat vertices must not leave ghost bounds.
 used=sorted(set(kept));remap={old:new for new,old in enumerate(used)}
 for k,arr in data.items():
  old=ed.d['accessors'][attrs[k]];attrs[k]=ed.add([arr[i] for i in used],old['type'],old['componentType'])
 p['indices']=ed.add([remap[i] for i in kept],'SCALAR',5125)
 # Identify newly cut rim only; preserve the existing head-neck seam untouched.
 edges=open_edges(ed.d,ed.b,{'primitives':[p]});coords={tuple(round(float(np.float32(x)),6) for x in data['POSITION'][i]):i for i in used};newkeys={tuple(round(float(np.float32(x)),6) for x in data['POSITION'][i]) for i in used if i>=oldn};adj=collections.defaultdict(set)
 for a,b in edges:adj[a].add(b);adj[b].add(a)
 groups=[]
 while adj:
  stack=[next(iter(adj))];vs=set()
  while stack:
   v=stack.pop()
   if v in vs:continue
   vs.add(v);stack.extend(adj.pop(v,[]))
  if len(vs)>8 and len(vs&newkeys)>2:groups.append(vs)
 direction=set()
 for k in range(0,len(kept),3):
  tri=[tuple(round(float(np.float32(x)),6) for x in data['POSITION'][i]) for i in kept[k:k+3]]
  direction.update(zip(tri,tri[1:]+tri[:1]))
 caps=[]
 for vs in groups:
  rim=[(a,b) if (b,a) in direction else (b,a) for a,b in edges if a in vs and b in vs]
  # Partition into ordered simple boundary loops before triangulating; never fan across a concave group.
  while rim:
   a,b=rim.pop();keys=[a,b]
   while keys[-1]!=keys[0]:
    found=next((i for i,(u,v) in enumerate(rim) if u==keys[-1] or v==keys[-1]),None)
    if found is None:raise ValueError('Cut boundary is not a loop')
    u,v=rim.pop(found);keys.append(v if u==keys[-1] else u)
   keys.pop()
   if len(keys)<3:continue
   verts=[(np.array(data['POSITION'][coords[k]],dtype=np.float32)-offset).tolist() for k in keys]
   weights=[data['WEIGHTS_0'][coords[k]] for k in keys];joints=[data['JOINTS_0'][coords[k]] for k in keys]
   # Principal-plane ear clipping handles concavity without creating crossing triangles.
   xyz=np.array(verts);_,_,vh=np.linalg.svd(xyz-xyz.mean(0));uv=(xyz-xyz.mean(0))@vh[:2].T

   def cross(a,b,c):return float((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
   signed=sum(uv[i,0]*uv[(i+1)%len(uv),1]-uv[(i+1)%len(uv),0]*uv[i,1] for i in range(len(uv)));sgn=1 if signed>0 else -1
   left=list(range(len(keys)));faces=[]
   for iteration in range(len(keys)*2):
    if len(left)<=3:break
    found=False
    for ii in range(len(left)):
     a,b,c=left[ii-1],left[ii],left[(ii+1)%len(left)]
     if sgn*cross(uv[a],uv[b],uv[c])<1e-14:continue
     inside=False
     for j in left:
      if j in [a,b,c]:continue
      if min(sgn*cross(uv[a],uv[b],uv[j]),sgn*cross(uv[b],uv[c],uv[j]),sgn*cross(uv[c],uv[a],uv[j]))>1e-13:inside=True;break
     if inside:continue
     faces.append([a,b,c]);left.pop(ii);found=True;break
    if not found:
     # Near-collinear point: retain its boundary via a degenerate triangle.
     ii=min(range(len(left)),key=lambda i:abs(cross(uv[left[i-1]],uv[left[i]],uv[left[(i+1)%len(left)]])))
     faces.append([left[ii-1],left[ii],left[(ii+1)%len(left)]]);left.pop(ii)
   if len(left)==3:faces.append(left)
   caps.append((verts,faces,joints,weights))
 return caps,{'affectedOriginalHatTriangles':affected,'originalVertices':oldn,'retainedVertices':len(used),'newCutLoops':[len(vs) for vs in groups]}

def tube(points,radius,sides=8):
 points=np.asarray(points);v=[];f=[]
 for i,p in enumerate(points):
  t=points[min(i+1,len(points)-1)]-points[max(0,i-1)];t/=np.linalg.norm(t);ref=np.array([1.,0,0]) if abs(t[0])<.9 else np.array([0.,0,1]);u=np.cross(t,ref);u/=np.linalg.norm(u);w=np.cross(t,u)
  for j in range(sides):v.append(p+radius*(math.cos(j*2*math.pi/sides)*u+math.sin(j*2*math.pi/sides)*w))
 for i in range(len(points)-1):
  for j in range(sides):a=i*sides+j;b=i*sides+(j+1)%sides;c=(i+1)*sides+(j+1)%sides;d=(i+1)*sides+j;f.extend([[a,b,c],[a,c,d]])
 f.extend([[0,j+1,j] for j in range(1,sides-1)]);off=(len(points)-1)*sides;f.extend([[off,off+j,off+j+1] for j in range(1,sides-1)]);return v,f

def ellipsoid(center,radii,segments=32,rings=16,phi_max=math.pi,ridges=0,hair_shape=False):
 v=[];f=[];center=np.array(center);rad=np.array(radii)
 for i in range(rings+1):
  ph=max(.0001,min(math.pi-.0001,phi_max*i/rings))
  for j in range(segments):
   th=j*2*math.pi/segments
   if hair_shape:ph=max(.0001,(1.26+1.20*(1-math.cos(th))/2+.35*math.sin(th)**2+.20*math.sin(th)**2*max(0,-math.cos(th)))*i/rings)
   wave=1+ridges*math.sin(th*24+ph*2)*math.sin(ph);xx=math.sin(ph)*math.cos(th)*wave
   if hair_shape and ph>1.6 and math.cos(th)<0:xx=math.sin(1.6)*math.cos(th)*wave
   point=center+rad*np.array([xx,math.cos(ph),math.sin(ph)*math.sin(th)*wave])
   if hair_shape:
    point[0]+=.006*(i/rings)**3*max(math.cos(th),0)**4
    point[1]-=.012*max(0,(i/rings-.65)/.35)**2*math.sin(th)**2*(1-math.cos(th))/2
    point[2]=center[2]+(point[2]-center[2])*(1+.22*max(0,(i/rings-.65)/.35))
   v.append(point)
 for i in range(rings):
  for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;c=(i+1)*segments+(j+1)%segments;d=(i+1)*segments+j;f.extend([[a,b,c],[a,c,d]])
 top=len(v);v.append(center+np.array([0,radii[1],0]));bot=len(v);v.append(np.mean(v[-segments-1:-1],axis=0))
 for j in range(segments):f.append([top,(j+1)%segments,j]);a=rings*segments+j;b=rings*segments+(j+1)%segments;f.append([bot,a,b])
 return v,f

def crystal(center,size):
 cx,cy,cz=center;sx,sy,sz=size;v=[[cx+sx,cy,cz],[cx-sx,cy,cz],[cx,cy+sy,cz],[cx,cy-sy,cz],[cx,cy,cz+sz],[cx,cy,cz-sz]];f=[[0,2,4],[0,4,3],[0,3,5],[0,5,2],[1,4,2],[1,3,4],[1,5,3],[1,2,5]]
 # Flat facets by duplicating each triangle's vertices.
 return [v[i] for tri in f for i in tri],np.arange(24).reshape(-1,3).tolist()

def bounds(d,b):
 pts=[]
 for m in d['meshes']:
  for p in m['primitives']:
   ps=np.asarray(array(d,b,p['attributes']['POSITION']));ids=np.array(array(d,b,p['indices'])).ravel();pts.extend(ps[np.unique(ids)])
 pts=np.array(pts);return {'min':pts.min(0).tolist(),'max':pts.max(0).tolist(),'height':float(np.ptp(pts[:,1]))}

def restyle(source,reference,dest,style):
 assert Path(source).stem.startswith('jiji-'),'This source-specific repair must never alter LX'
 ed=Editor(source);d=ed.d;oldbounds=bounds(d,ed.b);rd,rb,_=read_glb(reference);ps=np.array(array(d,ed.b,d['meshes'][0]['primitives'][0]['attributes']['POSITION']));rps=np.array(array(rd,rb,rd['meshes'][0]['primitives'][0]['attributes']['POSITION']));offset=np.median(ps-rps,axis=0);assert np.max(np.abs((ps-rps)-offset))<1e-6;head=d['meshes'][0];p=head['primitives'][0];skin=d['skins'][0];joint=next(i for i,n in enumerate(skin['joints']) if d['nodes'][n]['name']=='mixamorig:Head');mode='red' if style=='crimson-clean-back' else 'remove';caps,info=clip_primary(ed,p,offset,mode)
 burgundy=ed.material('Crimson velvet / repaired clean hat back',(.065,.006,.010),.0,.76);hair=ed.material('Jiji red hair / reconstructed covered scalp',(.15,.023,.032),.0,.65)
 for v,f,j,w in caps:
  if mode=='red':
   # A watertight internal closure lies wholly inside the replacement bonnet shell.
   # It preserves the donor's lower hair seam while the new smooth shell supplies
   # the actual visible rear surface (never a flat exposed cut).
   boundary=np.array(v);vv=boundary.copy();center=np.array([.018,.965,.008]);ry,rz=.088,.130
   yz=(vv[:,1:]-center[1:])/np.array([ry,rz]);radius=np.linalg.norm(yz,axis=1);factor=np.minimum(1,.91/np.maximum(radius,1e-8));vv[:,1:]=center[1:]+(vv[:,1:]-center[1:])*factor[:,None];vv[:,0]=-.022
   sourcepos=np.array(array(d,ed.b,p['attributes']['POSITION']));keys={tuple(np.round(x+offset,6)):i for i,x in enumerate(boundary)}
   for ii,point in enumerate(sourcepos):
    key=tuple(np.round(point,6))
    if key in keys:sourcepos[ii]=vv[keys[key]]+offset
   p['attributes']['POSITION']=ed.add(sourcepos,'VEC3');v=vv.tolist()
  patch=ed.primitive(v,f,burgundy if mode=='red' else hair,joint,offset,joints=j,weights=w)
  head['primitives'].append(patch)
 if mode=='red':
  pos=np.array(array(d,ed.b,p['attributes']['POSITION']));ids=np.array(array(d,ed.b,p['indices'])).ravel().reshape(-1,3);normal=np.array(array(d,ed.b,p['attributes']['NORMAL']));sums=collections.defaultdict(lambda:np.zeros(3))
  for tri in ids:
   nn=np.cross(pos[tri[1]]-pos[tri[0]],pos[tri[2]]-pos[tri[0]])
   for ii in tri:sums[tuple(np.round(pos[ii],6))]+=nn
  for ii,point in enumerate(pos):
   if point[1]-offset[1]>.875 and point[0]-offset[0]<.075:
    nn=sums[tuple(np.round(point,6))];normal[ii]=nn/max(np.linalg.norm(nn),1e-10)
  p['attributes']['NORMAL']=ed.add(normal,'VEC3')
 if mode=='red':
  from PIL import Image
  uv=np.array(array(d,ed.b,p['attributes']['TEXCOORD_0']));pos=np.array(array(d,ed.b,p['attributes']['POSITION']));ids=np.array(array(d,ed.b,p['indices'])).ravel().reshape(-1,3);centers=pos[ids].mean(1)-offset;tex=d['textures'][d['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];iv=d['bufferViews'][d['images'][tex]['bufferView']];im=np.asarray(Image.open(io.BytesIO(bytes(ed.b[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']]))).convert('RGB'))/255;cu=uv[ids].mean(1);rgb=im[(cu[:,1]*im.shape[0]).astype(int).clip(0,im.shape[0]-1),(cu[:,0]*im.shape[1]).astype(int).clip(0,im.shape[1]-1)];cloth=((centers[:,0]<.025)&(centers[:,1]>.89)&(rgb[:,0]>rgb[:,1]*1.45)&(rgb[:,0]>rgb[:,2]*1.2))|((centers[:,0]<-.025)&(centers[:,1]>.878)&(centers[:,1]<1.026)&(centers[:,2]<.055));panel=copy.deepcopy(p);panel['indices']=ed.add(ids[cloth].ravel(),'SCALAR',5125);panel['material']=burgundy;p['indices']=ed.add(ids[~cloth].ravel(),'SCALAR',5125);head['primitives'].append(panel);info['rearVelvetTrianglesUnified']=int(cloth.sum())
 def add(shape,mat):head['primitives'].append(ed.primitive(*shape,mat,joint,offset))
 if mode=='red':
  add(ellipsoid((-.005,.965,.008),(.050,.088,.130),96,48),burgundy)
 if mode!='red':
  # Remove the last neutral bonnet-frill texels at the bang roots, not facial skin.
  from PIL import Image
  primaryuv=np.array(array(d,ed.b,p['attributes']['TEXCOORD_0']));primarypos=np.array(array(d,ed.b,p['attributes']['POSITION']));imageidx=d['textures'][d['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];iv=d['bufferViews'][d['images'][imageidx]['bufferView']];im=np.asarray(Image.open(io.BytesIO(bytes(ed.b[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']]))).convert('RGB'))/255;rgb=im[np.clip((primaryuv[:,1]*im.shape[0]).astype(int),0,im.shape[0]-1),np.clip((primaryuv[:,0]*im.shape[1]).astype(int),0,im.shape[1]-1)];relative=primarypos-offset;frill=(relative[:,1]>.940)&(relative[:,0]>.083)
  blend=smooth((relative[:,1]-.931)/.010)*(relative[:,0]>.083);primarypos[:,0]=primarypos[:,0]*(1-blend)+(offset[0]+np.minimum(relative[:,0],.097))*blend
  p['attributes']['POSITION']=ed.add(primarypos,'VEC3');info['remainingHatFrillVerticesReplaced']=int(frill.sum())
  for cap in head['primitives'][2:]:
   cp=np.array(array(d,ed.b,cap['attributes']['POSITION']));rr=cp-offset;cb=smooth((rr[:,1]-.931)/.010)*(rr[:,0]>.083);cp[:,0]=cp[:,0]*(1-cb)+(offset[0]+np.minimum(rr[:,0],.097))*cb;cap['attributes']['POSITION']=ed.add(cp,'VEC3')
  hairtex=copy.deepcopy(d['materials'][p['material']]);hairtex['name']='Original red hair strands / covered scalp';hairtex['pbrMetallicRoughness'].pop('metallicRoughnessTexture',None);hairtex['pbrMetallicRoughness']['metallicFactor']=0;hairtex['pbrMetallicRoughness']['roughnessFactor']=.8;hairtex['normalTexture']['scale']=.3;hairmat=len(d['materials']);d['materials'].append(hairtex)
  rootids=np.array(array(d,ed.b,p['indices'])).ravel().reshape(-1,3);rp=primarypos[rootids]-offset;rootmask=(rp[:,:,1].min(1)>.930)&(rp[:,:,1].max(1)>.940)&(rp[:,:,0].mean(1)>.055);root=copy.deepcopy(p);root['material']=hairmat;root['indices']=ed.add(rootids[rootmask].ravel(),'SCALAR',5125);rootuv=np.column_stack([.827+.031*np.clip((relative[:,2]-.008+.06)/.12,0,1),.494+.035*np.clip((relative[:,1]-.934)/.02,0,1)]);root['attributes']['TEXCOORD_0']=ed.add(rootuv,'VEC2');p['indices']=ed.add(rootids[~rootmask].ravel(),'SCALAR',5125);head['primitives'].append(root)
  v,f=ellipsoid((.028,.927,.008),(.064,.069,.052),128,36,1.98,.003,True);patch=ed.primitive(v,f,hairmat,joint,offset);uv=[]
  for i in range(37):
   for j in range(128):
    t=(j%32)/16;t=t if t<=1 else 2-t;uv.append([.827+.031*t,.494+.035*i/36])
  uv.extend([[.842,.494],[.842,.529]]);patch['attributes']['TEXCOORD_0']=ed.add(uv,'VEC2');head['primitives'].append(patch)
  # The original torso's cropped long-hair tips were hidden inside the bonnet.
  # Blend just these red-hair points into the smaller scalp; outfit is untouched.
  body=d['meshes'][1]['primitives'][0];bp=np.array(array(d,ed.b,body['attributes']['POSITION']));bu=np.array(array(d,ed.b,body['attributes']['TEXCOORD_0']));from PIL import Image
  imageidx=d['textures'][d['materials'][body['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];view=d['bufferViews'][d['images'][imageidx]['bufferView']];im=np.asarray(Image.open(io.BytesIO(bytes(ed.b[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]))).convert('RGB'))/255;rgb=im[np.clip((bu[:,1]*im.shape[0]).astype(int),0,im.shape[0]-1),np.clip((bu[:,0]*im.shape[1]).astype(int),0,im.shape[1]-1)];mask=(bp[:,1]>.815)&(bp[:,1]<.91)&(rgb[:,0]>rgb[:,1]*1.7)&(rgb[:,0]>rgb[:,2]*1.3)&(bp[:,0]<.045)&(rgb[:,2]>rgb[:,1]*.85)
  blend=smooth((bp[:,1]-.815)/.065)*mask;bp[:,0]+=.032*blend;bp[:,2]=bp[:,2]*(1-.47*blend);body['attributes']['POSITION']=ed.add(bp,'VEC3');info['upperBodyHairVerticesBlended']=int(mask.sum())
  # Fine asymmetric, curved hair strands make the reconstructed crown read as
  # hair rather than a smooth helmet; all remain under the new headwear.
  highlight=ed.material('Red hair strand glints',(.28,.045,.06),0,.42)
 if style=='lime-cyber-headphones':
  graphite=ed.material('Cyber graphite anodized metal',(.012,.018,.022),.72,.26);rubber=ed.material('Ear cushion charcoal',(.006,.008,.009),0,.8);lime=ed.material('Lime light piping',(.47,.77,.035),.25,.32,[.15,.27,.008]);steel=ed.material('Headphone brushed chrome',(.27,.31,.32),.85,.24)
  arc=[[.022,.925+.074*math.cos(t),.008+.060*math.sin(t)] for t in np.linspace(-1.5,1.5,45)];add(tube(arc,.005,10),graphite);add(tube([[x+.004,y+.001,z] for x,y,z in arc],.00115,6),lime)
  for side in [-1,1]:
   center=(.022,.927,.008+side*.061);add(ellipsoid(center,(.020,.026,.010),20,12),rubber);add(ellipsoid((center[0],center[1],center[2]+side*.008),(.018,.024,.006),12,8),graphite)
   ring=[[.022+.015*math.cos(t),.927+.021*math.sin(t),center[2]+side*.014] for t in np.linspace(0,2*math.pi,49)];add(tube(ring,.00135,6),lime)
   for y in [.918,.925,.932,.939]:add(tube([[.014,y,center[2]+side*.015],[.030,y,center[2]+side*.015]],.00065,5),steel)
 elif style=='ivory-gold-tiara':
  gold=ed.material('Champagne gold tiara setting',(.72,.48,.18),.85,.21);pearl=ed.material('Warm ivory pearls',(.91,.84,.69),.18,.24);gem=ed.material('Pearl crystal facets',(.82,.9,.94),.2,.12)
  def on(t):return np.array([.021+.057*math.cos(t),.960+.010*math.cos(t),.008+.050*math.sin(t)])
  arc=[on(t) for t in np.linspace(-1.2,1.2,49)];add(tube(arc,.0015,8),gold);add(tube([p+np.array([0,.006,0]) for p in arc],.0011,8),gold)
  for t in np.linspace(-1.12,1.12,17):add(ellipsoid(on(t)+np.array([.001,.003,0]),(.0025,.0025,.0025),12,8),pearl)
  for i,t in enumerate(np.linspace(-1.,1.,7)):
   base=on(t);height=.035*(1-abs(t)*.5);tip=base+np.array([0,height,0]);add(tube([base,base+np.array([.002,height*.58,0]),tip],.001,7),gold);add(crystal(tip,(.005,.010 if i!=3 else .014,.0045)),gem);add(ellipsoid(tip+np.array([0,.012 if i!=3 else .016,0]),(.002,.002,.002),12,8),pearl)
   if i<6:
    b=on(np.linspace(-1.,1.,7)[i+1]);curve=[]
    for u in np.linspace(0,1,18):curve.append(base*(1-u)+b*u+np.array([0,.018*math.sin(math.pi*u),0]))
    add(tube(curve,.00085,6),gold)
 newbounds=bounds(d,ed.b);d.setdefault('extras',{})['stageHeadwear']={'version':1,'style':style,'canonicalOffset':offset.tolist(),'originalFaceTexturePreserved':True,'neckAndGarmentUnchanged':True,'originalHeadProportion':.88,'cut':info,'boundsBefore':oldbounds,'boundsAfter':newbounds,'recommendedManifestHeight':1.9*newbounds['height']/oldbounds['height']};ed.save(dest);check(dest);print('HEADWEAR_DONE',dest,d['extras']['stageHeadwear'])
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('source');ap.add_argument('reference');ap.add_argument('destination');ap.add_argument('--style',required=True,choices=['crimson-clean-back','lime-cyber-headphones','ivory-gold-tiara']);a=ap.parse_args();restyle(a.source,a.reference,a.destination,a.style)

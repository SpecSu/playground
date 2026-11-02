#!/usr/bin/env python3
"""Adjust the finished head coherently, keeping closed neck base in the torso.
LX: rigid downward head translation, tapered over neck rings. Jiji: uniform
head/hat/hair scaling around Head bind pivot, tapered to fixed neck base.
No face distortion, image edits, body edits, or skeleton/animation edits.
"""
import sys,json,struct,copy,argparse
from pathlib import Path
import numpy as np
from optimize_glb import read_glb,validate,JSON_CHUNK,BIN_CHUNK
from test_neck_attachment import array
from test_proportion_adjustment import test

def adjust(source,dest,lowering=0.,scale=1.):
 d,b,_=read_glb(source);assert d.get('extras',{}).get('neckAttachment'),'Requires closed-neck baseline';assert not d['extras'].get('proportionAdjustment'),'Do not compound an already-adjusted asset';binary=bytearray(b);node=next(n for n in d['nodes'] if 'mesh' in n and ('DONOR_HEAD' in n.get('name','') or 'CANONICAL' in n.get('name','')));mesh=d['meshes'][node['mesh']];skin=d['skins'][node['skin']];ib=array(d,b,skin['inverseBindMatrices'])
 def anchor(name):
  i=next(i for i,n in enumerate(skin['joints']) if d['nodes'][n]['name']==name);return np.linalg.inv(np.array(ib[i]).reshape(4,4).T)[:3,3]
 pivot=anchor('mixamorig:Head');neck=anchor('mixamorig:Neck');meta=d['extras']['neckAttachment'];rings=meta['rings'];patch=next(p for p in mesh['primitives'] if p.get('extras',{}).get('repair')=='closed-neck-attachment-v1');patch_acc=patch['attributes']['POSITION'];pp=np.array(array(d,b,patch_acc));base=np.array([neck[0],meta['baseY'],neck[2]]);centers=np.where(np.linalg.norm(pp-base,axis=1)<1e-6)[0];assert len(centers)==1;ci=int(centers[0]);assert ci%rings==0;N=ci//rings;changed={}
 def transform(points):
  out=pivot+(points-pivot)*scale;out[:,1]-=lowering;return out
 for p in mesh['primitives']:
  old=p['attributes']['POSITION']
  if old in changed:p['attributes']['POSITION']=changed[old];continue
  points=np.array(array(d,b,old));new=transform(points)
  if old==patch_acc:
   for ring in range(rings):
    sl=slice(ring*N,(ring+1)*N);t=ring/(rings-1);new[sl]=points[sl]+(new[sl]-points[sl])*(1-t)
    if lowering>0 and ring>0 and ring<rings-1:
     # Preserve the pre-existing torso overlap at the new lower Y. A plain
     # vertical squeeze otherwise narrows this cross-section and can expose
     # an old inner-shirt sliver through the skin (LX blue outfit).
     top=points[:N];bottom=points[(rings-1)*N:rings*N];height=top[:,1]-bottom[:,1];u=np.clip((top[:,1]-new[sl,1])/np.maximum(height,1e-8),0,1);profile=top+(bottom-top)*u[:,None];blend=min(1.,t/.25)
     new[sl,0]=(1-blend)*new[sl,0]+blend*profile[:,0];new[sl,2]=(1-blend)*new[sl,2]+blend*profile[:,2]
   new[ci]=points[ci]
  vals=np.asarray(new,dtype='<f4');binary.extend(b'\0'*(-len(binary)%4));off=len(binary);binary.extend(vals.tobytes());vi=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':vals.nbytes});ai=len(d['accessors']);d['accessors'].append({'bufferView':vi,'componentType':5126,'count':len(vals),'type':'VEC3','min':vals.min(0).tolist(),'max':vals.max(0).tolist()});p['attributes']['POSITION']=ai;changed[old]=ai
 d['extras']['proportionAdjustment']={'version':1,'headScale':scale,'headLowering':lowering,'headPivot':pivot.tolist(),'mainNeckRingVertices':N,'fixedNeckBase':True,'preserveLowerNeckOverlap':lowering>0,'faceShapeUniform':True,'bodyUnchanged':True};d['buffers'][0]['byteLength']=len(binary);jb=json.dumps(d,separators=(',',':')).encode();jb+=b' '*(-len(jb)%4);binary.extend(b'\0'*(-len(binary)%4));payload=struct.pack('<4sII',b'glTF',2,28+len(jb)+len(binary))+struct.pack('<II',len(jb),JSON_CHUNK)+jb+struct.pack('<II',len(binary),BIN_CHUNK)+binary;dest=Path(dest);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(payload);dd,bb,_=read_glb(dest);validate(dd,bb);test(source,dest)
if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('source');ap.add_argument('destination');ap.add_argument('--lowering',type=float,default=0.);ap.add_argument('--scale',type=float,default=1.);a=ap.parse_args();adjust(a.source,a.destination,a.lowering,a.scale)

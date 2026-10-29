import sys,copy,json,numpy as np
from pathlib import Path
sys.path.insert(0,'dance-stage/scripts')
from restyle_jiji_headwear import Editor,tube,ellipsoid
from optimize_glb import read_glb,view_bytes
from test_neck_attachment import array
idx=int(sys.argv[1]);ed=Editor(f'jiji-v9/baseline/jiji-{idx}.glb');d=ed.d;head=d['meshes'][0];off=np.array(d['extras']['stageHeadwear']['canonicalOffset']);skin=d['skins'][0];names=[d['nodes'][n]['name']for n in skin['joints']];hj=names.index('mixamorig:Head');nj=names.index('mixamorig:Neck');keep=[]
# Red: retain complete external bonnet shell/decorations only, never old facial surface.
if idx==0:
 for p in head['primitives']:
  name=d['materials'][p['material']]['name']
  if name=='Reconstructed_neck_skin':continue
  if name.startswith('Crimson velvet'):
   keep.append(copy.deepcopy(p));continue
  v=np.array(array(d,ed.b,p['attributes']['POSITION']));f=np.array(array(d,ed.b,p['indices'])).reshape(-1,3);c=v[f].mean(1);mask=(c[:,1]>.955)|((abs(c[:,2]-.008)>.065)&(c[:,1]>.925))|((c[:,0]<-.012)&(c[:,1]>.94))
  if mask.any():
   import io
   from PIL import Image
   ma=d['materials'][p['material']];ti=ma.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')
   if ti is not None and 'TEXCOORD_0'in p['attributes']:
    im=d['images'][d['textures'][ti]['source']];pix=np.array(Image.open(io.BytesIO(view_bytes(d,ed.b,im['bufferView']))).convert('RGB'))/255.;uv=np.array(array(d,ed.b,p['attributes']['TEXCOORD_0']));tc=uv[f].mean(1);rgb=pix[np.clip((tc[:,1]*len(pix)).astype(int),0,len(pix)-1),np.clip((tc[:,0]*pix.shape[1]).astype(int),0,pix.shape[1]-1)]
    bang=(c[:,0]>.045)&(c[:,1]<.972)&(abs(c[:,2]-.008)<.065)&(rgb[:,0]>1.4*rgb[:,1]);mask&=~bang
   q=copy.deepcopy(p);q['indices']=ed.add(f[mask].ravel(),'SCALAR',5125);keep.append(q)
if idx==0:
 for p in keep:
  vv=np.array(array(d,ed.b,p['attributes']['POSITION']));vv[:,1]-=.020;p['attributes']['POSITION']=ed.add(vv,'VEC3')
head['primitives']=keep
j,b,_=read_glb('jiji-v9/donor-no-hat.glb');imageoff=len(d['images']);texoff=len(d['textures']);samoff=len(d.get('samplers',[]));matoff=len(d['materials']);d.setdefault('samplers',[]).extend(copy.deepcopy(j.get('samplers',[])))
for im in j['images']:
 im=copy.deepcopy(im);raw=view_bytes(j,b,im['bufferView']);ed.b.extend(b'\0'*(-len(ed.b)%4));o=len(ed.b);ed.b.extend(raw);im['bufferView']=len(d['bufferViews']);d['bufferViews'].append({'buffer':0,'byteOffset':o,'byteLength':len(raw)});d['images'].append(im)
for tex in j['textures']:
 q=copy.deepcopy(tex);q['source']+=imageoff
 if 'sampler'in q:q['sampler']+=samoff
 d['textures'].append(q)
for mat in j['materials']:
 q=copy.deepcopy(mat)
 def remap(o):
  if isinstance(o,dict):
   for k,v in o.items():
    if k.endswith('Texture')and isinstance(v,dict)and'index'in v:v['index']+=texoff
    else:remap(v)
  elif isinstance(o,list):
   for v in o:remap(v)
 remap(q);d['materials'].append(q)
translation=np.array([.0274025215,.9120839605,.00074722245])+off;scale=.175
for source in j['meshes'][0]['primitives']:
 p=copy.deepcopy(source);attrs={};v=np.array(array(j,b,p['attributes']['POSITION']));new=v*scale+translation
 for k,a in p['attributes'].items():
  vals=new if k=='POSITION'else array(j,b,a);attrs[k]=ed.add(vals,j['accessors'][a]['type'],j['accessors'][a]['componentType'])
 t=np.clip((v[:,1]+.49)/.14,0,1);t=t*t*(3-2*t);attrs['JOINTS_0']=ed.add([[hj,nj,0,0]]*len(v),'VEC4',5123);attrs['WEIGHTS_0']=ed.add(np.column_stack((t,1-t,np.zeros(len(v)),np.zeros(len(v)))),'VEC4')
 p['attributes']=attrs;p['indices']=ed.add(array(j,b,p['indices']),'SCALAR',5125);p['material']+=matoff;head['primitives'].append(p)
# Remove only the old central high inner-neck clothing spike now intersecting the new natural collar.
import io
from PIL import Image
body=d['meshes'][1]
for p in body['primitives']:
 vv=np.array(array(d,ed.b,p['attributes']['POSITION']))-off;ff=np.array(array(d,ed.b,p['indices'])).reshape(-1,3);cc=vv[ff].mean(1);remove=(cc[:,1]>.826)&(cc[:,0]>.026)&(abs(cc[:,2]-.008)<.029)&(cc[:,1]<.86)
 mat=d['materials'][p['material']];ti=mat.get('pbrMetallicRoughness',{}).get('baseColorTexture',{}).get('index')
 if ti is not None and 'TEXCOORD_0'in p['attributes']:
  image=d['images'][d['textures'][ti]['source']];pix=np.array(Image.open(io.BytesIO(bytes(ed.b[d['bufferViews'][image['bufferView']].get('byteOffset',0):d['bufferViews'][image['bufferView']].get('byteOffset',0)+d['bufferViews'][image['bufferView']]['byteLength']]))).convert('RGB'))/255.
  uv=np.array(array(d,ed.b,p['attributes']['TEXCOORD_0']));tc=uv[ff].mean(1);rgb=pix[np.clip((tc[:,1]*len(pix)).astype(int),0,len(pix)-1),np.clip((tc[:,0]*pix.shape[1]).astype(int),0,pix.shape[1]-1)];hair=(rgb[:,0]>1.5*rgb[:,1])&(rgb[:,0]>1.25*rgb[:,2])&(rgb[:,0]>.15)
  is_red_hair=hair.copy()
  hair&=(cc[:,1]>(.85 if idx==0 else .826))&(abs(cc[:,2]-.008)>.045)&(abs(cc[:,2]-.008)<(.12 if idx==0 else .18))
  remove|=hair
  # Ray-picked old body hair fragments only; preserve new donor and high garment shoulders.
  raw=cc+off
  if idx==0:remove|=(raw[:,0]<.005)&(abs(raw[:,2])>.065)&(abs(raw[:,2])<.18)&(raw[:,1]>.842)
  if idx==2:remove|=is_red_hair&(raw[:,0]>.010)&(raw[:,0]<.040)&(raw[:,1]>.853)&(raw[:,2]>-.048)&(raw[:,2]<-.027)
 if remove.any():p['indices']=ed.add(ff[~remove].ravel(),'SCALAR',5125)
d['extras']['neckAttachment']={'version':2,'method':'closed full donor neck with lower Head/Neck blending','oldPaperBridgeRemoved':True}
d['extras']['v9Face']={'source':'original-photo tight crop','task':'74d338af-5dd7-43a0-930f-b0d8d47fac0e','uniformScale':scale,'translation':translation.tolist(),'noFacialWarp':True,'oldNeckBridgeRemoved':True}
ed.save(f'jiji-v9/combined-{idx}.glb')

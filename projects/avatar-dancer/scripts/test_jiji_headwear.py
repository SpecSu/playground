"""Source-preservation and revision regression checks for costume headwear."""
import sys,io,numpy as np
from PIL import Image
from pathlib import Path
from optimize_glb import read_glb,view_bytes
from test_neck_attachment import array,check

def mesh_indices(doc):
 head=next(n['mesh'] for n in doc['nodes'] if 'mesh' in n and ('DONOR_HEAD' in n.get('name','') or 'CANONICAL' in n.get('name','')))
 body=next(n['mesh'] for n in doc['nodes'] if 'mesh' in n and n['mesh']!=head)
 return head,body

def verify(source,output):
 d,b,_=read_glb(source);e,c,_=read_glb(output);meta=e.get('extras',{}).get('stageHeadwear');assert meta,'Costume-specific headwear missing'
 head_index,body_index=mesh_indices(d);assert mesh_indices(e)==(head_index,body_index)
 assert meta['style'] in ['crimson-clean-back','lime-cyber-headphones','ivory-gold-tiara']
 assert d['animations']==e['animations'] and d['skins']==e['skins'] and d['nodes']==e['nodes']
 if meta['style']=='crimson-clean-back':assert d['meshes'][body_index]==e['meshes'][body_index],'Red outfit changed'
 for p in d['meshes'][body_index]['primitives']:
  for ai in [p['indices'],*p['attributes'].values()]:
   vi=d['accessors'][ai]['bufferView'];assert view_bytes(d,b,vi)==view_bytes(e,c,vi)
  newbody=e['meshes'][body_index]['primitives'][0];assert p['indices']==newbody['indices'];assert all(p['attributes'][k]==newbody['attributes'][k] for k in p['attributes'] if k!='POSITION')
  before=np.array(array(d,b,p['attributes']['POSITION']));after=np.array(array(e,c,newbody['attributes']['POSITION']));changed=np.max(abs(before-after),axis=1)>1e-7
  bu=np.array(array(d,b,p['attributes']['TEXCOORD_0']));maskd,maskb=d,b
  if Path(source).stem.endswith('_low'):
   high=Path(source).with_name(Path(source).name.replace('_low.glb','.glb'));maskd,maskb,_=read_glb(high);hp=maskd['meshes'][body_index]['primitives'][0];assert array(maskd,maskb,hp['attributes']['POSITION'])==array(d,b,p['attributes']['POSITION']) and array(maskd,maskb,hp['attributes']['TEXCOORD_0'])==array(d,b,p['attributes']['TEXCOORD_0'])
  ii=maskd['textures'][maskd['materials'][p['material']]['pbrMetallicRoughness']['baseColorTexture']['index']]['source'];im=np.asarray(Image.open(io.BytesIO(view_bytes(maskd,maskb,maskd['images'][ii]['bufferView']))).convert('RGB'))/255;rgb=im[(bu[:,1]*im.shape[0]).astype(int).clip(0,im.shape[0]-1),(bu[:,0]*im.shape[1]).astype(int).clip(0,im.shape[1]-1)];hair=(before[:,1]>.815)&(before[:,1]<.91)&(before[:,0]<.045)&(rgb[:,0]>rgb[:,1]*1.7)&(rgb[:,0]>rgb[:,2]*1.3)&(rgb[:,2]>rgb[:,1]*.85);assert np.all(hair[changed]),'Garment vertices modified';assert np.allclose(before[:,1],after[:,1]);print('bodyHairOnlyChangedVertices',int(changed.sum()))
 for old,new in zip(d['images'],e['images']):assert view_bytes(d,b,old['bufferView'])==view_bytes(e,c,new['bufferView']),'Original face image changed'
 assert d['extras']['proportionAdjustment']==e['extras']['proportionAdjustment']
 assert d['meshes'][head_index]['primitives'][1]==e['meshes'][head_index]['primitives'][1],'Closed neck geometry changed'
 oldp=d['meshes'][head_index]['primitives'][0];newp=e['meshes'][head_index]['primitives'][0];op=np.array(array(d,b,oldp['attributes']['POSITION']));np_=np.array(array(e,c,newp['attributes']['POSITION']));offset=np.array(meta['canonicalOffset']);protected=(op[:,0]-offset[0]>.055)&(op[:,1]-offset[1]<.924)&(abs(op[:,2]-offset[2]-.008)<.06)
 lookup={}
 for i,p in enumerate(np_):lookup.setdefault(tuple(np.round(p,6)),[]).append(i)
 oldarrays={k:array(d,b,oldp['attributes'][k]) for k in ['POSITION','TEXCOORD_0','JOINTS_0','WEIGHTS_0']};newarrays={k:array(e,c,newp['attributes'][k]) for k in oldarrays}
 for i in np.where(protected)[0]:
  key=tuple(np.round(op[i],6));assert key in lookup,'Protected face vertex removed'
  assert any(all(np.allclose(oldarrays[attr][i],newarrays[attr][j],atol=2e-6) for attr in oldarrays) for j in lookup[key]),'Protected face attributes changed'
 oldids=np.array(array(d,b,oldp['indices'])).ravel().reshape(-1,3);newids=np.array(array(e,c,newp['indices'])).ravel().reshape(-1,3);oldtris={tuple(tuple(np.round(op[i],6)) for i in tri) for tri in oldids if all(protected[i] for i in tri)};newtris={tuple(tuple(np.round(np_[i],6)) for i in tri) for tri in newids};assert oldtris<=newtris,'Protected face triangle removed'
 check(output);print('HEADWEAR_PASS',Path(output).name,meta['style'],'protectedFaceVertices',int(protected.sum()))
if __name__=='__main__':verify(sys.argv[1],sys.argv[2])

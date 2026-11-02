"""Compare exact geometric changes with a known closed-neck baseline."""
import sys,numpy as np
from optimize_glb import read_glb,view_bytes
from test_neck_attachment import array,check

def test(before,after):
 d,b,_=read_glb(before);e,c,_=read_glb(after);assert e.get('extras',{}).get('proportionAdjustment'),'Requested proportions not applied';meta=e['extras']['proportionAdjustment'];node=next(n for n in d['nodes'] if 'mesh' in n and ('DONOR_HEAD' in n.get('name','') or 'CANONICAL' in n.get('name','')));h=node['mesh'];a=np.array(array(d,b,d['meshes'][h]['primitives'][0]['attributes']['POSITION']));z=np.array(array(e,c,e['meshes'][h]['primitives'][0]['attributes']['POSITION']));pivot=np.array(meta['headPivot']);expected=pivot+(a-pivot)*meta['headScale'];expected[:,1]-=meta['headLowering'];assert np.max(np.abs(z-expected))<1e-6
 for i,m in enumerate(d['meshes']):
  if i==h:continue
  assert m==e['meshes'][i]
  for p in m['primitives']:
   for acc in [p['indices'],*p['attributes'].values()]:
    vi=d['accessors'][acc]['bufferView'];assert view_bytes(d,b,vi)==view_bytes(e,c,vi),'Body outfit modified'
 old_patch=next(p for p in d['meshes'][h]['primitives'] if p.get('extras',{}).get('repair')=='closed-neck-attachment-v1');new_patch=next(p for p in e['meshes'][h]['primitives'] if p.get('extras',{}).get('repair')=='closed-neck-attachment-v1');op=np.array(array(d,b,old_patch['attributes']['POSITION']));np_=np.array(array(e,c,new_patch['attributes']['POSITION']));N=meta['mainNeckRingVertices'];rings=d['extras']['neckAttachment']['rings'];assert np.array_equal(op[(rings-1)*N:rings*N+1],np_[(rings-1)*N:rings*N+1]),'Neck bottom detached from original torso anchor'
 assert d['animations']==e['animations'] and d['skins']==e['skins'] and d['nodes']==e['nodes']
 for im,om in zip(d['images'],e['images']):assert view_bytes(d,b,im['bufferView'])==view_bytes(e,c,om['bufferView'])
 check(after);print('PROPORTIONS_PASS',after,meta)
if __name__=='__main__':test(sys.argv[1],sys.argv[2])

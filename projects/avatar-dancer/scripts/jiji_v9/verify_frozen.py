import sys,json,hashlib,numpy as np
from pathlib import Path
sys.path.insert(0,'dance-stage/scripts')
from optimize_glb import read_glb
from test_neck_attachment import array,open_edges
R=Path('jiji-v9');F=R/'candidate-cleanup';out={'assets':[],'rigProof':[],'limits':['Offline CPU and image evidence, not browser GPU FPS or likeness guarantee.','Residual tiny source/quantization boundary edges are reported, not claimed watertight.']}
for i,oldheight in enumerate([1.9,1.7739319124146693,1.808752257391983]):
 a,b,_=read_glb(R/'baseline'/f'jiji-{i}.glb');d,e,_=read_glb(F/f'jiji-{i}.glb');lo,lb,_=read_glb(F/f'jiji-{i}_low.glb')
 assert len(d['accessors'])==len(lo['accessors'])
 for ai in range(len(d['accessors'])):assert np.array_equal(array(d,e,ai),array(lo,lb,ai))
 assert a['nodes']==d['nodes'];assert len(d['skins'][0]['joints'])==23;assert len(d['animations'])==3
 assert np.array_equal(array(a,b,a['skins'][0]['inverseBindMatrices']),array(d,e,d['skins'][0]['inverseBindMatrices']))
 for aa,dd in zip(a['animations'],d['animations']):
  assert aa['channels']==dd['channels']
  for x,y in zip(aa['samplers'],dd['samplers']):
   for k in ['input','output']:assert np.array_equal(array(a,b,x[k]),array(d,e,y[k]))
 def h(j,k):
  vv=np.vstack([array(j,k,p['attributes']['POSITION'])for m in j['meshes']for p in m['primitives']]);return float(vv[:,1].max()-vv[:,1].min())
 out['rigProof'].append({'outfit':i,'nodesInverseBindsAndAllAnimationCurvesExactToBaseline':True,'highLowAllAccessorsExact':True,'accessors':len(d['accessors']),'recommendedHeight':oldheight*h(d,e)/h(a,b)})
 for p in [F/f'jiji-{i}.glb',F/f'jiji-{i}_low.glb']:out['assets'].append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
d,b,_=read_glb(R/'donor-no-hat.glb');es=open_edges(d,b,d['meshes'][0]);out['donorBoundary']={'openRoundedEdges':len(es),'maxSourceLength':max(float(np.linalg.norm(np.array(a)-b))for a,b in es),'uniformGameScale':.175,'edges':es}
(R/'FROZEN_PROOF.json').write_text(json.dumps(out,indent=2));print(json.dumps({k:v for k,v in out.items() if k!='donorBoundary'},indent=2))

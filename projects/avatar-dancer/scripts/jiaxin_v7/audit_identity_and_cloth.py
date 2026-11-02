import os
import sys,json,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
ROOT=Path(os.environ.get('ENCORE_WORKSPACE',Path(__file__).resolve().parents[3]));sys.path.insert(0,str(ROOT/'dance-stage/scripts'))
from optimize_glb import read_glb
from test_neck_attachment import array
P=ROOT/'jiaxin-head-integration/final/jiaxin-0.glb';j,b,_=read_glb(P)
def get(d,b,p,k):return np.asarray(array(d,b,p['attributes'][k]),float)
parts=[p for m in j['meshes']for p in m['primitives']]
# Imported geometry is +Y-up in GLB; donor transform is uniform and rigid.
hp=[p for p in parts if 'tripo_material_f0b' in j['materials'][p['material']]['name'] or 'Clean rear hair' in j['materials'][p['material']]['name']]
finalhead=np.concatenate([get(j,b,p,'POSITION')for p in hp]);hk=cKDTree(finalhead)
d,db,_=read_glb(ROOT/'dance-stage-work/tripo/jiaxin-direct-head-v1.glb');op=d['meshes'][0]['primitives'][0];original=get(d,db,op,'POSITION');expected=original*.2+np.array([.007,.9,-.005])
# All face/ears/crown above the below-ear rear-hair cleanup zone are immutable.
protected=(original[:,1]>=-.05)|(original[:,0]>=-.12)|(np.abs(original[:,2])>=.25)
# Crop removes bust/neck below accepted jaw, not face/crown.
protected&=original[:,1]>-.20
hd,hi=hk.query(expected[protected]);assert hd.max()<2e-6,float(hd.max())
# Entire retained native body mesh positions, UV and skin influences are unchanged.
d,db,_=read_glb(ROOT/'jiaxin-collar-contract/native-collar-preserved.glb');op=d['meshes'][0]['primitives'][0];oldp=get(d,db,op,'POSITION');newp=get(j,b,parts[0],'POSITION');tree=cKDTree(newp);dist,index=tree.query(oldp);assert dist.max()<2e-6,float(dist.max())
# Verify UV correspondence among coincident split vertices instead of arbitrary KD choice.
ou=get(d,db,op,'TEXCOORD_0');nu=get(j,b,parts[0],'TEXCOORD_0');maxuv=0
for i,neighbors in enumerate(tree.query_ball_point(oldp,2e-6)):
 maxuv=max(maxuv,min(float(np.max(np.abs(ou[i]-nu[k])))for k in neighbors))
assert maxuv<2e-6,maxuv
# All actual new head vertices remain rigid to Head; neck morph only in adapter/native skin.
for p in hp:
 js=get(j,b,p,'JOINTS_0').astype(int);ws=get(j,b,p,'WEIGHTS_0');skin=j['skins'][0];names=[j['nodes'][i]['name']for i in skin['joints']]
 for row,w in zip(js,ws):assert all(names[k].endswith('Head')for k,x in zip(row,w)if x>1e-5)
triangles=sum(len(array(j,b,p['indices']))//3 for p in parts)
report={'source':str(P),'sha256':hashlib.sha256(P.read_bytes()).hexdigest(),'protectedHeadVertices':int(protected.sum()),'protectedFaceCrownEarMaxPositionError':float(hd.max()),'nativeRetainedVertices':len(oldp),'nativePositionMaxError':float(dist.max()),'nativeUVMaxError':maxuv,'headFullyRigidHeadBone':True,'triangles':triangles,'drawCalls':len(parts),'bones':len(j['skins'][0]['joints']),'clips':[a['name']for a in j['animations']],'note':'Geometry/UV checks, not subjective exact likeness or measured browser FPS.'}
(ROOT/'jiaxin-head-integration/final/identity-cloth-proof.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

"""Read-only native face/body geometry + skin consistency across material variants."""
import sys,json,numpy as np
from scipy.spatial import cKDTree
from optimize_glb import read_glb
from test_neck_attachment import array

def body(path):
 d,b,_=read_glb(path);m=next(m for m in d['meshes'] if 'tripo_mesh' in m.get('name',''));ps=[];ws=[]
 for p in m['primitives']:
  a=p['attributes'];pos=array(d,b,a['POSITION']);weights=array(d,b,a['WEIGHTS_0']);joints=array(d,b,a['JOINTS_0'])
  for po,we,jo in zip(pos,weights,joints):
   w=np.zeros(len(d['skins'][0]['joints']))
   for j,v in zip(jo,we):w[j]+=v
   ps.append(po);ws.append(w)
 return np.asarray(ps),np.asarray(ws)
if __name__=='__main__':
 p,w=body(sys.argv[1]);tree=cKDTree(p);reports=[]
 for f in sys.argv[2:]:
  q,v=body(f);dist,idx=tree.query(q);reverse=cKDTree(q).query(p)[0];error=max(dist.max(),reverse.max());weight_errors=[]
  for i,near in enumerate(tree.query_ball_point(q,2e-6)):
   weight_errors.append(min(float(np.abs(w[j]-v[i]).max()) for j in near))
  weight_error=max(weight_errors)
  assert error<2e-6,('Face/body geometry drift',error)
  assert weight_error<2e-5,('Native skin weights drift',weight_error)
  reports.append({'asset':f,'max_body_position_error':float(error),'max_skin_weight_error':float(weight_error),'face_and_neck_same_as_approved_base':True})
 print(json.dumps(reports,indent=2))

"""Run from workspace root; no network, no publication, no credential use."""
import subprocess,sys,shutil
from pathlib import Path
import numpy as np
sys.path.insert(0,'dance-stage/scripts')
from restyle_jiji_headwear import Editor
from test_neck_attachment import array
R=Path('jiji-v9');F=R/(sys.argv[1] if len(sys.argv)>1 else 'final');F.mkdir(exist_ok=True);(R/'final-raw').mkdir(exist_ok=True);(R/'final').mkdir(exist_ok=True)
def run(*a):subprocess.run(list(a),check=True)
for i in range(3):
 run('python',str(R/'integrate_head.py'),str(i));src=R/f'combined-{i}.glb'
 if i:
  dest=R/f'combined-hat-{i}.glb';run('python','jiji-hats-v9/apply_hats.py',str(src),str(dest),str(i));src=dest
  if i==2:
   ed=Editor(src)
   for p in ed.d['meshes'][0]['primitives']:
    if ed.d['materials'][p['material']].get('name','').startswith('V9 '):
     v=np.array(array(ed.d,ed.b,p['attributes']['POSITION']));v[:,1]-=.005;p['attributes']['POSITION']=ed.add(v,'VEC3')
   ed.save(src)
 raw=R/'final-raw'/f'jiji-{i}.glb';shutil.copyfile(src,raw)
 bat=R/'final-raw'/f'jiji-{i}-batched.glb';compact=R/'final-raw'/f'jiji-{i}-compact.glb'
 run('python',str(R/'batch_final.py'),str(raw),str(bat));run('python',str(R/'compact_glb.py'),str(bat),str(compact))
 for suffix,dif,data in [('',2048,1024),('_low',1024,512)]:run('python','dance-stage/scripts/optimize_glb.py',str(compact),str(F/f'jiji-{i}{suffix}.glb'),'--diffuse-max',str(dif),'--data-max',str(data))

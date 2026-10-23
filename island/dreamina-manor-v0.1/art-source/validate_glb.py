import json,struct,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public/assets/world'
def read(p):
 b=p.read_bytes();assert b[:4]==b'glTF';n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n])
for p in sorted(root.rglob('*.glb')):
 j=read(p);tri=0
 for mesh in j.get('meshes',[]):
  for pr in mesh['primitives']:
   if 'indices' in pr:tri+=j['accessors'][pr['indices']]['count']//3
 assert len(j.get('meshes',[]))>0
 if p.parent.name=='plants':
  assert len(j.get('animations',[]))==1,(p,'single growth clip required')
  targets=[c['target'] for c in j['animations'][0]['channels']]
  rootnodes=j['scenes'][j.get('scene',0)]['nodes']
  assert not any(t['node'] in rootnodes and t['path']=='scale' for t in targets),'whole plant must not use root growth scale'
 print(p.name,'meshes',len(j.get('meshes',[])),'triangles',tri,'clips',len(j.get('animations',[])),'bytes',p.stat().st_size)

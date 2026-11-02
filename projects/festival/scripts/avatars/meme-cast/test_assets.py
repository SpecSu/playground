"""Offline asset contract tests for the two new, original meme sculptures."""
import json, struct, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
CANONICAL={'root','hips','spine','chest','neck','head'}|{f'{bone}_{side}' for side in ['L','R'] for bone in ['upperArm','forearm','hand','thigh','shin','foot']}
def read_glb(path):
 raw=path.read_bytes(); assert raw[:4]==b'glTF'; n,kind=struct.unpack_from('<II',raw,12);return json.loads(raw[20:20+n]),len(raw)
class MemeAssets(unittest.TestCase):
 def test_two_distinct_weighted_meme_assets(self):
  for kind in ['banana-cat','sword-shield-dog']:
   with self.subTest(kind=kind):
    path=ROOT/'public/avatars'/f'{kind}.glb';self.assertTrue(path.exists(),f'Missing new asset {kind}')
    glb,size=read_glb(path);self.assertLess(size,600000)
    self.assertTrue(CANONICAL <= {n.get('name') for n in glb['nodes']})
    self.assertTrue(glb.get('skins'));self.assertTrue(all('JOINTS_0' in p['attributes'] and 'WEIGHTS_0' in p['attributes'] for m in glb['meshes'] for p in m['primitives']))
    triangles=sum(glb['accessors'][p['indices']]['count']//3 for m in glb['meshes'] for p in m['primitives']);self.assertLessEqual(triangles,14000)
    extras=next(n['extras'] for n in glb['nodes'] if n.get('extras',{}).get('memeIdentity')==kind and 'speciesRig' in n.get('extras',{}))
    self.assertEqual(extras['speciesRig'],'animal-v2');self.assertEqual(extras['revision'],'meme-cast-v1')
    self.assertEqual(len(glb['skins'][0]['joints']),18)
if __name__=='__main__':unittest.main()

"""Local safety/format checks. No network requests, credentials, or paid tasks."""
import json
import hashlib
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import tripo_pipeline as p

def glb(doc):
    payload=json.dumps(doc).encode()
    payload+=b' '*((-len(payload))%4)
    return b'glTF'+struct.pack('<IIII',2,20+len(payload),len(payload),0x4E4F534A)+payload

class PipelineChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.patches=[patch.object(p,'ROOT',self.root),patch.object(p,'WORK',self.root/'work'),patch.object(p,'PUBLIC',self.root/'public'),patch.object(p,'api',side_effect=AssertionError('Unexpected network request'))]
        for x in self.patches: x.start()
    def tearDown(self):
        for x in reversed(self.patches): x.stop()
        self.temp.cleanup()
    def resume(self): p.save(p.WORK/'control.json',{'paused':False})
    def test_paused_is_default_and_blocks_network(self):
        with self.assertRaisesRegex(RuntimeError,'生成已暂停'): p.run('dog','geometry')
    def test_plan_has_no_network(self):
        plan=p.plan(['dog','tree'])
        self.assertEqual(plan['estimated_total_credits'],120)
        self.assertTrue(plan['paused'])
    def test_unknown_submission_does_not_retry(self):
        self.resume(); p.save(p.WORK/'dog/geometry.json',{'status':'outcome_unknown'})
        with self.assertRaisesRegex(RuntimeError,'结果未知'): p.run('dog','geometry')
    def test_texture_requires_geometry_review(self):
        self.resume()
        with self.assertRaisesRegex(RuntimeError,'灰模截图验收'): p.run('dog','texture')
    def test_remaining_assets_require_pilot(self):
        self.resume()
        with self.assertRaisesRegex(RuntimeError,'先完成狗狗'): p.run('ground','geometry')
    def test_file_cannot_fake_glb(self):
        f=self.root/'bad.glb'; f.write_bytes(b'not a model')
        with self.assertRaisesRegex(RuntimeError,'不是 GLB'): p.glb_summary(f)
    def test_glb_rejects_external_texture(self):
        f=self.root/'bad.glb'; f.write_bytes(glb({'images':[{'uri':'https://example.com/a.png'}]}))
        with self.assertRaisesRegex(RuntimeError,'外部资源'): p.glb_summary(f)
    def test_approval_expires_when_model_changes(self):
        f=p.PUBLIC/'dog/geometry.glb'; f.parent.mkdir(parents=True); f.write_bytes(glb({'asset':{'version':'2.0'}}))
        screen=self.root/'review.png'; screen.write_bytes(b'fixture proof')
        p.approve('dog',[str(screen)],'test only')
        self.assertTrue(p.valid_geometry_approval('dog'))
        f.write_bytes(glb({'asset':{'version':'2.0','generator':'revised'}}))
        self.assertFalse(p.valid_geometry_approval('dog'))
    def test_glb_counts_real_triangles(self):
        f=self.root/'model.glb'; f.write_bytes(glb({'accessors':[{'count':12},{'count':18}], 'meshes':[{'primitives':[{'attributes':{'POSITION':0},'indices':1}]}]}))
        self.assertEqual(p.glb_summary(f)['triangles'],6)
    def test_success_file_skips_rebilling(self):
        self.resume(); f=p.PUBLIC/'dog/geometry.glb'; f.parent.mkdir(parents=True); f.write_bytes(glb({}))
        p.run('dog','geometry')
    def test_compact_derivative_expires_when_runtime_changes(self):
        folder=p.PUBLIC/'dog'; folder.mkdir(parents=True)
        previous=None
        for kind in ('texture','display','runtime','compact'):
            data=glb({'asset':{'version':'2.0','generator':kind}})
            (folder/(kind+'.glb')).write_bytes(data)
            digest=hashlib.sha256(data).hexdigest()
            if previous: p.save(folder/(kind+'.json'),{'source_sha256':previous,'output_sha256':digest})
            previous=digest
        self.assertIn('compact',p.catalog()['dog'])
        changed=glb({'asset':{'version':'2.0','generator':'runtime revised'}})
        (folder/'runtime.glb').write_bytes(changed)
        metadata=p.read(folder/'runtime.json');metadata['output_sha256']=hashlib.sha256(changed).hexdigest()
        p.save(folder/'runtime.json',metadata)
        self.assertIn('runtime',p.catalog()['dog'])
        self.assertNotIn('compact',p.catalog()['dog'])

if __name__=='__main__': unittest.main(verbosity=2)

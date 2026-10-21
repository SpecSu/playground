"""Check the legacy generator's overwrite guard in an isolated fake checkout."""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class LegacyGuardTest(unittest.TestCase):
    def test_revisioned_avatar_manifest_cannot_be_overwritten(self):
        source = Path(__file__).resolve().parents[1] / 'generate_club_avatars.py'
        with tempfile.TemporaryDirectory(prefix='club-avatar-guard-') as temporary:
            root = Path(temporary)
            script = root / 'scripts' / 'avatars' / source.name
            script.parent.mkdir(parents=True)
            shutil.copyfile(source, script)
            assets = root / 'public' / 'avatars'
            assets.mkdir(parents=True)
            original = json.dumps({'avatars': [{'kind': 'human-subeike', 'revision': 'approved-shape-v1'}]})
            (assets / 'manifest.json').write_text(original)
            (assets / 'human-subeike.glb').write_bytes(b'approved-asset-sentinel')
            # Unknown kind skips geometry construction, so the unguarded legacy
            # implementation demonstrates its manifest overwrite without a costly
            # full export. Never point this regression test at the real checkout.
            result = subprocess.run(['blender', '-b', '-t', '1', '--python-exit-code', '1', '--python', str(script), '--', '--only', '__guard_probe__'], capture_output=True, text=True, timeout=45)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('Refusing to overwrite revisioned avatar assets', result.stdout + result.stderr)
            self.assertEqual((assets / 'manifest.json').read_text(), original)
            self.assertEqual((assets / 'human-subeike.glb').read_bytes(), b'approved-asset-sentinel')


if __name__ == '__main__':
    unittest.main(verbosity=2)

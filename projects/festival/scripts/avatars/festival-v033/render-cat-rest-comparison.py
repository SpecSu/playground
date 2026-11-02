"""Read-only comparison for the cat's small white strands near its forepaws.
Uses the same studio renderer; rest is baked without an animation layer at map scale 2.
Outputs live only under .local-qa/v033/cat-comparison.
"""
from pathlib import Path
import json
import os
import shutil

root = Path('.local-qa/v033').resolve()
out = root / 'cat-comparison'
out.mkdir(parents=True, exist_ok=True)
shutil.copyfile(root / 'runtime-pose-metrics.json', out / 'runtime-pose-metrics.json')
shutil.copyfile(root / 'miaocuijiao-walking.glb', out / 'miaocuijiao-walking.glb')
shutil.copyfile(root / 'miaocuijiao-celebration.glb', out / 'miaocuijiao-celebration.glb')
# Bake this extra unanimated rest through the existing exporter before running.
# Node: QA_KIND=miaocuijiao QA_REST_ONLY=1 ... export-runtime-poses.mjs .local-qa/v033/cat-rest-bake
shutil.copyfile(root / 'cat-rest-bake/miaocuijiao-rest.glb', out / 'miaocuijiao-rest.glb')
source = Path('scripts/avatars/festival-v033/render-runtime-poses.py').read_text()
start = source.index('JOBS = [(')
end = source.index('report = []', start)
source = source[:start] + "JOBS = [(f'miaocuijiao-{pose}-detail', pose, ['miaocuijiao'], True) for pose in ['rest', 'walking', 'celebration']]\n" + source[end:]
os.environ['QA_ROOT'] = str(out)
os.environ.pop('QA_ONLY', None)
exec(compile(source, 'render-runtime-poses-comparison', 'exec'))

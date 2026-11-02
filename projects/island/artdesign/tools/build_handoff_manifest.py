"""Explicitly refresh the handoff inventory after reviewing intentional changes.

Offline only. Does not generate assets or reconstruct private Tripo task logs.
"""
import argparse
import hashlib
import json
from pathlib import Path
from tripo_pipeline import SPECS, glb_summary

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ('geometry', 'texture', 'display', 'runtime', 'compact')
EXCLUDED_DIRS = {'work', 'node_modules', '__pycache__', '.venv', '.git', '.tripo'}
EXCLUDED_NAMES = {'files.json', '.DS_Store', 'tripo-env.sh', 'TRIPO_SETUP.md'}


def included_files():
    for path in sorted(ROOT.rglob('*')):
        relative = path.relative_to(ROOT)
        if any(p in EXCLUDED_DIRS for p in relative.parts):
            continue
        if path.name in EXCLUDED_NAMES or path.name.startswith('.env') or path.suffix in {'.pyc', '.tmp', '.download'}:
            continue
        if path.is_symlink():
            raise ValueError(f'Symlink is not a portable archive file: {relative}')
        if path.is_file():
            yield path


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def build():
    layout = json.loads((ROOT/'scene-lab/assets/layout.json').read_text())
    issues = {
        'dog': ['尾巴偏长，未完成专业修形'],
        'tree': ['部分叶片粘连，需要定向清理'],
        'ground': ['宽深约 2% 差异，规则模块边界待标准化'],
        'shrub': ['有少量针孔与花叶连接问题'],
        'rock': ['材质偏写实，与风格统一性仍有差距'],
    }
    rows = []
    for asset, spec in SPECS.items():
        row = {'id': asset, 'name': spec['name'], 'reference': spec['reference'],
               'reference_sha256': hashlib.sha256((ROOT/spec['reference']).read_bytes()).hexdigest(),
               'layout': layout['assets'][asset],
               'status': '示例已装配及优化；非最终美术品质批准',
               'known_issues': issues.get(asset, []), 'versions': {}}
        for version in VERSIONS:
            path = ROOT/f'scene-lab/assets/models/{asset}/{version}.glb'
            row['versions'][version] = {'path': path.relative_to(ROOT).as_posix(), **glb_summary(path)}
        rows.append(row)
    inventory = {'workflow_framework_version': '0.1', 'source_code_commit': '29f10ad',
                 'units': 'bytes and triangles; layout uses designed metres',
                 'source_scene_reference': 'art/v0.1/references/scene-original.png',
                 'default_version': 'compact', 'compatibility_fallback': 'runtime',
                 'asset_count': len(rows), 'model_file_count': len(rows)*len(VERSIONS),
                 'reference_only': [
                     {'id': name, 'reference': f'art/v0.1/assets/{name}/primary.png', 'status': '无 Tripo 模型'}
                     for name in ('grass', 'rod')],
                 'global_limits': ['未做真实手机/温升/跨浏览器验证', '最后贴图轮次按用户要求未完成额外全面视觉复验'],
                 'totals': {v: {key: sum(r['versions'][v][key] for r in rows)
                                for key in ('bytes', 'triangles')} for v in VERSIONS},
                 'assets': rows}
    save(ROOT/'manifests/asset-inventory.json', inventory)
    entries = [{'path': p.relative_to(ROOT).as_posix(), 'bytes': p.stat().st_size,
                'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in included_files()]
    save(ROOT/'manifests/files.json', {'algorithm': 'sha256', 'root': 'projects/island/artdesign',
         'note': 'Excludes this file and ignored work/dependency/credential files. Intentional edits require a reviewed refresh.',
         'file_count': len(entries), 'total_bytes': sum(r['bytes'] for r in entries), 'files': entries})
    print(json.dumps({'files': len(entries), 'model_files': inventory['model_file_count'],
                      'total_bytes': sum(r['bytes'] for r in entries), 'totals': inventory['totals']}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true', help='Confirm changes have been reviewed; overwrite inventory/checksums.')
    args = parser.parse_args()
    if not args.refresh:
        parser.error('Review intentional changes, then pass --refresh. To verify only, use verify_handoff.py.')
    build()

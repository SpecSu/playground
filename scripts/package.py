#!/usr/bin/env python3
"""Reproducible source ZIPs. No installs, credentials, Git history or runtime DBs."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OMIT = {'.git', 'node_modules', '.wrangler', '.sites-runtime', '.next', '.vinext',
        'dist', 'out', 'coverage', '__pycache__', 'artifacts', '.cache', '.agents', '.codex'}

def source_files(base):
    import os
    for directory, folders, names in os.walk(base):
        folders[:] = sorted(x for x in folders if x not in OMIT)
        for name in sorted(names):
            p = Path(directory) / name
            if p.is_symlink():
                raise RuntimeError(f'Symlinks require review: {p.relative_to(ROOT)}')
            if name in {'.DS_Store', 'next-env.d.ts'} or name.startswith('.env') and name != '.env.example':
                continue
            if name.endswith(('.log', '.tsbuildinfo', '.pyc', '.pem', '.key')):
                continue
            yield p

def package(label, files):
    destination = ROOT / 'artifacts' / f'{label}.zip'
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for p in sorted(files):
            info = zipfile.ZipInfo(p.relative_to(ROOT).as_posix(), date_time=(2026, 10, 21, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, p.read_bytes())
    return {'path': destination.relative_to(ROOT).as_posix(), 'bytes': destination.stat().st_size,
            'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}

if __name__ == '__main__':
    results = [package('playground-source', source_files(ROOT))]
    common = list(source_files(ROOT / 'docs' / 'legacy-demos')) + list(source_files(ROOT / 'manifests' / 'legacy-demos'))
    common += [ROOT / 'README.md', ROOT / 'THIRD_PARTY_NOTICES.md']
    for demo in ('disco', 'fishing', 'festival'):
        results.append(package(f'{demo}-source-2026-10-21', list(source_files(ROOT / 'projects' / demo)) + common))
    (ROOT / 'artifacts' / 'packages.json').write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps(results, indent=2))

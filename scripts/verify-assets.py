#!/usr/bin/env python3
"""Verify every archived runtime asset against the delivered inventory."""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifests' / 'assets.json').read_text())
errors = []
for asset in manifest['assets']:
    file = root / asset['path']
    if not file.is_file():
        errors.append(f"Missing: {asset['path']}")
    elif hashlib.sha256(file.read_bytes()).hexdigest() != asset['sha256']:
        errors.append(f"Checksum mismatch: {asset['path']}")
expected = {a['path'] for a in manifest['assets']}
actual = {p.relative_to(root).as_posix() for p in (root / 'demos').glob('*/public/**/*') if p.is_file()}
errors.extend(f'Unlisted asset: {p}' for p in sorted(actual - expected))
if errors:
    raise SystemExit('\n'.join(errors))
print(f"Verified {len(expected)} assets; no missing, changed or unlisted files.")

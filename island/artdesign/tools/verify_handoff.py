"""Verify a clean archive with Python stdlib only. No network or paid API calls."""
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit
from build_handoff_manifest import ROOT, VERSIONS, included_files
from tripo_pipeline import SPECS, glb_summary


def check():
    manifest = json.loads((ROOT/'manifests/files.json').read_text())
    inventory = json.loads((ROOT/'manifests/asset-inventory.json').read_text())
    seen = set()
    for entry in manifest['files']:
        rel = entry['path']
        path = (ROOT/rel).resolve()
        assert path.is_relative_to(ROOT), f'Path escapes archive: {rel}'
        assert rel not in seen, f'Duplicate manifest entry: {rel}'
        seen.add(rel)
        assert path.is_file(), f'Missing: {rel}'
        data = path.read_bytes()
        assert len(data) == entry['bytes'], f'Size mismatch: {rel}'
        assert hashlib.sha256(data).hexdigest() == entry['sha256'], f'SHA-256 mismatch: {rel}'
    assert seen == {p.relative_to(ROOT).as_posix() for p in included_files()}, 'File set differs; review and refresh intentionally.'
    assert manifest['file_count'] == len(seen)
    assert manifest['total_bytes'] == sum(e['bytes'] for e in manifest['files'])
    assert {r['id'] for r in inventory['assets']} == set(SPECS)
    assert inventory['asset_count'] == len(SPECS)
    model_count = 0
    for asset in inventory['assets']:
        ref = ROOT/asset['reference']
        assert ref.is_file(), f'Missing reference for {asset["id"]}'
        assert hashlib.sha256(ref.read_bytes()).hexdigest() == asset['reference_sha256']
        assert set(asset['versions']) == set(VERSIONS)
        for version, entry in asset['versions'].items():
            summary = glb_summary(ROOT/entry['path'])
            for key, value in summary.items():
                assert value == entry[key], f'{asset["id"]}/{version}: {key}'
            model_count += 1
    assert model_count == inventory['model_file_count']
    for entry in inventory['reference_only']:
        assert (ROOT/entry['reference']).is_file()
    for version in VERSIONS:
        for key in ('bytes', 'triangles'):
            assert inventory['totals'][version][key] == sum(a['versions'][version][key] for a in inventory['assets'])
    # Resolve Markdown file links. Web links and in-document headings are not fetched.
    links = 0
    for rel in sorted(seen):
        path = ROOT/rel
        if path.suffix != '.md':
            continue
        for raw in re.findall(r'!?\[[^\]\n]*\]\(([^)\n]+)\)', path.read_text()):
            target = raw.strip().strip('<>').split(' "', 1)[0]
            url = urlsplit(target)
            if url.scheme or not url.path:
                continue
            local = (path.parent/unquote(url.path)).resolve()
            assert local.is_relative_to(ROOT) and local.exists(), f'Broken local link: {rel} -> {target}'
            links += 1
    print(json.dumps({'status': 'PASS', 'files': len(seen), 'model_files': model_count,
                      'local_markdown_links': links, 'total_bytes': manifest['total_bytes'],
                      'compact_bytes': inventory['totals']['compact']['bytes'],
                      'scope': 'File integrity, GLB metadata and local links; not visual or mobile acceptance.'}))


if __name__ == '__main__':
    check()

"""Verify real outputs independently of encoder execution, without network access."""
import copy
import json
from compress_glb_textures import ROOT, WEBP, unpack, view_bytes, pixels, measure, sha

report = json.loads((ROOT / 'scene-lab/assets/texture-compression-report.json').read_text())
for asset in report['assets']:
    source = (ROOT / asset['source']).read_bytes()
    output = (ROOT / asset['output']).read_bytes()
    assert sha(source) == asset['source_sha256'] and sha(output) == asset['output_sha256']
    a, ab = unpack(source)
    b, bb = unpack(output)
    image_views = {im['bufferView'] for im in a['images']}
    assert len(a['bufferViews']) == len(b['bufferViews'])
    for i in range(len(a['bufferViews'])):
        if i not in image_views:
            assert view_bytes(a, ab, i) == view_bytes(b, bb, i), 'Geometry/animation changed.'
    for row, src, dst in zip(asset['images'], a['images'], b['images'], strict=True):
        before = view_bytes(a, ab, src['bufferView'])
        after = view_bytes(b, bb, dst['bufferView'])
        assert sha(before) == row['before_sha256'] and sha(after) == row['after_sha256']
        assert pixels(before)[0] == pixels(after)[0]
        if row['role'] == 'data':
            assert pixels(before) == pixels(after), 'Normal/material data changed.'
        else:
            metric = measure(before, after)
            assert metric['psnr'] is None or (metric['psnr'] >= 42 and metric['mae'] <= 1.5)
    # Remove only changes authorized for encoding/repacking; all other JSON must match.
    restored = copy.deepcopy(b)
    restored['bufferViews'] = a['bufferViews']
    restored['buffers'] = a['buffers']
    for src, dst in zip(a['images'], restored['images'], strict=True):
        dst['mimeType'] = src['mimeType']
    for src, dst in zip(a['textures'], restored['textures'], strict=True):
        if WEBP in dst.get('extensions', {}):
            dst['source'] = dst['extensions'].pop(WEBP)['source']
            assert dst['source'] == src['source']
            if not dst['extensions']:
                del dst['extensions']
    for key in ('extensionsRequired', 'extensionsUsed'):
        if key in a:
            restored[key] = [v for v in restored[key] if v != WEBP]
            assert set(restored[key]) == set(a[key])
            restored[key] = a[key]
        else:
            assert restored.pop(key, []) == [WEBP]
    assert restored == a, 'Unexpected model, material, or texture-link changes.'
    print(f"PASS {asset['id']}: geometry/PBR/transforms unchanged; exact data pixels; color error gate; hashes.")
print('TOTAL', sum(a['before_bytes'] for a in report['assets']), '->', sum(a['after_bytes'] for a in report['assets']), 'bytes')

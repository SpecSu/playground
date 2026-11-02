"""Offline texture derivatives. Never overwrite runtime.glb or change geometry.

PNG data maps: choose the smallest exact-pixel encoding (PNG / Oxipng / WebP).
JPEG base color: compare MozJPEG 90/93 (4:4:4) and WebP 95; keep only candidates
with PSNR >= 42 dB and mean absolute RGB error <= 1.5 / 255. These numerical
gates supplement, rather than replace, a browser visual review.
"""
import argparse
import copy
import hashlib
import io
import json
import math
from pathlib import Path
import struct
import subprocess
import tempfile

import numpy as np
import oxipng
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
WEBP = 'EXT_texture_webp'
sha = lambda b: hashlib.sha256(b).hexdigest()


def unpack(raw):
    assert raw[:4] == b'glTF' and struct.unpack_from('<II', raw, 4) == (2, len(raw))
    size, kind = struct.unpack_from('<II', raw, 12)
    assert kind == 0x4e4f534a
    doc = json.loads(raw[20:20 + size])
    length, kind = struct.unpack_from('<II', raw, 20 + size)
    assert kind == 0x004e4942 and 28 + size + length == len(raw)
    assert len(doc['buffers']) == 1 and not doc['buffers'][0].get('uri')
    assert not any(x.get('uri') for x in doc.get('images', []))
    return doc, raw[28 + size:]


def view_bytes(doc, binary, index):
    view = doc['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return binary[start:start + view['byteLength']]


def pixels(data):
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    return im.size, im.tobytes()


def measure(original, candidate):
    a = np.asarray(Image.open(io.BytesIO(original)).convert('RGB'), dtype=np.float64)
    b = np.asarray(Image.open(io.BytesIO(candidate)).convert('RGB'), dtype=np.float64)
    assert a.shape == b.shape
    delta = a - b
    mse = float(np.mean(delta * delta))
    return {'psnr': 10 * math.log10(255 ** 2 / mse) if mse else None,
            'mae': float(np.mean(abs(delta)))}


def encode_image(data, mime, color, temp):
    im = Image.open(io.BytesIO(data))
    # Reject unexpected profiles rather than silently change their interpretation.
    assert not im.info.get('icc_profile'), 'Profiled source needs explicit color handling.'
    candidates = [('original', mime, data)]
    if mime == 'image/png':
        candidates.append(('oxipng4', mime, oxipng.optimize_from_memory(data, level=4, optimize_alpha=False)))
        out = io.BytesIO()
        im.save(out, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        candidates.append(('webp-lossless', 'image/webp', out.getvalue()))
    elif mime == 'image/jpeg' and color:
        src = temp / 'source.jpg'
        src.write_bytes(data)
        subprocess.run(['node', str(ROOT / 'tools/mesh-tools/jpeg-candidates.mjs'), str(src), str(temp / 'color')], check=True)
        for q in (90, 93):
            candidates.append((f'mozjpeg{q}', mime, (temp / f'color-mozjpeg{q}.jpg').read_bytes()))
        out = io.BytesIO()
        im.save(out, 'WEBP', quality=95, method=6)
        candidates.append(('webp95', 'image/webp', out.getvalue()))
    rows, eligible = [], []
    for name, fmt, encoded in candidates:
        assert Image.open(io.BytesIO(encoded)).size == im.size
        metrics = measure(data, encoded)
        if mime == 'image/png':
            assert pixels(data) == pixels(encoded), 'Data-map pixels changed.'
            accepted = True
        else:
            accepted = metrics['psnr'] is None or (metrics['psnr'] >= 42 and metrics['mae'] <= 1.5)
        row = {'codec': name, 'mime': fmt, 'bytes': len(encoded), 'eligible': accepted, **metrics}
        rows.append(row)
        if accepted:
            eligible.append((encoded, row))
    encoded, selected = min(eligible, key=lambda x: len(x[0]))
    return encoded, selected, rows


def build(source):
    raw = source.read_bytes()
    original, binary = unpack(raw)
    doc = copy.deepcopy(original)
    color_images = {doc['textures'][m['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
                    for m in doc.get('materials', []) if 'baseColorTexture' in m.get('pbrMetallicRoughness', {})}
    replacements, rows, webp_images = {}, [], set()
    with tempfile.TemporaryDirectory(dir=ROOT / 'work', prefix='texture-') as temp:
        for i, im in enumerate(doc['images']):
            index = im['bufferView']
            before = view_bytes(original, binary, index)
            after, selected, candidates = encode_image(before, im['mimeType'], i in color_images, Path(temp))
            replacements[index] = after
            im['mimeType'] = selected['mime']
            if selected['mime'] == 'image/webp':
                webp_images.add(i)
            rows.append({'index': i, 'role': 'color' if i in color_images else 'data',
                         'dimensions': list(Image.open(io.BytesIO(before)).size),
                         'before_bytes': len(before), 'before_sha256': sha(before),
                         'after_sha256': sha(after), 'selected': selected, 'candidates': candidates})
    for texture in doc['textures']:
        if texture.get('source') in webp_images:
            texture.setdefault('extensions', {})[WEBP] = {'source': texture.pop('source')}
    if webp_images:
        for key in ('extensionsUsed', 'extensionsRequired'):
            doc[key] = sorted(set(doc.get(key, [])) | {WEBP})
    packed = bytearray()
    for i, view in enumerate(doc['bufferViews']):
        chunk = replacements.get(i, view_bytes(original, binary, i))
        packed.extend(b'\0' * (-len(packed) % 4))
        view.update(byteOffset=len(packed), byteLength=len(chunk), buffer=0)
        packed.extend(chunk)
    doc['buffers'] = [{'byteLength': len(packed)}]
    packed.extend(b'\0' * (-len(packed) % 4))
    js = json.dumps(doc, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    output = b'glTF' + struct.pack('<IIII', 2, 28 + len(js) + len(packed), len(js), 0x4e4f534a) + js
    output += struct.pack('<II', len(packed), 0x004e4942) + packed
    for i in range(len(original['bufferViews'])):
        if i not in replacements:
            assert view_bytes(original, binary, i) == view_bytes(doc, packed, i)
    for key in ('accessors', 'meshes', 'materials', 'nodes', 'scenes', 'samplers'):
        assert original.get(key) == doc.get(key)
    assert len(output) <= len(raw)
    target = source.with_name('compact.glb')
    target.write_bytes(output)
    result = {'id': source.parent.name, 'source': str(source.relative_to(ROOT)), 'source_sha256': sha(raw),
              'output': str(target.relative_to(ROOT)), 'output_sha256': sha(output),
              'before_bytes': len(raw), 'after_bytes': len(output), 'images': rows}
    target.with_suffix('.json').write_text(json.dumps(result, indent=2) + '\n')
    print(f'{source.parent.name}: {len(raw):,} -> {len(output):,} bytes', flush=True)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('sources', nargs='*', type=Path)
    args = parser.parse_args()
    sources = args.sources or sorted((ROOT / 'scene-lab/assets/models').glob('*/runtime.glb'))
    (ROOT / 'work').mkdir(exist_ok=True)
    report = {'version': '0.5', 'webp_version': features.version('webp'),
              'data_maps': 'exact decoded RGBA pixels', 'color_gate': {'psnr_min': 42, 'mae_max': 1.5},
              'assets': [build(p.resolve()) for p in sources]}
    (ROOT / 'scene-lab/assets/texture-compression-report.json').write_text(json.dumps(report, indent=2) + '\n')

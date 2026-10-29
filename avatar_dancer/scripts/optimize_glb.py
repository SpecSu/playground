#!/usr/bin/env python3
"""Lossless geometry/rig/animation GLB repacker with bounded texture resizing.

Original files are read only. Existing image formats and material semantics stay intact.
Usage: python scripts/optimize_glb.py INPUT.glb OUTPUT.glb [--diffuse-max 4096]
"""
import argparse
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import struct
from PIL import Image

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
TYPE_COMPONENTS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT2': 4, 'MAT3': 9, 'MAT4': 16}
COMPONENT_BYTES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}

def read_glb(path):
    data = Path(path).read_bytes()
    assert len(data) >= 20, 'GLB too short'
    magic, version, total = struct.unpack_from('<4sII', data)
    assert magic == b'glTF' and version == 2 and total == len(data), 'Invalid GLB header'
    chunks = []
    offset = 12
    while offset < total:
        size, kind = struct.unpack_from('<II', data, offset)
        assert size % 4 == 0 and offset + 8 + size <= total, 'Invalid chunk boundary'
        chunks.append((kind, data[offset + 8:offset + 8 + size]))
        offset += 8 + size
    assert len(chunks) == 2 and chunks[0][0] == JSON_CHUNK and chunks[1][0] == BIN_CHUNK, 'Expected embedded JSON+BIN GLB'
    document = json.loads(chunks[0][1])
    assert len(document['buffers']) == 1 and 'uri' not in document['buffers'][0], 'External/multiple buffers unsupported'
    return document, chunks[1][1], data

def view_bytes(document, binary, index):
    view = document['bufferViews'][index]
    assert view.get('buffer', 0) == 0
    start = view.get('byteOffset', 0)
    return binary[start:start + view['byteLength']]

def validate(document, binary):
    assert document['buffers'][0]['byteLength'] <= len(binary)
    views = document.get('bufferViews', [])
    for view in views:
        start = view.get('byteOffset', 0)
        assert view.get('buffer', 0) == 0 and start >= 0 and start % 4 == 0
        assert view['byteLength'] >= 0 and start + view['byteLength'] <= document['buffers'][0]['byteLength']
    for accessor in document.get('accessors', []):
        if 'bufferView' not in accessor:
            continue
        view = views[accessor['bufferView']]
        component = COMPONENT_BYTES[accessor['componentType']]
        element = component * TYPE_COMPONENTS[accessor['type']]
        # MAT2/MAT3 columns are padded to four bytes by glTF for sub-32-bit components.
        if accessor['type'].startswith('MAT'):
            side = int(accessor['type'][-1]); element = ((side * component + 3) // 4) * 4 * side
        stride = view.get('byteStride', element)
        assert stride >= element
        end = accessor.get('byteOffset', 0) + max(0, accessor['count'] - 1) * stride + (element if accessor['count'] else 0)
        assert end <= view['byteLength'], 'Accessor out of bounds'
        if 'sparse' in accessor:
            sparse = accessor['sparse']
            for key in ('indices', 'values'):
                entry = sparse[key]; sv = views[entry['bufferView']]
                size = COMPONENT_BYTES[entry['componentType']] if key == 'indices' else element
                assert entry.get('byteOffset', 0) + sparse['count'] * size <= sv['byteLength']
    for image in document.get('images', []):
        assert 'bufferView' in image, 'External image unsupported'
        Image.open(io.BytesIO(view_bytes(document, binary, image['bufferView']))).verify()

def image_roles(document):
    roles = {i: set() for i in range(len(document.get('images', [])))}
    def add(texture, role):
        if texture is not None:
            source = document['textures'][texture['index']].get('source')
            if source is not None: roles[source].add(role)
    for material in document.get('materials', []):
        pbr = material.get('pbrMetallicRoughness', {})
        add(pbr.get('baseColorTexture'), 'diffuse')
        add(pbr.get('metallicRoughnessTexture'), 'orm')
        add(material.get('normalTexture'), 'normal')
        add(material.get('occlusionTexture'), 'orm')
        add(material.get('emissiveTexture'), 'emissive')
    return roles

def metrics(document, binary, file_bytes):
    roles = image_roles(document)
    images = []
    for i, record in enumerate(document.get('images', [])):
        payload = view_bytes(document, binary, record['bufferView'])
        with Image.open(io.BytesIO(payload)) as image:
            width, height = image.size
        images.append({'index': i, 'name': record.get('name'), 'roles': sorted(roles[i]), 'width': width, 'height': height,
                       'encoded_bytes': len(payload), 'estimated_rgba_mipmap_bytes': round(width * height * 4 * 4 / 3)})
    return {'file_bytes': file_bytes, 'images': images, 'estimated_rgba_mipmap_mib': round(sum(x['estimated_rgba_mipmap_bytes'] for x in images) / 1048576, 2),
            'meshes': len(document.get('meshes', [])), 'skins': len(document.get('skins', [])), 'animations': len(document.get('animations', [])),
            'accessors': len(document.get('accessors', [])), 'buffer_views': len(document.get('bufferViews', []))}

def optimize(source, destination, diffuse_max=4096, data_max=2048):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    assert source != destination, 'Never overwrite original'
    original, binary, raw = read_glb(source)
    validate(original, binary)
    source_digest = hashlib.sha256(raw).hexdigest()
    edited = copy.deepcopy(original)
    roles = image_roles(original)
    replacements = {}
    image_views = {image['bufferView'] for image in original.get('images', [])}
    accessor_views = {a['bufferView'] for a in original.get('accessors', []) if 'bufferView' in a}
    assert not image_views & accessor_views, 'Image view shared with accessor; aborting'
    for i, record in enumerate(original.get('images', [])):
        view = record['bufferView']; payload = view_bytes(original, binary, view)
        cap = diffuse_max if ('diffuse' in roles[i] or 'emissive' in roles[i] or not roles[i]) else data_max
        with Image.open(io.BytesIO(payload)) as image:
            image.load()
            if max(image.size) <= cap: continue
            factor = cap / max(image.size)
            resized = image.resize((max(1, round(image.width * factor)), max(1, round(image.height * factor))), Image.Resampling.LANCZOS)
            out = io.BytesIO()
            mime = record['mimeType']
            if mime == 'image/png': resized.save(out, format='PNG', optimize=True)
            elif mime == 'image/jpeg': resized.convert('RGB').save(out, format='JPEG', quality=95, subsampling=0, optimize=True)
            else: raise ValueError('Unsupported image format: ' + mime)
            replacements[view] = out.getvalue()
    repacked = bytearray()
    for index, view in enumerate(edited['bufferViews']):
        repacked.extend(b'\0' * (-len(repacked) % 4))
        payload = replacements.get(index, view_bytes(original, binary, index))
        view['byteOffset'] = len(repacked); view['byteLength'] = len(payload)
        repacked.extend(payload)
    edited['buffers'][0]['byteLength'] = len(repacked)
    json_chunk = json.dumps(edited, ensure_ascii=False, separators=(',', ':')).encode()
    json_chunk += b' ' * (-len(json_chunk) % 4)
    repacked.extend(b'\0' * (-len(repacked) % 4))
    output = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(json_chunk) + 8 + len(repacked))
    output += struct.pack('<II', len(json_chunk), JSON_CHUNK) + json_chunk + struct.pack('<II', len(repacked), BIN_CHUNK) + repacked
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.glb.tmp'); temporary.write_bytes(output)
    # Reopen serialized output before promotion; compare all non-image bytes and structure.
    check, check_bin, _ = read_glb(temporary); validate(check, check_bin)
    for key in original:
        if key not in ('buffers', 'bufferViews'): assert original[key] == check[key], 'Changed semantic JSON: ' + key
    for index, view in enumerate(original['bufferViews']):
        unchanged = {k: v for k, v in view.items() if k not in ('byteOffset', 'byteLength')}
        assert unchanged == {k: v for k, v in check['bufferViews'][index].items() if k not in ('byteOffset', 'byteLength')}
        if index not in replacements: assert view_bytes(original, binary, index) == view_bytes(check, check_bin, index), 'Non-image data mutated'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == source_digest, 'Original changed unexpectedly'
    os.replace(temporary, destination)
    result = {'source': str(source), 'destination': str(destination), 'source_sha256': source_digest, 'output_sha256': hashlib.sha256(output).hexdigest(),
              'settings': {'diffuse_max': diffuse_max, 'normal_orm_max': data_max}, 'before': metrics(original, binary, len(raw)), 'after': metrics(check, check_bin, len(output)),
              'verification': {'all_non_image_view_bytes_identical': True, 'semantic_json_identical': True, 'source_unchanged': True, 'accessor_and_view_bounds_valid': True},
              'memory_note': 'RGBA8 plus complete mip chain estimate; not measured GPU memory.'}
    destination.with_suffix('.metrics.json').write_text(json.dumps(result, indent=2))
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source'); parser.add_argument('destination')
    parser.add_argument('--diffuse-max', type=int, default=4096); parser.add_argument('--data-max', type=int, default=2048)
    args = parser.parse_args()
    assert args.diffuse_max > 0 and args.data_max > 0
    print(json.dumps(optimize(args.source, args.destination, args.diffuse_max, args.data_max), indent=2))

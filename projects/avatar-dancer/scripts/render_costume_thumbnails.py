#!/usr/bin/env python3
"""Render all six actual costume GLBs, then encode web thumbnails and QA evidence.

Run from any directory: python scripts/render_costume_thumbnails.py
Requires Blender and Pillow. Never modifies source GLBs or publishes any files.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
NAMES = ['jiji-0', 'jiji-1', 'jiji-2', 'lx-0', 'lx-1', 'lx-2']
LABELS = ['JIJI / CRIMSON', 'JIJI / NEON', 'JIJI / PEARL', 'LX / SILVER', 'LX / VIOLET', 'LX / RED']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--names', nargs='+', choices=NAMES, default=NAMES, help='Render only selected outfits; preserve all other assets and provenance')
    parser.add_argument('--blender', default='/usr/bin/blender')
    parser.add_argument('--evidence-dir', type=Path, default=ROOT.parent / 'dance-stage-work' / 'costume-thumbnails')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'public/assets/thumbs')
    args = parser.parse_args()
    args.evidence_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGB', (384 * 3, 552 * 2), '#17191f')
    draw = ImageDraw.Draw(sheet)
    provenance_path = args.evidence_dir / 'thumbnail-provenance.json'
    records_by_name = {row['name']: row for row in json.loads(provenance_path.read_text())} if provenance_path.exists() else {}
    manifest = json.loads((ROOT / 'public/assets/characters/manifest.json').read_text())
    for name in args.names:
        index = NAMES.index(name)
        source = ROOT / 'public/assets/characters' / f'{name}.glb'
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
        character, outfit = name.split('-')
        target_height = manifest['characters'][character]['outfits'][int(outfit)]['height']
        framing_multiplier = 1.9 / target_height
        command = [args.blender, '-b', '--factory-startup', '--python', str(ROOT / 'scripts/render_character.py'), '--',
                   '--input', str(source), '--output', str(args.evidence_dir), '--costume-preview', '--front-axis', '+x',
                   '--resolution', '512', '--samples', '128', '--threads', '4',
                   '--framing-height-multiplier', str(framing_multiplier)]
        with (args.evidence_dir / f'{name}.log').open('w') as log:
            subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
        if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
            raise RuntimeError(f'{name} changed during rendering; rerun after source assets are finalized')
        image = Image.open(args.evidence_dir / f'{name}-costume.png').convert('RGB')
        assert image.size == (384, 512)
        output = args.output_dir / f'{name}.webp'
        image.save(output, 'WEBP', quality=84, method=6)
        records_by_name[name] = {'name': name, 'source_sha256': digest, 'dimensions': list(image.size), 'webp_bytes': output.stat().st_size, 'webp_sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'framing_height_multiplier': framing_multiplier, 'manifest_height': target_height}
        print(f'{name}: {output.stat().st_size:,} bytes', flush=True)
    for index, name in enumerate(NAMES):
        output = args.output_dir / f'{name}.webp'
        if output.exists():
            x, y = index % 3 * 384, index // 3 * 552
            sheet.paste(Image.open(output), (x, y))
            draw.text((x + 18, y + 525), LABELS[index], fill='#f2f0ec')
    records = [records_by_name[name] for name in NAMES if name in records_by_name]
    sheet.save(args.evidence_dir / 'costume-contact-sheet.jpg', quality=92)
    sheet.crop((0, 0, 1152, 552)).save(args.evidence_dir / 'jiji-costume-contact-sheet.jpg', quality=92)
    (args.evidence_dir / 'thumbnail-provenance.json').write_text(json.dumps(records, indent=2) + '\n')
    print(f'Contact sheet: {args.evidence_dir / "costume-contact-sheet.jpg"}')


if __name__ == '__main__':
    main()

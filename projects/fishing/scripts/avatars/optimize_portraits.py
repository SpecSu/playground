"""Encode derived model render portraits for tiny selectors, never source illustrations."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT.parent / 'avatar-offline-previews' / 'portraits-source'
DESTINATION = ROOT / 'public' / 'avatars' / 'portraits'
DESTINATION.mkdir(exist_ok=True)
for kind in ('human-jiji', 'human-subeike', 'human-lx'):
    image = Image.open(SOURCE / (kind + '.png')).convert('RGBA')
    image.resize((256, 256), Image.Resampling.LANCZOS).save(DESTINATION / (kind + '.webp'), 'WEBP', quality=83, method=6)
    output = DESTINATION / (kind + '.webp')
    assert output.stat().st_size < 30_000, f'Portrait exceeds selector budget: {output}'
    print(kind, output.stat().st_size, 'bytes')

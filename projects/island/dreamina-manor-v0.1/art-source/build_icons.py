"""Artist-authored code-native packet icons. No game rules or UI rendering."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/world/icons'; OUT.mkdir(parents=True,exist_ok=True)
colours=['#69836B','#628A9F','#C08A60','#9276A5','#B69B54']
# Numerals are vector paths, independent of platform fonts.
numbers=['M47 45 L50 42 V52 M47 52 H53','M46 44 Q50 39 53 44 Q54 46 46 52 H54','M46 43 Q53 39 53 44 Q53 47 49 47 Q55 47 53 51 Q50 54 46 51','M52 52 V42 L46 49 H55','M54 42 H47 V46 Q54 44 54 49 Q53 54 46 51']
for kind in ['seed','bait']:
 for i,c in enumerate(colours):
  glyph='<path d="M32 37 V26" stroke="#466A55" stroke-width="2.4"/><path d="M31 31 C22 32 21 23 23 22 C30 22 33 27 31 31Z" fill="#719260"/><path d="M33 28 C33 21 39 19 42 20 C43 26 37 30 33 28Z" fill="#8FAA78"/><ellipse cx="31" cy="39" rx="5" ry="3" fill="#B9A984"/>' if kind=='seed' else '<path d="M25 24 C37 18 43 24 36 29 C28 34 24 34 28 40" fill="none" stroke="#BA785A" stroke-width="5.5" stroke-linecap="round"/><path d="M28 24 L29 28 M34 23 L35 27 M35 30 L38 32 M28 34 L30 37" stroke="#8E5E48" stroke-width="1.3" stroke-linecap="round"/><circle cx="42" cy="37" r="3" fill="#9E8E63"/>'
  svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="{kind} tier {i+1}">
<path d="M17 9 H44 L49 15 V48 Q49 53 44 53 H18 Q13 53 13 48 V14 Q13 9 17 9Z" fill="#EEE4CC" stroke="#597260" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M15 16 H47 M17 12 H43" stroke="#C7BDA7" stroke-width="1.4" stroke-linecap="round"/>
<path d="M14 44 H48 V48 Q48 52 44 52 H18 Q14 52 14 48Z" fill="{c}" opacity=".28"/>
{glyph}
<circle cx="50" cy="47" r="10.5" fill="{c}" stroke="#F2EAD7" stroke-width="2.4"/>
<path d="{numbers[i]}" fill="none" stroke="#FFF8E9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>'''
  (OUT/f'{kind}-{i+1}.svg').write_text(svg)
try:
 import cairosvg
 from PIL import Image
 canvas=Image.new('RGB',(640,256),'#e5eade')
 for row,kind in enumerate(['seed','bait']):
  for i in range(5):
   p=OUT/f'{kind}-{i+1}.svg';dest=ROOT/'art-source'/f'icon-{kind}-{i+1}.png'
   cairosvg.svg2png(url=str(p),write_to=str(dest),output_width=128,output_height=128)
   im=Image.open(dest);canvas.paste(im,(i*128,row*128),im)
 canvas.save(ROOT.parent/'art-evidence'/'07-packet-icons-art.png')
except ImportError as e:print('SVG files ready; raster inspection unavailable:',e)

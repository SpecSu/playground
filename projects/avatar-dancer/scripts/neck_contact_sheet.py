"""Compose labeled evidence sheets from actual Blender PNG renders only."""
import sys,json,hashlib
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
source=Path(sys.argv[1]);dest=Path(sys.argv[2]);stem=sys.argv[3];files=sorted(source.glob(stem+'-*.png'));assert len(files)==22,(source,len(files));font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13);large=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22);w=384;h=410;out=Image.new('RGB',(w*6,55+h*4),'#25292d');draw=ImageDraw.Draw(out);draw.text((15,12),stem.upper()+' / REAL GLB MESH / REST ORBITS + 3 DANCE CLIPS',fill='white',font=large)
for i,f in enumerate(files):
 x=i%6*w;y=55+i//6*h;out.paste(Image.open(f).convert('RGB').resize((w,w),Image.Resampling.LANCZOS),(x,y));label=f.stem.replace(stem+'-','').replace('_Armature','').replace('dance_','DANCE ');draw.text((x+8,y+w+5),label,fill='white',font=font)
dest.parent.mkdir(parents=True,exist_ok=True);out.save(dest,quality=92);print(dest)

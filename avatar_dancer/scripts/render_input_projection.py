"""Offline diagnostic only: actual skinned vertices, untextured painter projection."""
import json,sys
from PIL import Image,ImageDraw,ImageFont
source=sys.argv[1] if len(sys.argv)>1 else 'qa/input-motion/projections.json'
dest=sys.argv[2] if len(sys.argv)>2 else 'qa/input-motion/controller-contact-sheet.png'
rows=json.load(open(source));w,h=250,370
im=Image.new('RGB',(w*7,h*((len(rows)+6)//7)+65),'#10151d');d=ImageDraw.Draw(im);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',13)
d.text((15,12),'OFFLINE ACTUAL-SKIN PROJECTION | untextured, not browser | '+str(rows[0].get('bpm',128))+' BPM',font=font,fill='#d5e6f1')
for k,row in enumerate(rows):
 ox=(k%7)*w;oy=(k//7)*h+50;tris=[]
 for mesh in row['meshes']:
  v=mesh['vertices'];idx=mesh['indices']
  for i in range(0,len(idx),3):
   ps=[v[idx[i+j]]for j in range(3)];zs=sum(p[2]for p in ps)/3
   points=[(ox+(p[0]+1)*w/2,oy+((1-p[1])/2-.10)/.57*(h-35))for p in ps]
   tris.append((zs,points,(198,177,160)if mesh['head']else(139,153,194)))
 for _,ps,c in sorted(tris,reverse=True):d.polygon(ps,fill=c)
 d.text((ox+8,oy+h-33),row['name']+'  '+row['label'],font=font,fill='#d9f68b')
 d.line((ox,oy+h-2,ox+w,oy+h-2),fill='#2d3743')
im.save(dest)

"""Assemble labelled deliverables from the actual Blender-rendered frames."""
from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw,ImageFont
HERE=Path(__file__).resolve().parent;P=HERE/'preview'
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';bold='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
seq=[('idle',.5),('walk',2.4),('drink_enter',1.1),('drink_loop',2.6),('drink_exit',1.3),('idle',.5)]
expected=sum(round(d*12) for _,d in seq)
assert all((P/f'frame-{i:04}.png').is_file() for i in range(expected)),f'Expected {expected} rendered frames before packaging.'
filters=["pad=512:640:0:64:color=0x2D3D31",f"drawtext=fontfile={bold}:text='RIGGED COW / MOTION STUDY':x=(w-tw)/2:y=13:fontsize=20:fontcolor=0xFFF9E9",f"drawtext=fontfile={font}:text='OFFLINE BLENDER RENDER - NOT A GAME CAPTURE':x=(w-tw)/2:y=40:fontsize=11:fontcolor=0xCCD7C6"]
labels={'idle':('IDLE','Soft secondary motion / planted hooves'),'walk':('WALK - IN PLACE','4-beat gait / bent swing legs / foot contact'),'drink_enter':('DRINK - LOWER','Two neck bones / continuous weighted hide'),'drink_loop':('DRINK - SIP','Mouth at water / four hooves remain planted'),'drink_exit':('DRINK - RISE','Return to idle through the same skeletal rig')}
start=0
for kind,d in seq:
 end=start+round(d*12)/12;title,sub=labels[kind]
 for text,y,size,ff,color in [(title,587,20,bold,'FFF9E9'),(sub,616,12,font,'CCD7C6')]:
  filters.append(f"drawtext=fontfile={ff}:text='{text}':x=(w-tw)/2:y={y}:fontsize={size}:fontcolor=0x{color}:enable='gte(t,{start})*lt(t,{end})'")
 start=end
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-framerate','12','-i',str(P/'frame-%04d.png'),'-frames:v',str(expected),'-vf',','.join(filters),'-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(P/'cow-animation-offline.mp4')],check=True)
thumbs=[('still-00-idle.png','01  IDLE'),('still-01-walk.png','02  WALK - STANCE'),('still-02-walk.png','03  WALK - SWING'),('still-03-drink_enter.png','04  LOWER TO WATER'),('still-04-drink_loop.png','05  SIP AT THE SURFACE'),('still-05-drink_exit.png','06  RISE TO IDLE')]
canvas=Image.new('RGB',(1152,952),'#2d3d31');draw=ImageDraw.Draw(canvas)
draw.text((28,18),'BLENDER COW / RIGGED ANIMATION STUDY',font=ImageFont.truetype(bold,29),fill='#fff9e9')
draw.text((28,57),'Actual offline Blender renders. Not browser/WebGL evidence. 26 bones / 5 reusable clips.',font=ImageFont.truetype(font,17),fill='#ccd7c6')
for i,(name,label) in enumerate(thumbs):
 x=(i%3)*384;y=96+(i//3)*428;im=Image.open(P/name).convert('RGB').resize((384,384),Image.Resampling.LANCZOS);canvas.paste(im,(x,y));draw.text((x+16,y+395),label,font=ImageFont.truetype(bold,17),fill='#fff9e9')
canvas.save(P/'cow-animation-contact-sheet.jpg',quality=93)
print(json.dumps({'video':str(P/'cow-animation-offline.mp4'),'contact_sheet':str(P/'cow-animation-contact-sheet.jpg'),'frames':expected,'fps':12,'duration':expected/12},indent=2))

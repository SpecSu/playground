import json,sys
from pathlib import Path
p=Path(sys.argv[1]).resolve();m=json.load(open(p/'metadata.json'))
def stamp(t):
 h=int(t//3600);mi=int(t//60)%60;s=int(t)%60;ms=round((t-int(t))*1000);return f'{h:02}:{mi:02}:{s:02},{ms:03}'
segments=[]
for row in m['states']:
 label='OFFLINE STUDIO / NOT BROWSER FOOTAGE (15fps)\n'+row['label']+'\n'+row['state'].upper()+'  |  '+row['clip']
 if not segments or label!=segments[-1]['label']:segments.append({'start':row['time'],'end':row['time']+1/m['fps'],'label':label})
 else:segments[-1]['end']=row['time']+1/m['fps']
with open(p/'captions.srt','w')as f:
 for i,s in enumerate(segments):f.write(f"{i+1}\n{stamp(s['start'])} --> {stamp(s['end'])}\n{s['label']}\n\n")
print(segments)

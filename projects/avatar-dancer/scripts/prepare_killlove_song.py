#!/usr/bin/env python3
"""Build the user-approved full-source KILLLOVE exception and extended chart.
Usage: python scripts/prepare_killlove_song.py --source /private/path/killlove.mp3
No download/upload; no existing song is touched. Requires ffmpeg,numpy,scipy.
"""
import argparse,json,pathlib,subprocess
import numpy as np
from scipy.signal import stft,find_peaks
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',default='public/assets/audio');a=p.parse_args();source=pathlib.Path(a.source);out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
sr=22050;x=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-ar',str(sr),'-ac','1','-f','f32le','pipe:1']),'<f4')
_,t,z=stft(x,sr,nperseg=1024,noverlap=803,boundary=None);flux=np.mean(np.maximum(0,np.diff(np.log1p(abs(z)*100),axis=1)),axis=0);t=t[1:];flux/=flux.max()
# Broad80–185BPM onset-grid search selected132; fit the whole excerpt precisely.
best=(-1,0,0)
for bpm in np.arange(131.8,132.201,.005):
 for anchor in np.arange(0,.041,.001):
  grid=anchor+np.arange(4,128)*60/bpm;score=float(np.mean(np.interp(grid,t,flux)))
  if score>best[0]:best=(score,float(bpm),float(anchor))
_,bpm,anchor=best;beat=60/bpm;previous_duration=anchor+128*beat;duration=len(x)/sr
assert 74<duration<76 and 55<previous_duration<60
peaks,_=find_peaks(flux,prominence=.045,distance=7);pt=t[peaks];strength=flux[peaks]
patterns=[[0,2,1,3],[1,3,0,2],[2,0,3,1],[3,1,2,0]];chart=[];evidence=[];pickups=[]
def add(grid,lane):
 j=int(np.argmin(abs(pt-grid)));delta=float(pt[j]-grid);snapped=abs(delta)<=.045 and strength[j]>=.10;at=float(pt[j]) if snapped else grid
 chart.append({'time':round(at,5),'lane':lane});evidence.append({'grid':round(grid,5),'time':round(at,5),'onsetDelta':round(delta,5),'snapped':bool(snapped),'strength':round(float(strength[j]),4)})
# Eight-beat reading entrance; half-time motifs through the actual energy drop
# around29–41s, then denser quarter-note movement through the return.
for bar in range(2,32):
 pattern=patterns[(bar//4)%4];steps=[0,2] if 16<=bar<23 else [0,1,2,3]
 if bar==31:steps=[0,1] # allow release and fade before the next phrase boundary
 for step in steps:
  add(anchor+(bar*4+step)*beat,pattern[step])
  if step==0 and bar in [6,14,26]:chart.append({'time':chart[-1]['time'],'lane':(pattern[step]+2)%4})
 if 4<=bar<16 or 24<=bar<30:
  for step in range(4):
   grid=anchor+(bar*4+step+.5)*beat;j=int(np.argmin(abs(pt-grid)))
   if abs(pt[j]-grid)<.045 and strength[j]>.16:pickups.append((float(strength[j]),grid,pattern[(step+2)%4]))
for _,grid,lane in sorted(pickups,reverse=True):
 if len(chart)>=112:break
 at=float(pt[int(np.argmin(abs(pt-grid)))]);at=round(at,5)
 if any(n['lane']==lane and abs(n['time']-at)<.16 for n in chart):continue
 add(grid,lane)
chart.sort(key=lambda n:(n['time'],n['lane']));assert len(chart)==112
# Keep that112-note prefix exactly; user explicitly requested the source EOF,
# not another60s excerpt. Fill the old fade/release gap and the final climax.
for pulse in range(126,163):
 bar,step=divmod(pulse,4);pattern=patterns[(bar//4)%4]
 add(anchor+pulse*beat,pattern[step])
 if step==0 and bar in [34,38]:chart.append({'time':chart[-1]['time'],'lane':(pattern[step]+2)%4})
chart.sort(key=lambda n:(n['time'],n['lane']));assert len(chart)==151
subprocess.run(['ffmpeg','-v','error','-i',str(source),'-af',f'atrim=start=0:duration={duration},asetpts=PTS-STARTPTS,volume=0.72,afade=t=in:st=0:d=0.45,afade=t=out:st={duration-.45}:d=0.45:curve=hsin','-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',str(out/'killlove-gameplay.mp3'),'-y'],check=True)
m={'title':'KILLLOVE','sourceLabel':'用户提供音频','bpm':round(bpm,3),'duration':round(duration,6),'offset':round(anchor,6),'audioUrl':'/assets/audio/killlove-gameplay.mp3?v=full-v13','sourceFilename':source.name,'sourceTrimStart':0,'fadeIn':.45,'fadeOut':.45,'durationPolicy':'user-approved-full-source-exception','sourceDecodedDuration':round(duration,6),'previousExcerptDuration':round(previous_duration,6),'chart':chart,'sections':[{'name':'entrance','start':0},{'name':'groove','start':round(anchor+8*beat,6)},{'name':'breakdown','start':round(anchor+64*beat,6)},{'name':'lift','start':round(anchor+92*beat,6)},{'name':'extended-climax','start':round(anchor+128*beat,6)}],'analysis':{'method':'broad onset-grid tempo search, original prefix grid retained, full-source EOF extension with measured transient snaps and authored phrase/lane motifs','matchedOnsets':sum(x['snapped']for x in evidence),'timedEvents':len(evidence),'gridEvidence':evidence}}
(out/'killlove-gameplay.metadata.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in m.items()if k not in ['chart','analysis']},ensure_ascii=False));print('notes',len(chart),'events',len(evidence),'snapped',m['analysis']['matchedOnsets'])

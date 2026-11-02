#!/usr/bin/env python3
"""Rebuild approved POPSTARS excerpt/chart from user's local source; never upload it.
Usage: python scripts/prepare_user_song.py --source /private/path/popstars.mp3
Requires ffmpeg, numpy, scipy. Raw source remains outside public/repository.
"""
import argparse,json,pathlib,subprocess,hashlib,tempfile
import numpy as np
from scipy.signal import stft,find_peaks

p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',default='public/assets/audio');p.add_argument('--track',choices=['popstars','fantastic'],default='popstars');args=p.parse_args()
source=pathlib.Path(args.source);out=pathlib.Path(args.output);out.mkdir(parents=True,exist_ok=True)
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-ar','22050','-ac','1','-f','f32le','pipe:1'])
x=np.frombuffer(raw,'<f4');rate=22050
_,t,z=stft(x,rate,nperseg=1024,noverlap=803,boundary=None)
e=np.mean(np.maximum(0,np.diff(np.log1p(abs(z)*100),axis=1)),axis=0);t=t[1:];e/=e.max()
# Narrow range established by full-track autocorrelation (85/170 half/double time).
best=(-1,0,0)
bpm_range=(169,171) if args.track=='popstars' else (129,131)
anchor_range=(7.07,7.151) if args.track=='popstars' else (1.73,1.801)
for bpm in np.arange(bpm_range[0],bpm_range[1]+.001,.01):
 for anchor in np.arange(*anchor_range,.002):
  grid=anchor+np.arange(148 if args.track=='popstars' else 122)*60/bpm;score=float(np.mean(np.interp(grid,t,e)))
  if score>best[0]:best=(score,float(bpm),float(anchor))
_,bpm,anchor=best;beat=60/bpm;start=0;duration=anchor+148*beat if args.track=='popstars' else anchor+124*beat
peaks,_=find_peaks(e,distance=7,prominence=.045);pt=t[peaks];strength=e[peaks]
patterns=[[0,2,1,3],[1,3,2,0],[0,1,3,2],[3,1,0,2]];chart=[];evidence=[]
def add(grid,lane,accent=False):
 j=int(np.argmin(abs(pt-grid)));delta=float(pt[j]-grid)
 snapped=abs(delta)<=.045 and strength[j]>=.10
 at=float(pt[j]) if snapped else grid
 chart.append({'time':round(at-start,5),'lane':lane})
 evidence.append({'grid':round(grid-start,5),'time':round(at-start,5),'onsetDelta':round(delta,5),'snapped':bool(snapped),'strength':round(float(strength[j]),4)})
 return at
# POPSTARS now starts at the recording's beginning; four-bar phrases end
# naturally at ~59.35s. Intro waits ~2.87s, then half-time motifs span the cut.
bars=range(-3,37) if args.track=='popstars' else range(1,30)
candidates=[]
for bar in bars:
 pattern=patterns[(bar//4)%4]
 sparse=not (0<=bar<4 or 8<=bar<12 or 32<=bar<36) if args.track=='popstars' else (bar<5 or 12<=bar<17)
 steps=([0] if args.track=='popstars' and bar==36 else [0,2]) if sparse else [0,1,2,3]
 for step in steps:
  grid=anchor+(bar*4+step)*beat;lane=pattern[step];add(grid,lane)
  accents=[4,12,32] if args.track=='popstars' else [8,18,26]
  if step==0 and bar in accents:chart.append({'time':chart[-1]['time'],'lane':(lane+2)%4})
 # Only existing half-beat attacks qualify; rank stronger rhythmic pickups first.
 energetic=(2<=bar<16 or 32<=bar<36) if args.track=='popstars' else (18<=bar<29)
 if energetic:
  for step in [0,1,2,3]:
   grid=anchor+(bar*4+step+.5)*beat;j=int(np.argmin(abs(pt-grid)))
   if abs(pt[j]-grid)<.045 and strength[j]>.10:
    candidates.append((float(strength[j]),grid,pattern[(step+2)%4]))
for _,grid,lane in sorted(candidates,reverse=True):
 if len(chart)>=112:break
 j=int(np.argmin(abs(pt-grid)));at=round(float(pt[j])-start,5)
 if any(n['lane']==lane and abs(n['time']-at)<.16 for n in chart):continue
 add(grid,lane)
chart.sort(key=lambda n:(n['time'],n['lane']))
# Gain reduction prevents decoded-source/MP3 intersample overs; ramps are baked in.
subprocess.run(['ffmpeg','-v','error','-i',str(source),'-af',f'atrim=start={start}:duration={duration},asetpts=PTS-STARTPTS,volume=0.72,afade=t=in:st=0:d=0.45,afade=t=out:st={duration-.7}:d=0.7','-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',str(out/f'{args.track}-gameplay.mp3'),'-y'],check=True)
metadata={'title':args.track.upper(),'sourceLabel':'用户提供音频','bpm':round(bpm,3),'duration':round(duration,6),'offset':round(anchor-start,6),'audioUrl':f'/assets/audio/{args.track}-gameplay.mp3','sourceFilename':source.name,'sourceTrimStart':round(start,6),'fadeIn':.45,'fadeOut':.7,'chart':chart,'sections':([{'name':'entrance','start':0},{'name':'groove','start':round(anchor,6)},{'name':'breakdown','start':round(anchor+64*beat,6)},{'name':'lift','start':round(anchor+128*beat,6)}] if args.track=='popstars' else [{'name':'entrance','start':0},{'name':'groove','start':round(anchor+4*beat,6)},{'name':'lift','start':round(anchor+72*beat,6)}]),'analysis':{'method':'spectral-flux grid fit + local onset snaps; authored lane/phrase pattern','matchedOnsets':sum(v['snapped'] for v in evidence),'timedEvents':len(evidence),'gridEvidence':evidence}}
(out/f'{args.track}-gameplay.metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in metadata.items() if k not in ['chart','analysis']},ensure_ascii=False));print('notes',len(chart),'snapped',metadata['analysis']['matchedOnsets'],'/',len(evidence))

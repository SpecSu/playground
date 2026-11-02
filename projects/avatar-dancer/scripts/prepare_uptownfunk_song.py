#!/usr/bin/env python3
"""Full authorized user recording; deterministic measured115BPM chart, no downloads."""
import argparse,json,pathlib,subprocess
import numpy as np
from scipy.signal import stft,find_peaks
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',default='public/assets/audio');a=p.parse_args();source=pathlib.Path(a.source);out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True)
sr=22050;x=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-ar',str(sr),'-ac','1','-f','f32le','pipe:1']),'<f4');duration=len(x)/sr
_,t,z=stft(x,sr,nperseg=1024,noverlap=803,boundary=None);flux=np.mean(np.maximum(0,np.diff(np.log1p(abs(z)*100),axis=1)),axis=0);t=t[1:];flux/=flux.max()
# Independent broad85–180 search established115; refine against whole source.
best=(-1,0,0)
for bpm in np.arange(114.96,115.041,.001):
 for anchor in np.arange(.23,.311,.001):
  score=float(np.mean(np.interp(anchor+np.arange(4,152)*60/bpm,t,flux)))
  if score>best[0]:best=(score,float(bpm),float(anchor))
_,bpm,anchor=best;bpm=round(bpm,3);anchor=round(anchor,3);beat=60/bpm
peaks,_=find_peaks(flux,prominence=.045,distance=7);pt=t[peaks];strength=flux[peaks];chart=[];evidence=[];patterns=[[0,2,1,3],[1,3,0,2],[2,0,3,1],[3,1,2,0]]
def add(grid,lane):
 j=int(np.argmin(abs(pt-grid)));delta=float(pt[j]-grid);snapped=abs(delta)<=.045 and strength[j]>.10;at=float(pt[j]) if snapped else grid
 chart.append({'time':round(at,5),'lane':lane});evidence.append({'grid':round(grid,5),'time':round(at,5),'onsetDelta':round(delta,5),'snapped':bool(snapped),'strength':round(float(strength[j]),4)})
# Readable four-beat lane phrases. Two quieter bars around38–42s relax to
# half-time; four measured eighth pickups decorate the stronger50–62s return.
for pulse in range(4,152):
 bar,step=divmod(pulse,4);pattern=patterns[(bar//4)%4]
 if bar in [18,19] and step%2:continue
 add(anchor+pulse*beat,pattern[step])
 if step==0 and bar in [8,16,24,32]:chart.append({'time':chart[-1]['time'],'lane':(pattern[step]+2)%4})
pickups=[]
for pulse in range(96,120):
 grid=anchor+(pulse+.5)*beat;j=int(np.argmin(abs(pt-grid)))
 if abs(pt[j]-grid)<.045 and strength[j]>.15:pickups.append((float(strength[j]),grid,pulse))
for _,grid,pulse in sorted(pickups,reverse=True):
 if len(chart)>=152:break
 bar,step=divmod(pulse,4);lane=patterns[(bar//4)%4][(step+2)%4];at=float(pt[int(np.argmin(abs(pt-grid)))])
 if any(n['lane']==lane and abs(n['time']-at)<.17 for n in chart):continue
 add(grid,lane)
chart.sort(key=lambda n:(n['time'],n['lane']));assert 100<=len(chart)/duration*60<=120
# Source has >unity MP3 overshoot.0.60gain retains original dynamics and matches
# existing game-track RMS without clipping; no source samples/time are trimmed.
subprocess.run(['ffmpeg','-v','error','-i',str(source),'-af',f'volume=0.60,afade=t=in:st=0:d=0.15,afade=t=out:st={duration-.35}:d=0.35:curve=hsin','-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','160k','-map_metadata','-1',str(out/'uptownfunk-gameplay.mp3'),'-y'],check=True)
m={'title':'UptownFunk','sourceLabel':'用户提供音频','bpm':bpm,'duration':round(duration,6),'offset':anchor,'audioUrl':'/assets/audio/uptownfunk-gameplay.mp3?v=full-v14','sourceFilename':source.name,'sourceTrimStart':0,'durationPolicy':'user-approved-full-source','sourceDecodedDuration':round(duration,6),'fadeIn':.15,'fadeOut':.35,'chart':chart,'sections':[{'name':'entrance','start':0},{'name':'groove','start':round(anchor+4*beat,6)},{'name':'relaxed-phrase','start':round(anchor+72*beat,6)},{'name':'lift','start':round(anchor+96*beat,6)}],'analysis':{'method':'broad85–180BPM source onset-grid search, full-source refined phase fit; authored lane motifs and measured eighth pickups','matchedOnsets':sum(e['snapped'] for e in evidence),'timedEvents':len(evidence),'gridEvidence':evidence}}
(out/'uptownfunk-gameplay.metadata.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in m.items() if k not in ['chart','analysis']},ensure_ascii=False));print('notes',len(chart),'events',len(evidence),'matched',m['analysis']['matchedOnsets'])

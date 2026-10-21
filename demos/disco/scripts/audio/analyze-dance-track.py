#!/usr/bin/env python3
"""Reproduce tempo/phase analysis. Requires ffmpeg, numpy and scipy. No network.
Run: python scripts/audio/analyze-dance-track.py [path/to/song.mp3]
"""
import numpy as np
from scipy.io import wavfile
from scipy import signal
import sys, subprocess, tempfile
from pathlib import Path
asset = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2] / 'public/audio/dance-machine/gai-chi-yao-le.mp3'
work = Path(tempfile.mkdtemp(prefix='dance-analysis-'))
subprocess.run(['ffmpeg', '-v', 'error', '-i', str(asset), '-vn', '-ac', '1', '-ar', '24000', str(work / 'decoded.wav')], check=True)
sr,y=wavfile.read(work / 'decoded.wav');
print('Decoded duration:', len(y)/sr, 'seconds;', len(y), 'samples')
y=y.astype(float)/32768
f,t,z=signal.stft(y,sr,nperseg=1024,noverlap=904)
m=np.abs(z)
# positive spectral flux; emphasize kick separately
for name,sel in [('all',f<10000),('low',(f>35)&(f<220)),('mid',(f>220)&(f<2500))]:
 a=np.maximum(0,np.diff(np.log1p(m[sel]*100),axis=1)).sum(axis=0)
 ts=t[1:]; a=signal.detrend(a,type='constant'); a=np.maximum(0,a)
 ac=signal.correlate(a,a,mode='full',method='fft')[len(a)-1:];dt=ts[1]-ts[0]
 p,_=signal.find_peaks(ac);p=p[(p*dt>.27)&(p*dt<1)]
 top=sorted(p,key=lambda p:ac[p],reverse=True)[:8]
 print(name,'tempo candidates',[(round(60/(p*dt),3),round(ac[p]/ac[0],3)) for p in top])
 peaks,_=signal.find_peaks(a,distance=int(.25/dt),prominence=np.std(a)*.5)
 print('peaks',[(round(ts[p],3),round(a[p],1)) for p in peaks[:35]])
 np.savez(work / ('dance-'+name+'.npz'),a=a,t=ts)
d=np.load(work / 'dance-all.npz');a=d['a'];ts=d['t']
# jointly optimize a stationary grid across full length, retaining phase
best=(-1,None,None)
for bpm in np.arange(113,117,.01):
 period=60/bpm
 for phase in np.arange(0,period,.005):
  grid=np.arange(phase,50,period);score=np.interp(grid,ts,a).sum()
  if score>best[0]:best=(score,bpm,phase)
print('BEST grid',best)
_,bpm,phase=best;period=60/bpm
pk,_=signal.find_peaks(a,distance=30,prominence=np.std(a)*.4)
matched=[]
for i,expected in enumerate(np.arange(phase,51,period)):
 near=pk[np.abs(ts[pk]-expected)<.055]
 if len(near):
  p=max(near,key=lambda p:a[p]);matched.append((i,float(ts[p]),float(a[p])))
x=np.array([r[0] for r in matched]);v=np.array([r[1] for r in matched]);coef=np.polyfit(x,v,1);res=v-np.polyval(coef,x)
print('refined BPM phase',60/coef[0],coef[1],'matched',len(x),'median residual',np.median(np.abs(res)),'p95',np.quantile(np.abs(res),.95))
for lo in range(0,50,8):
 rows=[r for r in matched if lo<=r[1]<lo+8]
 if len(rows)>3:
  c=np.polyfit([r[0] for r in rows],[r[1] for r in rows],1);print('segment',lo,'bpm',60/c[0],'n',len(rows))
print('matched',matched)
print('bar accents',[(k,sum(r[2] for r in matched if r[0]%4==k)) for k in range(4)])
np.savez(work / 'dance-fit.npz',bpm=60/coef[0],phase=coef[1],matches=np.array(matched))
for lo in range(0,52,2):
 seg=y[int(lo*sr):int((lo+2)*sr)];print('rms',lo,round(float(np.sqrt(np.mean(seg**2))),3))

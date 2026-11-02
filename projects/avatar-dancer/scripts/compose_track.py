"""STAGE RUSH — original instrumental, deterministic synthesis, no samples.
Requires only NumPy, SciPy and ffmpeg. Re-run from any working directory.
Composition: 128 BPM, F# minor, 4/4, 40 bars + 2 s release.
All oscillators, percussion, voicings and melody generated here, no borrowed audio.
"""
from pathlib import Path
import json, subprocess
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io.wavfile import write
SR=44100; BPM=128; B=60/BPM; BAR=4*B; DURATION=40*BAR+2
OUT=Path(__file__).resolve().parents[1]/'public/assets/audio'
OUT.mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(739521)
N=round(DURATION*SR)
stems={k:np.zeros((N,2),dtype=np.float32) for k in ['drums','bass','chords','lead','fx']}
def filt(x,hz,kind='lowpass',order=2):
    return sosfilt(butter(order,hz,kind,fs=SR,output='sos'),x,axis=0)
def hz(m):return 440*2**((m-69)/12)
def timeline(d):return np.arange(round(d*SR))/SR
def env(t,d,a=.005,r=.04):
    return np.minimum(1,t/a)*np.minimum(1,np.maximum(0,d-t)/r)
def osc(f,t,kind='saw',detune=0):
    # Finite additive oscillator avoids naive-saw aliasing.
    f*=2**(detune/1200)
    harmonics=min(32,int(16000/f)); y=np.zeros(len(t))
    for h in range(1,harmonics+1):
        if kind=='square' and h%2==0:continue
        y+=np.sin(2*np.pi*f*h*t)/h * (1 if kind=='square' else (-1)**(h+1))
    return y*(.65 if kind=='saw' else .85)
def add(stem,x,beat,amp=1,pan=0):
    i=round(beat*B*SR)
    if i<0:return
    x=np.asarray(x)
    if x.ndim==1:x=np.column_stack([x*np.sqrt((1-pan)/2),x*np.sqrt((1+pan)/2)])
    l=min(len(x),N-i)
    if l>0:stems[stem][i:i+l]+=x[:l]*amp

def kick():
    t=timeline(.48); frequency=47+135*np.exp(-t*37)
    phase=2*np.pi*np.cumsum(frequency)/SR
    body=np.sin(phase)*np.exp(-t*10)*np.minimum(1,t/.001)
    click=filt(rng.normal(0,1,len(t)),2800,'highpass')*np.exp(-t*210)*.25
    return np.tanh((body+click)*1.65)*.83
KICK=kick()
def clap():
    t=timeline(.27); n=filt(filt(rng.normal(size=len(t)),850,'highpass'),9000)
    e=np.zeros(len(t))
    for s in [0,.012,.024]:e+=np.where(t>=s,np.exp(-np.maximum(0,t-s)*95),0)
    e+=np.where(t>=.027,np.exp(-np.maximum(0,t-.027)*22)*.55,0)
    body=np.sin(2*np.pi*182*t)*np.exp(-t*34)*.27
    return n*e*.28+body
CLAP=clap()
def hat(opened=False):
    d=.27 if opened else .085;t=timeline(d)
    n=filt(rng.normal(size=len(t)),7400,'highpass')
    metal=sum(np.sin(2*np.pi*f*t) for f in [4211,5683,7231,9119])*.09
    return (n*.40+metal)*np.exp(-t*(17 if opened else 62))*env(t,d,.001,.02)
def crash():
    t=timeline(1.7);n=filt(rng.normal(size=len(t)),5000,'highpass')
    return n*np.exp(-t*3.4)*env(t,1.7,.001,.2)*.22

def bass(m,d,accent=1):
    t=timeline(d);f=hz(m)
    y=.60*np.sin(2*np.pi*f*t)+.24*osc(f,t,'saw')+.10*osc(f*2,t,'square')
    y=filt(y,1000); y=np.tanh(y*1.8)*env(t,d,.006,.045)
    return y*accent

def chord(notes,d,bright=True):
    t=timeline(d);y=np.zeros((len(t),2))
    for j,m in enumerate(notes):
        for det,pan in [(-9,-.8),(7,.8),(0,0)]:
            o=osc(hz(m),t,detune=det)
            y[:,0]+=o*np.sqrt((1-pan)/2);y[:,1]+=o*np.sqrt((1+pan)/2)
    y/=len(notes)*2.7
    y=filt(y,5100 if bright else 1450)
    e=env(t,d,.008 if bright else .08,.12)
    e*=.60+.40*np.exp(-t*7)
    return y*e[:,None]

def lead(m,d,strong=False):
    t=timeline(d); f=hz(m)
    y=np.column_stack([osc(f,t,detune=-5),osc(f,t,detune=5)])*.43
    y+=np.sin(2*np.pi*(f*2)*t)[:,None]*.16
    y=filt(y,6000 if strong else 3700)
    e=env(t,d,.004,.055)*(.32+.68*np.exp(-t*9))
    return y*e[:,None]

# Smoothly voiced F#m9 / Dmaj9 / Aadd9 / Esus4-E.
voicings=[[54,57,61,68],[50,57,61,64],[52,57,59,64],[52,56,59,66]]
roots=[30,26,33,28]
sections=[(0,'INTRO'),(4,'BUILD'),(8,'DROP'),(16,'BREAK'),(20,'RISE'),(24,'FINAL DROP'),(36,'OUTRO')]
# A two-bar call-and-response, original melody entirely in F# natural minor.
melody=[(0,78,.5),(.75,81,.25),(1.25,85,.5),(2,83,.5),(2.75,81,.25),(3.25,78,.5),
        (4,76,.5),(4.75,78,.25),(5.25,81,.5),(6,80,.5),(6.75,76,.25),(7.25,73,.5)]
for bar in range(40):
    beat=bar*4; p=bar%4
    drop=8<=bar<16 or 24<=bar<36
    build=4<=bar<8 or 20<=bar<24
    brk=16<=bar<20
    outro=bar>=36
    full=drop or build or (bar>=2 and not brk)
    # Four-on-floor pulse; break and intro retain space.
    kicks=[0,1,2,3] if full else ([0,2] if bar<2 else [])
    if bar in [7,23]:kicks=[0,1,2]
    if bar==39:kicks=[0]
    for k in kicks:add('drums',KICK,beat+k,.94 if drop else .82)
    if full:
        for k in [1,3]:
            if bar not in [7,23,39] or k==1:add('drums',CLAP,beat+k,.9 if drop else .7)
        for k in np.arange(.5,4,1):add('drums',hat(True),beat+k,.40 if drop else .27,.3)
        for j,k in enumerate(np.arange(0,4,.5)):
            add('drums',hat(),beat+k,.30 if j%2 else .19,(-1)**j*.45)
        if drop and bar%4==3:
            for k in [3.25,3.5,3.75]:add('drums',hat(),beat+k,.25,(-1)**int(k*4)*.65)
    # Variation in drums: shorter snare rolls into transitions, then silence for impact.
    if bar in [7,23]:
        for j,k in enumerate(np.arange(0,3.5,.25 if bar==23 else .5)):
            add('drums',CLAP,beat+k,.18+j*.024,(-1)**j*.18)
    if bar in [8,12,24,28,32,36]:add('fx',crash(),beat,1,-.1)
    # Sidechained off-beat bass with octave pickups.
    if full and bar!=39:
        for k,d,octave in [(0,.38,0),(.75,.23,0),(1.5,.4,0),(2,.35,0),(2.75,.24,12),(3.5,.4,0)]:
            if bar in [7,23] and k>2.6:continue
            add('bass',bass(roots[p]+octave,d*B),beat+k,.40 if drop else .32)
    elif brk:
        add('bass',bass(roots[p],2*B),beat,.21)
    # Chord stabs / soft pad beds.
    if drop:
        for k,d in [(0,.55),(.75,.65),(1.5,.4),(2.5,.65),(3.25,.55)]:
            add('chords',chord(voicings[p],d*B),beat+k,.52)
    else:
        add('chords',chord(voicings[p],3.8*B,False),beat,.40 if brk else .27)
        if build:
            for k in [.5,1.5,2.5,3.5]:add('chords',chord(voicings[p],.30*B),beat+k,.17+(bar%4)*.045)
    # Sparkling arpeggio provides movement between main hook phrases.
    if not (bar==39):
        pattern=[0,2,1,3,2,1,3,2]
        for j,degree in enumerate(pattern):
            if drop and j%2==0:continue
            m=voicings[p][degree]+12
            add('lead',lead(m,.22*B),beat+j*.5,.10 if drop else .13,0)
    if drop and bar%2==0:
        for pos,m,d in melody:
            # Last four bars lift the hook by an octave on occasional response notes.
            extra=12 if bar>=32 and pos in [4.75,6.75] else 0
            add('lead',lead(m+extra,d*B,True),beat+pos,.29)
    # Small tom fills, no wall of quantized snare.
    if bar in [11,15,27,31,35]:
        for j,k in enumerate([2.75,3.25,3.5,3.75]):
            t=timeline(.20);f=130-j*18
            tom=np.sin(2*np.pi*(f*t+20*.03*(1-np.exp(-t/.03))))*np.exp(-t*20)*env(t,.2,.002,.02)
            add('drums',tom,beat+k,.33,(-.4+j*.27))
# Risers, impact/downlifter, reversed chord swells.
for start in [4,20]:
    d=4*BAR;t=timeline(d);progress=t/d
    n=filt(rng.normal(size=len(t)),2300,'highpass')
    sweep=np.sin(2*np.pi*(250*t+1150*t*t/d))*.09
    riser=(n*.12+sweep)*(progress**2)*env(t,d,.4,.15)
    add('fx',riser,start*4,.45)
    swell=chord(voicings[3],BAR,False)[::-1]
    add('fx',swell,(start+3)*4,.45)
for bar in [8,24]:
    t=timeline(1.6);sub=np.sin(2*np.pi*(42*t+25*.05*(1-np.exp(-t/.05))))*np.exp(-t*6)
    add('fx',sub,bar*4,.23)
# Finale resolved F#m chord; no indefinite loop.
add('chords',chord([54,57,61,66],1.9,False),156,.45)
# Tempo-synced sidechain on musical stems, leaving drums crisp.
t=np.arange(N)/SR; beatphase=(t/B)%1
pump=.28+.72*(1-np.exp(-beatphase*9))
for key in ['bass','chords']:stems[key]*=pump[:,None]
# Stereo ping-pong delay and multi-tap diffuse reverb, high-passed returns.
for key,amount in [('lead',.25),('chords',.16)]:
    dry=stems[key].copy();wet=np.zeros_like(dry)
    for rep in range(1,5):
        shift=round(B*.75*rep*SR)
        wet[shift:]+=dry[:-shift,::(-1 if rep%2 else 1)]*(amount*.54**(rep-1))
    stems[key]+=filt(filt(wet,3800),350,'highpass')
for key,amount in [('chords',.12),('lead',.09),('drums',.055)]:
    dry=stems[key].copy();wet=np.zeros_like(dry)
    for delay,gain in [(.037,.8),(.061,.65),(.089,.6),(.127,.48),(.173,.38),(.233,.27),(.307,.16)]:
        shift=round(delay*SR)
        wet[shift:]+=dry[:-shift,::-1]*gain*amount
    stems[key]+=filt(filt(wet,6200),600,'highpass')
mix=sum(stems.values())
mix=filt(mix,28,'highpass')
# Gentle bus saturation, then measured loudness/true-peak mastering via ffmpeg.
mix=np.tanh(mix*1.12)/1.12
mix[-round(1.3*SR):]*=np.linspace(1,0,round(1.3*SR))[:,None]
mix*=.89/np.max(np.abs(mix))
raw=OUT/'stage-rush-premaster.wav';write(raw,SR,mix.astype(np.float32))
subprocess.run(['ffmpeg','-y','-v','info','-i',str(raw),'-af','loudnorm=I=-14:TP=-1.5:LRA=7','-ar',str(SR),'-codec:a','libmp3lame','-b:a','192k',str(OUT/'stage-rush.mp3')],check=True)
raw.unlink()
metadata={'title':'STAGE RUSH','artist':'Original demo production','bpm':BPM,'duration':DURATION,'offset':0,'timeSignature':[4,4],'key':'F# minor','bars':40,'musicalDuration':40*BAR,'beatTimes':[i*B for i in range(160)],'sections':[{'time':bar*BAR,'name':name,'bar':bar+1} for bar,name in sections], 'provenance':{'type':'original-synthesized-instrumental','externalSamples':False,'borrowedMelodies':False,'description':'Original dance-pop / EDM backing. Not an artist recording or licensed K-pop song. Deterministically synthesized from oscillators and noise; composition source included.','source':'scripts/compose_track.py'},'audio':{'codec':'MP3','sampleRate':SR,'channels':2,'bitrateKbps':192,'loudnessTargetLUFS':-14,'truePeakTargetDbTP':-1.5}}
(OUT/'stage-rush.metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
print('Rendered',OUT/'stage-rush.mp3',DURATION,'seconds')

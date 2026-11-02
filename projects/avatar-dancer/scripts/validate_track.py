from pathlib import Path
import json,subprocess,numpy as np
root=Path(__file__).resolve().parents[1]/'public/assets/audio'
p=root/'stage-rush.mp3'
assert p.exists(), 'Final MP3 must exist'
m=json.loads((root/'stage-rush.metadata.json').read_text())
assert m['bpm']==128 and m['offset']==0
assert 75<=m['duration']<=80
assert len(m['beatTimes'])==160
assert all(abs(t-i*60/128)<1e-8 for i,t in enumerate(m['beatTimes']))
x=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(p),'-f','f32le','-ac','2','-ar','44100','-']),dtype=np.float32).reshape(-1,2)
assert np.isfinite(x).all()
assert np.max(np.abs(x))<1, 'No decoded clipping'
assert abs(len(x)/44100-m['duration'])<.05
assert np.sqrt(np.mean(x[:44100]**2))>.005, 'No silent start'
assert np.sqrt(np.mean((x[:,0]-x[:,1])**2))>.01, 'Actual stereo content'
print(json.dumps({'duration':len(x)/44100,'decodedPeak':float(np.max(np.abs(x))),'rms':float(np.sqrt(np.mean(x*x))),'stereoDifferenceRms':float(np.sqrt(np.mean((x[:,0]-x[:,1])**2))),'tests':'passed'},indent=2))

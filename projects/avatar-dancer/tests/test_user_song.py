"""Decode delivered asset and check real signal/transient alignment (not audition)."""
import pathlib,json,subprocess,unittest,os
import numpy as np
from scipy.signal import stft,find_peaks
ROOT=pathlib.Path(__file__).parents[1]
class UserSongTest(unittest.TestCase):
 def check_track(self,track):
  meta=json.loads((ROOT/f'public/assets/audio/{track}-gameplay.metadata.json').read_text())
  raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(ROOT/f'public/assets/audio/{track}-gameplay.mp3'),'-ar','22050','-ac','2','-f','f32le','pipe:1'])
  stereo=np.frombuffer(raw,'<f4').reshape(-1,2);x=stereo.mean(axis=1);sr=22050
  self.assertLess(abs(len(x)/sr-meta['duration']),.01);self.assertTrue(np.all(np.isfinite(stereo)));self.assertLess(np.max(abs(stereo)),.98)
  rms=lambda q:float(np.sqrt(np.mean(q*q)))
  if track=='uptownfunk':self.assertLess(rms(x[:int(sr*.005)]),rms(x[int(sr*.10):int(sr*.15)])*.4)
  else:self.assertLess(rms(x[:int(sr*.04)]),rms(x[int(sr*.35):int(sr*.45)])*.4)
  self.assertLess(rms(x[-int(sr*.04):]),rms(x[-int(sr*.6):-int(sr*.5)])*.4)
  _,t,z=stft(x,sr,nperseg=1024,noverlap=803,boundary=None);flux=np.mean(np.maximum(0,np.diff(np.log1p(abs(z)*100),axis=1)),axis=0);t=t[1:];flux/=flux.max()
  p,_=find_peaks(flux,prominence=.045,distance=7);peaks=t[p]
  noteTimes=sorted(set(n['time'] for n in meta['chart']));errors=np.array([min(abs(peaks-time)) for time in noteTimes]);matched=np.mean(errors<.055)
  self.assertGreater(matched,.9);self.assertLess(np.median(errors),.015)
  print({'track':track,'decoded_seconds':len(x)/sr,'peak':float(np.max(abs(stereo))),'rms':rms(stereo),'output_rms':rms(stereo)*.75,'median_note_to_onset_ms':float(np.median(errors))*1000,'notes_within_55ms':float(matched),'unique_events':len(noteTimes)})
 @unittest.skipUnless(os.environ.get('POPSTARS_SOURCE'),'private original source not provided')
 def test_popstars_starts_at_original_zero(self):
  def decode(path):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','22050','-ac','1','-f','f32le','pipe:1']),'<f4')
  source=decode(os.environ['POPSTARS_SOURCE']);actual=decode(ROOT/'public/assets/audio/popstars-gameplay.mp3');section=slice(22050,int(58*22050));a=source[section];b=actual[section]
  correlation=float(np.corrcoef(a,b)[0,1]);decoded_gain=float(np.sqrt(np.mean(b*b)/np.mean(a*a)))
  self.assertGreater(correlation,.99,'delivered excerpt must align to source zero, not old4.286s trim')
  self.assertTrue(.65<decoded_gain<.75,'conservative gain retained after lossy encoding')
  print({'source_zero_correlation':correlation,'decoded_gain':decoded_gain})
 def test_popstars(self):self.check_track('popstars')
 def test_fantastic(self):self.check_track('fantastic')
 def test_killlove(self):self.check_track('killlove')
 def test_uptownfunk(self):self.check_track('uptownfunk')
 @unittest.skipUnless(os.environ.get('KILLLOVE_SOURCE'),'private third original source not provided')
 def test_killlove_starts_at_original_zero(self):
  def decode(path):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','22050','-ac','1','-f','f32le','pipe:1']),'<f4')
  source=decode(os.environ['KILLLOVE_SOURCE']);actual=decode(ROOT/'public/assets/audio/killlove-gameplay.mp3');section=slice(22050,57*22050);a=source[section];b=actual[section]
  correlation=float(np.corrcoef(a,b)[0,1]);decoded_gain=float(np.sqrt(np.mean(b*b)/np.mean(a*a)));self.assertGreater(correlation,.99);self.assertTrue(.65<decoded_gain<.75)
  print({'track':'killlove','source_zero_correlation':correlation,'decoded_gain':decoded_gain})
  self.assertLess(abs(len(actual)-len(source))/22050,.001,'full decoded source must be retained to EOF')
  for start,end in [(57.3,58.1),(58.3,73.8)]:
   a=source[int(start*22050):int(end*22050)];b=actual[int(start*22050):int(end*22050)]
   corr=float(np.corrcoef(a,b)[0,1]);gain=float(np.sqrt(np.mean(b*b)/np.mean(a*a)))
   self.assertGreater(corr,.99);self.assertTrue(.65<gain<.75,'old58s fade must be absent and climax remain full level')
   print({'full_source_section':[start,end],'correlation':corr,'gain':gain})
  self.assertLess(float(np.sqrt(np.mean(actual[-882:]**2))),.003,'light EOF fade ends quietly')


 @unittest.skipUnless(os.environ.get('UPTOWNFUNK_SOURCE'),'private new original source not provided')
 def test_uptownfunk_source_zero_to_eof(self):
  def decode(path):return np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ar','22050','-ac','1','-f','f32le','pipe:1']),'<f4')
  source=decode(os.environ['UPTOWNFUNK_SOURCE']);actual=decode(ROOT/'public/assets/audio/uptownfunk-gameplay.mp3');self.assertLess(abs(len(actual)-len(source))/22050,.001)
  for start,end in [(1,30),(30,60),(60,79.5)]:
   a=source[int(start*22050):int(end*22050)];b=actual[int(start*22050):int(end*22050)];corr=float(np.corrcoef(a,b)[0,1]);gain=float(np.sqrt(np.mean(b*b)/np.mean(a*a)));self.assertGreater(corr,.99);self.assertTrue(.54<gain<.61);print({'track':'uptownfunk','source_section':[start,end],'correlation':corr,'gain':gain})
  self.assertLess(float(np.sqrt(np.mean(actual[-88:]**2))),.001)

if __name__=='__main__':unittest.main()

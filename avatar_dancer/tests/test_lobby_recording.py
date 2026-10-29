"""Objective asset QA; not a subjective listening test. Requires ffmpeg/numpy/scipy."""
import pathlib, subprocess, unittest
import numpy as np
from scipy.signal import butter, sosfilt, find_peaks

class LobbyRecordingTest(unittest.TestCase):
    def test_recording_has_dance_pulse_headroom_and_smooth_wrap(self):
        asset=pathlib.Path(__file__).parents[1]/'public/assets/audio/lobby-tech-house.mp3'
        self.assertLess(asset.stat().st_size,600_000)
        raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(asset),'-ac','2','-ar','44100','-f','f32le','pipe:1'])
        x=np.frombuffer(raw,dtype='<f4').reshape(-1,2);sr=44100
        self.assertTrue(30<len(x)/sr<31)
        self.assertTrue(np.all(np.isfinite(x)))
        self.assertLess(np.max(abs(x)),.95)
        rms=float(np.sqrt(np.mean(x*x)))*.36*.75
        self.assertTrue(.03<rms<.06)
        low=sosfilt(butter(4,[35,150],fs=sr,btype='band',output='sos'),x.mean(axis=1))
        hop=88;env=np.sqrt(np.mean(low[:len(low)//hop*hop].reshape(-1,hop)**2,axis=1))
        peaks,_=find_peaks(env,distance=int(.35*sr/hop),prominence=.04)
        self.assertTrue(58<=len(peaks)<=67)
        bpm=60/np.median(np.diff(peaks)*hop/sr)
        self.assertTrue(120<bpm<132)
        self.assertGreater(np.percentile(env,95)/np.percentile(env,20),4)
        self.assertLess(np.max(abs(x[0]-x[-1])),np.percentile(abs(np.diff(x,axis=0)),99)*.5)
        print({'seconds':len(x)/sr,'bytes':asset.stat().st_size,'output_peak':float(np.max(abs(x)))*.27,'output_rms':rms,'dBFS':20*np.log10(rms),'detected_pulses':len(peaks),'median_pulse_bpm':bpm,'wrap_jump':(x[0]-x[-1]).tolist()})

if __name__=='__main__': unittest.main()

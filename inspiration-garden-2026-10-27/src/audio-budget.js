/** Small bounded admission model, independent of WebAudio and wall-clock timers. */
export function createVoiceBudget({maxVoices=24,maxStarts=12,windowMs=200}={}){
 let nextId=1;const active=new Map(),starts=[];
 return {
  reserve(now,duration){if(!Number.isFinite(now)||!Number.isFinite(duration)||duration<=0||duration>3000)return null;
   for(const [id,end]of active)if(end<=now)active.delete(id);while(starts.length&&starts[0]<=now-windowMs)starts.shift();
   if(active.size>=maxVoices||starts.length>=maxStarts)return null;const id=nextId++;active.set(id,now+duration);starts.push(now);return id;
  },release(id){active.delete(id);},clear(){active.clear();starts.length=0;},get activeCount(){return active.size;},
 };
}
export const timbreFor=kind=>kind==='key'?{wave:'pluck',attack:.004,cutoff:2600}:kind==='bell'?{wave:'glass',attack:.008,cutoff:6000}:kind==='drum'?{wave:'sine',attack:.003,cutoff:1200}:{wave:'sine',attack:.012,cutoff:4000};
export const noiseFor=kind=>({
 drum:{filter:'lowpass',frequency:700,q:.6,duration:.065,attack:.002,gain:.035},
 wave:{filter:'bandpass',frequency:780,q:.65,duration:.6,attack:.08,gain:.018},
 whisper:{filter:'bandpass',frequency:1500,q:.5,duration:.65,attack:.1,gain:.01},
 gramophone:{filter:'highpass',frequency:2000,q:.4,duration:.45,attack:.02,gain:.005},
}[kind]??null);

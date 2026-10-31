/** Original procedural ambience, sharing FarmAudio's context and master fader. */
export type AtmosphereAudioState={weather:'sunny'|'cloudy'|'rain'|'snow'|'storm';water:number};
type Layer='rain'|'wind'|'water';
type Voice={source:AudioBufferSourceNode;gain:GainNode;nodes:AudioNode[]};
const clamp=(n:number)=>Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;
export function atmosphereMix(state:AtmosphereAudioState):Record<Layer,number>{
 const rain=state.weather==='storm'?.09:state.weather==='rain'?.067:0;
 const wind=state.weather==='storm'?.036:state.weather==='snow'?.026:state.weather==='cloudy'?.02:state.weather==='rain'?.018:.009;
 return {rain,wind,water:clamp(state.water)*(state.weather==='snow'?.013:.025)};
}
/** Seeded mono noise beds with a short zero-crossing window at the loop seam. */
export function synthesizeAmbience(kind:Layer,sampleRate:number):Float32Array{
 const rate=Math.max(8000,Math.min(96000,Number.isFinite(sampleRate)?sampleRate:48000)),length=Math.round(rate*4),data=new Float32Array(length);
 let random=kind==='rain'?0x514e227:kind==='wind'?0x671a99:0x796211,brown=0,low=0;
 for(let i=0;i<length;i++){
  random^=random<<13;random^=random>>>17;random^=random<<5;const white=(random>>>0)/2147483648-1,t=i/rate;
  brown=(brown+.023*white)/1.023;low+=.11*(white-low);
  const sound=kind==='rain'?white*(.72+.08*Math.sin(t*1.9)):kind==='wind'?brown*3.8*(.64+.18*Math.sin(t*1.6)+.08*Math.sin(t*4.3)):low*1.8*(.72+.18*Math.sin(t*8.6));
  const edge=Math.min(1,i/(rate*.012),(length-1-i)/(rate*.012));data[i]=Math.max(-.95,Math.min(.95,sound))*edge;
 }
 return data;
}

/** No context creation, timers or resume. Parent decides when foreground audio is allowed. */
export class AmbientSoundscape{
 private context:AudioContext;private output:AudioNode;
 private buffers=new Map<Layer,AudioBuffer>();private voices=new Map<Layer,Voice>();private disposed=false;
 private last:AtmosphereAudioState|undefined;
 constructor(context:AudioContext,output:AudioNode){this.context=context;this.output=output;}
 update(state:AtmosphereAudioState){
  if(this.disposed||this.context.state!=='running')return;
  const same=this.last?.weather===state.weather&&Math.abs(this.last.water-state.water)<.01;
  if(same&&this.voices.size)return;
  const levels=atmosphereMix(state),now=this.context.currentTime;
  for(const kind of ['rain','wind','water'] as const){
   let voice=this.voices.get(kind);
   if(!voice){
    let buffer=this.buffers.get(kind);if(!buffer){const samples=synthesizeAmbience(kind,this.context.sampleRate);buffer=this.context.createBuffer(1,samples.length,this.context.sampleRate);buffer.getChannelData(0).set(samples);this.buffers.set(kind,buffer);}
    voice=this.createVoice(kind,buffer);this.voices.set(kind,voice);
   }
   // Smooth both weather changes and proximity. Absolute levels reserve music headroom.
   voice.gain.gain.cancelScheduledValues(now);voice.gain.gain.setTargetAtTime(levels[kind],now,.65);
  }
  this.last={weather:state.weather,water:clamp(state.water)};
 }
 private createVoice(kind:Layer,buffer:AudioBuffer):Voice{
  const nodes:AudioNode[]=[];let source:AudioBufferSourceNode|undefined;
  const own=<T extends AudioNode>(node:T):T=>{nodes.push(node);return node;};
  try{
   source=own(this.context.createBufferSource());const high=own(this.context.createBiquadFilter()),low=own(this.context.createBiquadFilter()),gain=own(this.context.createGain());
   source.buffer=buffer;source.loop=true;high.type='highpass';high.frequency.value=kind==='rain'?280:kind==='wind'?65:320;high.Q.value=.3;
   low.type='lowpass';low.frequency.value=kind==='rain'?4400:kind==='wind'?720:1750;low.Q.value=.35;gain.gain.value=0;
   source.connect(high);high.connect(low);low.connect(gain);gain.connect(this.output);source.start();return {source,gain,nodes};
  }catch(error){try{source?.stop();}catch{/* A source may not have started. */}for(const node of nodes)node.disconnect();throw error;}
 }
 stop(){
  for(const voice of this.voices.values()){voice.source.onended=null;try{voice.source.stop();}catch{/* Already stopped. */}for(const node of voice.nodes)node.disconnect();}
  this.voices.clear();this.last=undefined;
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.stop();this.buffers.clear();}
}

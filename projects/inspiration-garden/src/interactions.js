import {AUDIO_PATH} from './coin-reward.js';
import {createVoiceBudget,timbreFor,noiseFor} from './audio-budget.js';
const hidden=()=>typeof document!=='undefined'&&document.hidden;
const note=(frequency,at=0,duration=.25,type='sine',gain=.055,endFrequency=null)=>({frequency,at,duration,type,gain,endFrequency});
export function soundPlan(kind,count=0){
 const pitch=count%3;
 switch(kind){
  case 'drum':return [note(125+pitch*12,0,.19,'sine',.095,55),note(180,.12,.12,'triangle',.035,65)];
  case 'bell':return [note(880,0,.85,'sine',.045),note(1320,.02,.65,'sine',.018),note(660,.1,.7,'sine',.025)];
  case 'keyboard':return [523.25,659.25,783.99,1046.5].map((f,i)=>note(f,i*.105,.3,'triangle',.035));
  case 'puff':return [note(180,0,.24,'sine',.075,420),note(390,.22,.3,'sine',.04,100)];
  case 'whisper':return [note(330,0,.4,'sine',.018,370),note(495,.1,.45,'sine',.013)];
  case 'wave':return [note(180,0,.7,'sine',.03,270),note(270,.25,.75,'sine',.025,160),note(405,.5,.55,'sine',.014)];
  case 'sleep':return [note(392,0,.35,'sine',.025),note(330,.22,.45,'sine',.023),note(261.6,.5,.65,'sine',.02)];
  case 'moon':
  case 'glow':return [note(659.25,0,1.2,'sine',.032),note(987.8,.15,1,'sine',.02),note(1318.5,.3,.8,'sine',.015)];
  case 'float':return [note(523.25,0,.6,'sine',.026),note(783.99,.2,.8,'sine',.024),note(1046.5,.4,.8,'sine',.018)];
  case 'bubble':return [392,523.25,659.25,783.99,1046.5].map((f,i)=>note(f,i*.09,.14,'sine',.04,f*1.22));
  case 'paint':return [note(523,0,.14,'triangle',.035),note(740,.09,.16,'triangle',.03),note(1109,.18,.25,'sine',.03)];
  case 'gramophone':return [261.6,329.6,392,466.2].map((f,i)=>note(f,i*.04,.6,'triangle',.018));
  case 'coin':return [note(880,0,.12,'sine',.04),note(1174.7,.075,.3,'sine',.035)];
  case 'crystal':return [note(659.25,0,.45,'sine',.04),note(987.8,.1,.6,'sine',.025)];
  case 'plant':return [note(230,0,.12,'sine',.05,380),note(523,.08,.2,'sine',.025)];
  case 'build':return [note(180,0,.1,'triangle',.04),note(300,.08,.16,'sine',.04)];
  default:return [note(440+pitch*55,0,.3,'sine',.035)];
 }
}
const lines={
 whisper:['今天的小风，替你把烦恼吹远一点。','不急，每一颗种子都有自己的时间。','我把一小点好运，藏在你的叶子下面。'],
 drum:['咚，咚咚！今天也要有自己的节奏。'],bell:['叮——一颗清亮的好心情。'],keyboard:['叮咚，花园里落下一串小音符。'],
 puff:['呼——你把它逗得气鼓鼓了。'],wave:['沙——沙——一阵叶子做的海风。'],sleep:['唔……再晒五分钟太阳嘛。'],glow:['亮一点点，就够照见今晚的梦。'],
 float:['云朵升起来，给你送一盏小灯。'],bubble:['噗、噗，泡泡里装着今天的甜。'],paint:['一点蓝，一点黄，再加一点开心。'],gramophone:['沙沙……花园的老唱片又转起来了。'],
 sway:['叶子晃了晃，跟你打个招呼。'],
};
export const interactionLine=(kind,count=0)=>{const list=lines[kind]??lines.sway;return list[count%list.length];};
export class GardenAudio {
 constructor(){this.pageHidden=false;this.disposed=false;this.unlockEpoch=0;this.unlockSerial=0;this.context=null;this.saleEpoch=0;this.saleBuffer=null;this.saleLoad=null;this.muted=false;this.lastAt=-Infinity;this.master=null;this.compressor=null;this.noiseBuffer=null;this.waves=new Map();this.voices=new Set();this.budget=createVoiceBudget();}
 async unlock(){
  if(this.disposed||this.muted||this.pageHidden||hidden())return;const unlockEpoch=this.unlockEpoch,unlockSerial=++this.unlockSerial;
  try{
   const AudioContext=window.AudioContext??window.webkitAudioContext;if(!AudioContext)return;
   if(!this.context||this.context.state==='closed'){
    this.context=new AudioContext();this.waves.clear();this.master=this.context.createGain();this.master.gain.value=.65;
    this.compressor=this.context.createDynamicsCompressor();this.compressor.threshold.value=-18;this.compressor.knee.value=12;this.compressor.ratio.value=5;this.compressor.attack.value=.004;this.compressor.release.value=.18;
    this.master.connect(this.compressor);this.compressor.connect(this.context.destination);
    // A deterministic local noise texture; no microphone, recording, sample download or API.
    this.noiseBuffer=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);const samples=this.noiseBuffer.getChannelData(0);let seed=17;
    for(let i=0;i<samples.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;samples[i]=(seed/4294967296*2-1)*.85;}
   }
   const context=this.context;if(context.state==='suspended')await context.resume();if(unlockSerial!==this.unlockSerial||context!==this.context)return;if(this.disposed||this.muted||this.pageHidden||hidden()||unlockEpoch!==this.unlockEpoch)this.pause();
  }catch{/* Text/visual play remains complete when audio is unavailable. */}
 }
 setHidden(value){this.pageHidden=!!value;if(value)this.pause();}
 setMuted(value){this.muted=!!value;if(this.muted)this.pause();}
 pause(){this.unlockEpoch++;this.saleEpoch++;this.stopAll();if(this.context?.state==='running')this.context.suspend().catch(()=>{});}
 stopAll(){for(const voice of [...this.voices]){try{voice.source.stop(this.context.currentTime);}catch{}voice.cleanup();}this.budget.clear();}
 periodic(kind){
  if(this.waves.has(kind))return this.waves.get(kind);
  const amplitudes=kind==='pluck'?[0,1,.24,.1,.045,.018]:[0,1,.04,.22,.015,.07],real=new Float32Array(amplitudes.length),imag=new Float32Array(amplitudes);
  const wave=this.context.createPeriodicWave(real,imag);this.waves.set(kind,wave);return wave;
 }
 track(source,nodes,token){
  const voice={source,cleanup:null};let cleaned=false;
  voice.cleanup=()=>{if(cleaned)return;cleaned=true;this.voices.delete(voice);this.budget.release(token);for(const n of [source,...nodes])try{n.disconnect();}catch{}};
  source.onended=voice.cleanup;this.voices.add(voice);return voice;
 }
 play(kind,count=0){
  if(this.muted||hidden()||this.context?.state!=='running')return;const at=this.context.currentTime;if(at-this.lastAt<.045)return;this.lastAt=at;
  const timbre=kind==='keyboard'?'key':kind==='bell'?'bell':kind==='drum'?'drum':'default';
  this.playNotes(soundPlan(kind,count),at,timbre);this.playNoise(kind,at);
 }
 async playSaleCoin(){
  const epoch=this.saleEpoch;if(this.muted||hidden())return false;await this.unlock();const context=this.context,live=()=>epoch===this.saleEpoch&&!this.muted&&!hidden()&&context===this.context&&context?.state==='running';if(!live())return false;
  try{if(!this.saleBuffer){this.saleLoad??=fetch(AUDIO_PATH).then(r=>{if(!r.ok)throw Error('Coin sample unavailable');return r.arrayBuffer();}).then(b=>context.decodeAudioData(b)).finally(()=>{this.saleLoad=null;});const buffer=await this.saleLoad;if(!live())return false;this.saleBuffer=buffer;}
   if(!live())return false;const token=this.budget.reserve(context.currentTime*1000,(this.saleBuffer.duration+.05)*1000);if(token===null)return false;const source=context.createBufferSource(),gain=context.createGain(),shape=context.createWaveShaper?.();source.buffer=this.saleBuffer;gain.gain.value=1.01;
   const nodes=[gain];if(shape){shape.oversample='2x';shape.curve=Float32Array.from({length:1024},(_,i)=>.70*Math.tanh(((i/1023)*2-1)/.70));source.connect(shape);shape.connect(gain);nodes.push(shape);}else source.connect(gain);gain.connect(this.master);this.track(source,nodes,token);source.start(context.currentTime);source.stop(context.currentTime+this.saleBuffer.duration+.02);return true;
  }catch{if(live())this.play('coin');return false;}
 }
 playGesture(event){
  if(this.muted||hidden()||this.context?.state!=='running')return;const at=this.context.currentTime;
  this.playNotes(gestureSoundPlan(event),at,event.type);
  if(event.type==='purr')this.playNoise('whisper',at,.35);
  else if(event.type==='breeze')this.playNoise('wave',at,.3);
  else if(event.type==='page')this.playNoise('whisper',at,.25);
  else if(event.type==='drum')this.playNoise('drum',at,event.zone===0 ? .85 : 1);
  else if(event.type==='wave')this.playNoise('wave',at,.4+Math.max(0,Math.min(1,event.strength))*.6);
  else if(event.type==='pop')this.playNoise('drum',at,.35);
 }
 playNotes(notes,at,kind='default'){
  const timbre=timbreFor(kind);
  for(const n of notes){
   const durationMs=(n.at+n.duration+.05)*1000,token=this.budget.reserve(this.context.currentTime*1000,durationMs);if(token===null)continue;
   const source=this.context.createOscillator(),gain=this.context.createGain(),filter=this.context.createBiquadFilter(),start=at+n.at;
   if(['pluck','glass'].includes(timbre.wave))source.setPeriodicWave(this.periodic(timbre.wave));else source.type=n.type;
   source.frequency.setValueAtTime(n.frequency,start);if(n.endFrequency)source.frequency.exponentialRampToValueAtTime(n.endFrequency,start+n.duration);
   filter.type='lowpass';filter.frequency.setValueAtTime(timbre.cutoff,start);filter.Q.value=.5;
   const attack=Math.min(n.duration*.25,timbre.attack);gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(n.gain,start+attack);gain.gain.exponentialRampToValueAtTime(.0001,start+n.duration);
   source.connect(filter);filter.connect(gain);gain.connect(this.master);this.track(source,[gain,filter],token);source.start(start);source.stop(start+n.duration+.02);
  }
 }
 playNoise(kind,at,factor=1){
  const n=noiseFor(kind);if(!n||!this.noiseBuffer)return;const token=this.budget.reserve(this.context.currentTime*1000,(n.duration+.05)*1000);if(token===null)return;
  const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();source.buffer=this.noiseBuffer;filter.type=n.filter;filter.frequency.value=n.frequency;filter.Q.value=n.q;
  gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,n.gain*Math.max(0,Math.min(1,factor))),at+n.attack);gain.gain.exponentialRampToValueAtTime(.0001,at+n.duration);
  source.connect(filter);filter.connect(gain);gain.connect(this.master);this.track(source,[filter,gain],token);source.start(at);source.stop(at+n.duration+.02);
 }
 dispose(){this.disposed=true;this.pause();try{this.master?.disconnect();this.compressor?.disconnect();}catch{}this.context?.close?.()?.catch?.(()=>{});this.context=null;}
}
export function gestureSoundPlan(event){
 switch(event.type){
  case 'feed':return [note(220,0,.14,'sine',.012,330),note(120,.65,.6,'sine',.012,95)];
  case 'ink':return soundPlan('glow');
  case 'stride':return soundPlan('plant');
  case 'shutter':return [note(940,0,.045,'triangle',.012,460),note(520,.055,.06,'sine',.008,240)];
  case 'shell-glow':return [note(659.25,0,.6,'sine',.016),note(987.8,.12,.5,'sine',.009)];
  case 'canopy':return [note(220,0,.3,'sine',.008,280),note(440,.15,.35,'sine',.012)];
  case 'hover':return [note(180,0,.24,'sine',.012,260),note(260,.14,.3,'sine',.009,150)];
  case 'chime':return soundPlan('bell');
  case 'meow':return [note(620,0,.16,'sine',.025,920),note(900,.13,.3,'sine',.022,430)];
  case 'game':return [note(523,0,.1,'triangle',.022),note(784,.09,.16,'triangle',.02)];
  case 'stitch':return [note(940,0,.045,'sine',.016),note(704,.1,.07,'sine',.014)];
  case 'scan':return [note(380,0,.35,'sine',.018,700)];
  case 'lap':case 'tempo':return [note(180,0,.12,'sine',.028,90),note(420,.16,.12,'sine',.018)];
  case 'pulse':return [note(440,0,.18,'sine',.018,660)];
  case 'hug':return [note(220,0,.4,'sine',.018,196)];
  case 'ensemble':{const chords=[[261.63,392],[329.63,493.88],[523.25,659.25]][Math.max(0,Math.min(2,event.note??0))];return chords.map((f,i)=>note(f,i*.025,.42,'triangle',.022));}
  case 'purr':return [note(78,0,.3,'sine',.012+.008*Math.max(0,Math.min(1,event.strength??0)),69),note(156,.04,.25,'sine',.007,140)];
  case 'page':return [note(587.33,0,.16,'sine',.016),note(783.99,.1,.26,'sine',.014)];
  case 'camp':return event.lit?[note(440,0,.18,'sine',.03),note(659.25,.11,.35,'sine',.024)]:[note(330,0,.25,'sine',.018,220)];
  case 'breeze':return [note(180,0,.3,'sine',.006,240)];
  case 'key':return [note([523.25,587.33,659.25,783.99,880][Math.max(0,Math.min(4,event.note))],0,.28,'triangle',.045)];
  case 'bell':{const f=[659.25,880,1174.66][Math.max(0,Math.min(2,event.note))];return [note(f,0,.7,'sine',.04),note(f*1.5,0,.5,'sine',.012)];}
  case 'drum':return [note(event.zone===0?118:195,0,.19,'sine',.09,event.zone===0?55:92)];
  case 'pop':return [note(160+event.strength*130,0,.21,'sine',.065,520),note(360,.12,.24,'sine',.026,90)];
  case 'wave':return [note(150+event.strength*100,0,.36,'sine',.007,250+event.strength*100)];
  case 'light':return soundPlan(event.lit?'glow':'sleep');
  case 'fireflies':return [note(987.8,0,.8,'sine',.028),note(1318.5,.15,.9,'sine',.02),note(1568,.3,.8,'sine',.014)];
  case 'dream':return soundPlan('float');
  case 'poke':return [note(300,0,.3,'sine',.025,190)];
  case 'yawn':return soundPlan('sleep');
  default:return [];
 }
}

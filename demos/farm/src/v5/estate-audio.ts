import type {EstateSnapshot} from './estate.ts';
import type {OpeningState} from './opening.ts';

/** Original, locally synthesized score. No samples, downloads or generated-service calls. */
export const MUSIC_BARS=32;
export const BEATS_PER_BAR=4;
export const MUSIC_BPM=76;
export type MusicNote={voice:'melody'|'pad'|'bass';midi:number;duration:number;offset:number;gain:number};
export type FarmAudioStatus='awaiting-gesture'|'playing'|'muted'|'paused'|'unavailable';
export type FarmAudioCue='arrival'|'safe';
export type AudioScene={scope:string;eventId:string|null;active:boolean;complete:boolean};

const chords=[[48,52,55],[48,52,55],[45,48,52],[45,48,52],[41,45,48],[41,45,48],[43,47,50],[43,47,50]];
const phrases:(number|null)[][]=[
 [72,76,79,76],[74,null,72,69],[69,72,76,79],[76,74,72,null],
 [69,72,74,72],[67,null,69,72],[74,79,76,74],[72,null,67,null],
 [76,79,81,79],[76,74,72,null],[72,76,79,76],[74,null,72,69],
 [69,74,72,69],[67,69,72,null],[74,76,79,74],[72,null,null,null],
];
/** A deterministic 32-bar arrangement, measured in beats, for the WebAudio scheduler. */
export function musicBeat(index:number):MusicNote[]{
 const beat=((Math.max(0,Math.floor(Number.isFinite(index)?index:0)))%(MUSIC_BARS*BEATS_PER_BAR));
 const bar=Math.floor(beat/BEATS_PER_BAR),within=beat%BEATS_PER_BAR,chord=chords[bar%chords.length],notes:MusicNote[]=[];
 if(within===0)for(const midi of chord)notes.push({voice:'pad',midi:midi+12,duration:3.85,offset:0,gain:.011});
 if(within===0||within===2)notes.push({voice:'bass',midi:chord[within===0?0:2],duration:1.55,offset:0,gain:.038});
 const phrase=phrases[bar%phrases.length],pitch=phrase[within];
 if(pitch!==null){
  const secondHalf=bar>=16,melody=secondHalf&&within===2?pitch-12:pitch;
  notes.push({voice:'melody',midi:melody,duration:within===3?1.05:.72,offset:0,gain:.043});
  // A sparse answering note gives the repeat a different, softer contour.
  if(secondHalf&&bar%4===1&&within===1)notes.push({voice:'melody',midi:72,duration:.42,offset:.5,gain:.024});
 }
 return notes;
}

export function audioScene(data:EstateSnapshot,opening=data.profile.opening,replay=false):AudioScene{
 const p=data.profile,cinematic=replay||p.tutorial!=='done';
 const complete=cinematic?opening?.stage==='done'||!replay&&p.threat?.phase==='complete':p.threat?.phase==='complete';
 const active=!complete&&(cinematic?!!opening&&['approach','startle','choose','arrival','defend'].includes(opening.stage):!!p.threat&&['active','rescue'].includes(p.threat.phase));
 return {scope:`${data.playerId}:${p.id}:${p.runId??p.createdAt}:${replay?'replay':'live'}`,eventId:replay?'opening':p.threat?.id??(cinematic?'opening':null),active,complete:!!complete};
}

/** Tracks facts, not frame counts. Silent/hidden transitions never queue old victory sounds. */
export class AudioCueTracker{
 private scope='';private eventId:string|null=null;private active=false;private emitted=new Set<string>();
 update(scene:AudioScene,audible:boolean):FarmAudioCue[]{
  if(scene.scope!==this.scope){this.scope=scene.scope;this.eventId=null;this.active=false;this.emitted.clear();}
  const cues:FarmAudioCue[]=[],key=scene.eventId;
  const add=(cue:FarmAudioCue)=>{const id=`${key}:${cue}`;if(audible&&!this.emitted.has(id)){this.emitted.add(id);cues.push(cue);}};
  if(key&&scene.active)add('arrival');
  if(key&&scene.complete&&this.eventId===key&&this.active)add('safe');
  this.eventId=key;this.active=scene.active;
  if(this.emitted.size>64)this.emitted.delete(this.emitted.values().next().value!);
  return cues;
 }
}

const secondsPerBeat=60/MUSIC_BPM;
const hz=(midi:number)=>440*2**((midi-69)/12);
type Voice={oscillator:OscillatorNode;nodes:AudioNode[]};
/** Owns all WebAudio nodes/timers; construct/update are silent until a gesture calls unlock. */
export class FarmAudio{
 private context:AudioContext|undefined;private master:GainNode|undefined;private music:GainNode|undefined;private effects:GainNode|undefined;
 private enabled=true;private visible=true;private disposed=false;private failed=false;private timer:ReturnType<typeof setInterval>|undefined;
 private voices=new Set<Voice>();private tracker=new AudioCueTracker();private scene:AudioScene|undefined;
 private nextBeatAt=0;private beat=0;private lastStatus:FarmAudioStatus='awaiting-gesture';
 private onStatus?: (status:FarmAudioStatus)=>void;
 constructor(onStatus?:(status:FarmAudioStatus)=>void){this.onStatus=onStatus;}
 get status():FarmAudioStatus{
  if(this.failed)return 'unavailable';if(!this.enabled)return 'muted';if(!this.visible||this.disposed)return 'paused';
  return this.context?.state==='running'?'playing':'awaiting-gesture';
 }
 /** Call directly from a click/key handler. Never resume the context from polling or visibility. */
 async unlock():Promise<void>{
  if(this.disposed||!this.enabled)return;
  try{
   if(!this.context){
    const Constructor=globalThis.AudioContext??(globalThis as typeof globalThis&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Constructor){this.failed=true;this.publish();return;}
    this.context=new Constructor();this.master=this.context.createGain();this.master.gain.value=.7;this.master.connect(this.context.destination);
    this.music=this.context.createGain();this.music.gain.value=.8;this.music.connect(this.master);
    this.effects=this.context.createGain();this.effects.gain.value=.8;this.effects.connect(this.master);
   }
   if(this.context.state!=='running')await this.context.resume();
   if(this.disposed)return;
   this.synchronize();
  }catch{this.failed=true;this.stop();this.publish();}
 }
 setEnabled(enabled:boolean){if(this.disposed)return;this.enabled=enabled;this.synchronize();}
 setVisible(visible:boolean){if(this.disposed)return;this.visible=visible;this.synchronize();}
 update(data:EstateSnapshot,opening?:OpeningState,replay=false){if(this.disposed)return;this.scene=audioScene(data,opening,replay);this.synchronize();}
 private publish(){const status=this.status;if(status!==this.lastStatus){this.lastStatus=status;this.onStatus?.(status);}}
 private synchronize(){
  const audible=this.status==='playing';
  const cues=this.scene?this.tracker.update(this.scene,audible):[];
  if(!audible)this.stop();
  else if(this.context){
   if(this.timer===undefined){this.nextBeatAt=this.context.currentTime+.06;this.pump();this.timer=setInterval(()=>this.pump(),100);}
   this.music?.gain.setTargetAtTime(this.scene?.active ? .45 : .8,this.context.currentTime,.35);
   for(const cue of cues)this.cue(cue);
  }
  this.publish();
 }
 private pump(){
  const ctx=this.context;if(!ctx||this.status!=='playing')return;
  // Suspended/system sleep clocks never create an unbounded catch-up burst.
  if(this.nextBeatAt<ctx.currentTime-.25)this.nextBeatAt=ctx.currentTime+.04;
  while(this.nextBeatAt<ctx.currentTime+.18){
   for(const note of musicBeat(this.beat))this.note(note,this.nextBeatAt+note.offset*secondsPerBeat);
   this.beat=(this.beat+1)%(MUSIC_BARS*BEATS_PER_BAR);this.nextBeatAt+=secondsPerBeat;
  }
 }
 private oscillator(type:OscillatorType,frequency:number,at:number,duration:number,gain:number,bus:GainNode,attack:number,release:number,cutoff?:number):OscillatorNode{
  const ctx=this.context!,osc=ctx.createOscillator(),envelope=ctx.createGain(),nodes:AudioNode[]=[osc,envelope];
  osc.type=type;osc.frequency.setValueAtTime(frequency,at);
  envelope.gain.setValueAtTime(.0001,at);envelope.gain.linearRampToValueAtTime(gain,at+attack);
  envelope.gain.setValueAtTime(gain,at+Math.max(attack,duration-release));envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
  if(cutoff){const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.3;osc.connect(filter);filter.connect(envelope);nodes.push(filter);}else osc.connect(envelope);
  envelope.connect(bus);const voice={oscillator:osc,nodes};this.voices.add(voice);
  osc.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};osc.start(at);osc.stop(at+duration+.03);return osc;
 }
 private note(note:MusicNote,at:number){
  const duration=note.duration*secondsPerBeat;
  const pad=note.voice==='pad',bass=note.voice==='bass';
  this.oscillator(pad||bass?'sine':'triangle',hz(note.midi),at,duration,note.gain,this.music!,pad?.35:.025,pad?.65:duration*.7,pad?1100:bass?500:2400);
 }
 private cue(cue:FarmAudioCue){
  if(!this.context||!this.effects)return;const at=this.context.currentTime+.025;
  if(cue==='arrival'){
   // Two restrained gliding partials evoke a distant howl, rather than a sharp alarm.
   const lower=this.oscillator('sine',155,at,1.45,.07,this.effects,.28,.55);
   lower.frequency.linearRampToValueAtTime(220,at+.48);lower.frequency.linearRampToValueAtTime(174,at+1.35);
   const upper=this.oscillator('triangle',310,at+.08,1.25,.022,this.effects,.3,.5,1100);
   upper.frequency.linearRampToValueAtTime(440,at+.56);upper.frequency.linearRampToValueAtTime(348,at+1.28);
   // Soft descending wooden notes make the warning legible on laptop speakers.
   for(const [index,midi] of [67,62].entries())this.oscillator('triangle',hz(midi),at+.1+index*.26,.46,.035,this.effects,.025,.37,1600);
  }else for(const [index,midi] of [72,76,79].entries())this.oscillator('sine',hz(midi),at+index*.19,.8,.045,this.effects,.035,.65);
 }
 private stop(){
  if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}
  for(const voice of [...this.voices]){voice.oscillator.onended=null;try{voice.oscillator.stop();}catch{/* Already-ended voices are harmless. */}for(const node of voice.nodes)node.disconnect();this.voices.delete(voice);}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.stop();this.music?.disconnect();this.effects?.disconnect();this.master?.disconnect();void this.context?.close().catch(()=>{});this.publish();}
}

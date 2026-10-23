import type {EstateSnapshot} from './estate.ts';
import type {OpeningState} from './opening.ts';

/** Original, locally synthesized score. No samples, downloads or generated-service calls. */
export const MUSIC_BARS=32;
export const BEATS_PER_BAR=4;
export const MUSIC_BPM=76;
export type MusicMood='calm'|'warning'|'guard';
export type MusicNote={voice:'melody'|'pad'|'bass';midi:number;duration:number;offset:number;gain:number};
export type FarmAudioStatus='awaiting-gesture'|'playing'|'muted'|'paused'|'unavailable';
export type FarmAudioCue='warning'|'arrival'|'safe';
export type AudioScene={scope:string;eventId:string|null;warning:boolean;active:boolean;complete:boolean};

const chords=[[48,52,55],[48,52,55],[45,48,52],[45,48,52],[41,45,48],[41,45,48],[43,47,50],[43,47,50]];
const phrases:(number|null)[][]=[
 [72,76,79,76],[74,null,72,69],[69,72,76,79],[76,74,72,null],
 [69,72,74,72],[67,null,69,72],[74,79,76,74],[72,null,67,null],
 [76,79,81,79],[76,74,72,null],[72,76,79,76],[74,null,72,69],
 [69,74,72,69],[67,69,72,null],[74,76,79,74],[72,null,null,null],
];
/** A deterministic 32-bar arrangement, measured in beats, for the WebAudio scheduler. */
export function musicBeat(index:number,mood:MusicMood='calm'):MusicNote[]{
 const beat=((Math.max(0,Math.floor(Number.isFinite(index)?index:0)))%(MUSIC_BARS*BEATS_PER_BAR));
 if(mood!=='calm')return tensionBeat(beat,mood);
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

// A related A-minor theme shares the calm score's tempo and phrase grid. The
// warning is spacious; protection adds low, rounded eighth-note movement, not
// louder alarms. Neither arrangement contains the one-shot wolf cue.
const tensionChords=[[45,48,52],[45,48,52],[43,47,50],[43,47,50],[41,45,48],[41,45,48],[40,43,47],[40,43,47]];
const tensionPhrases:(number|null)[][]=[
 [69,null,72,71],[67,null,64,null],[67,69,null,71],[74,null,71,67],
 [69,null,72,69],[65,67,null,69],[67,null,71,67],[64,null,67,null],
];
function tensionBeat(beat:number,mood:'warning'|'guard'):MusicNote[]{
 const bar=Math.floor(beat/BEATS_PER_BAR),within=beat%BEATS_PER_BAR,chord=tensionChords[bar%tensionChords.length],guard=mood==='guard',notes:MusicNote[]=[];
 if(within===0)for(const midi of chord)notes.push({voice:'pad',midi:midi+12,duration:3.7,offset:0,gain:guard?.008:.009});
 if(guard||within===0||within===2)notes.push({voice:'bass',midi:within%2===0?chord[0]:chord[0]+7,duration:guard?.58:.95,offset:0,gain:guard?.032:.029});
 if(guard&&within%2===1)notes.push({voice:'bass',midi:chord[0],duration:.32,offset:.5,gain:.017});
 const pitch=tensionPhrases[bar%tensionPhrases.length][within];
 if(pitch!==null&&(guard||within%2===0))notes.push({voice:'melody',midi:bar>=16&&within===2?pitch-12:pitch,duration:guard?.66:1.2,offset:0,gain:guard?.029:.026});
 return notes;
}

export function audioScene(data:EstateSnapshot,opening=data.profile.opening,replay=false):AudioScene{
 const p=data.profile,cinematic=replay||p.tutorial!=='done';
 const complete=cinematic?opening?.stage==='done'||!replay&&p.threat?.phase==='complete':p.threat?.phase==='complete';
 const active=!complete&&(cinematic?!!opening&&['approach','startle','choose','arrival','defend'].includes(opening.stage):!!p.threat&&['active','rescue'].includes(p.threat.phase));
 const warning=!cinematic&&!p.threat&&!!p.raidCycle?.pending&&['warning','ready'].includes(p.raidCycle.phase);
 return {scope:`${data.playerId}:${p.id}:${p.runId??p.createdAt}:${replay?'replay':'live'}`,eventId:warning?p.raidCycle!.pending!.id:replay?'opening':p.threat?.id??(cinematic?'opening':null),warning,active,complete:!!complete};
}

/** Tracks facts, not frame counts. Silent/hidden transitions never queue old victory sounds. */
export class AudioCueTracker{
 private scope='';private eventId:string|null=null;private active=false;private emitted=new Set<string>();
 update(scene:AudioScene,audible:boolean):FarmAudioCue[]{
  if(scene.scope!==this.scope){this.scope=scene.scope;this.eventId=null;this.active=false;this.emitted.clear();}
  const cues:FarmAudioCue[]=[],key=scene.eventId;
  const add=(cue:FarmAudioCue)=>{const id=`${key}:${cue}`;if(audible&&!this.emitted.has(id)){this.emitted.add(id);cues.push(cue);}};
  if(key&&scene.warning)add('warning');
  if(key&&scene.active)add('arrival');
  if(key&&scene.complete&&this.eventId===key&&this.active)add('safe');
  this.eventId=key;this.active=scene.active;
  if(this.emitted.size>64)this.emitted.delete(this.emitted.values().next().value!);
  return cues;
 }
}

const secondsPerBeat=60/MUSIC_BPM;
const hz=(midi:number)=>440*2**((midi-69)/12);
type Voice={oscillator:OscillatorNode;nodes:AudioNode[];envelope:GainNode;bus:GainNode;levelAt:(time:number)=>number;retiring:boolean};
type MusicLayer={mood:MusicMood;bus:GainNode;from:number;to:number;start:number;end:number};
const mixAt=(layer:MusicLayer,time:number)=>layer.from+(layer.to-layer.from)*Math.max(0,Math.min(1,(time-layer.start)/Math.max(.001,layer.end-layer.start)));
/** Owns all WebAudio nodes/timers; construct/update are silent until a gesture calls unlock. */
export class FarmAudio{
 private context:AudioContext|undefined;private master:GainNode|undefined;private music:GainNode|undefined;private effects:GainNode|undefined;
 private enabled=true;private visible=true;private disposed=false;private failed=false;private timer:ReturnType<typeof setInterval>|undefined;
 private layers:MusicLayer[]=[];private mood:MusicMood='calm';
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
    for(const mood of ['calm','warning','guard'] as const){const bus=this.context.createGain();bus.gain.value=0;bus.connect(this.music);this.layers.push({mood,bus,from:0,to:0,start:0,end:0});}
    // An OS/browser suspension must drop scheduled notes, even before a game
    // snapshot arrives. Visibility alone never resumes a suspended context.
    this.context.onstatechange=()=>{if(!this.disposed)this.synchronize();};
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
   const starting=this.timer===undefined;
   this.setScore(this.scene?.active?'guard':this.scene?.warning?'warning':'calm',starting);
   if(starting){this.nextBeatAt=this.context.currentTime+.06;this.pump();this.timer=setInterval(()=>this.pump(),100);}
   for(const cue of cues)this.cue(cue);
  }
  this.publish();
 }
 /** Music is a persistent composition state, separate from transient sound effects. */
 private setScore(mood:MusicMood,starting:boolean){
  if(!starting&&mood===this.mood)return;
  const now=this.context!.currentTime,duration=starting?.9:mood==='calm'?4.8:1.8;
  for(const layer of this.layers){
   const from=starting?0:mixAt(layer,now),to=layer.mood===mood?1:0;
   layer.bus.gain.cancelScheduledValues(now);layer.bus.gain.setValueAtTime(from,now);layer.bus.gain.linearRampToValueAtTime(to,now+duration);
   Object.assign(layer,{from,to,start:now,end:now+duration});
  }
  this.mood=mood;
 }
 private pump(){
  const ctx=this.context;if(!ctx||this.status!=='playing')return;
  // Suspended/system sleep clocks never create an unbounded catch-up burst.
  if(this.nextBeatAt<ctx.currentTime-.25)this.nextBeatAt=ctx.currentTime+.04;
  while(this.nextBeatAt<ctx.currentTime+.18){
   for(const layer of this.layers){
    if(layer.to===0&&mixAt(layer,this.nextBeatAt)<=0)continue;
    for(const note of musicBeat(this.beat,layer.mood))this.note(note,this.nextBeatAt+note.offset*secondsPerBeat,layer.bus);
   }
   this.beat=(this.beat+1)%(MUSIC_BARS*BEATS_PER_BAR);this.nextBeatAt+=secondsPerBeat;
  }
 }
 private oscillator(type:OscillatorType,frequency:number,at:number,duration:number,gain:number,bus:GainNode,attack:number,release:number,cutoff?:number):OscillatorNode{
  const ctx=this.context!,osc=ctx.createOscillator(),envelope=ctx.createGain(),nodes:AudioNode[]=[osc,envelope];
  osc.type=type;osc.frequency.setValueAtTime(frequency,at);
  const releaseAt=at+Math.max(attack,duration-release);
  envelope.gain.setValueAtTime(.0001,at);envelope.gain.linearRampToValueAtTime(gain,at+attack);
  envelope.gain.setValueAtTime(gain,releaseAt);envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
  if(cutoff){const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=cutoff;filter.Q.value=.3;osc.connect(filter);filter.connect(envelope);nodes.push(filter);}else osc.connect(envelope);
  const levelAt=(time:number)=>time<=at||time>=at+duration?.0001:time<at+attack?.0001+(gain-.0001)*(time-at)/attack:time<=releaseAt?gain:gain*(.0001/gain)**((time-releaseAt)/(at+duration-releaseAt));
  envelope.connect(bus);const voice={oscillator:osc,nodes,envelope,bus,levelAt,retiring:false};this.voices.add(voice);
  osc.onended=()=>{this.voices.delete(voice);for(const node of nodes)node.disconnect();};osc.start(at);osc.stop(at+duration+.03);return osc;
 }
 private note(note:MusicNote,at:number,bus:GainNode){
  const duration=note.duration*secondsPerBeat;
  const pad=note.voice==='pad',bass=note.voice==='bass';
  this.oscillator(pad||bass?'sine':'triangle',hz(note.midi),at,duration,note.gain,bus,pad?.35:bass?.055:.035,pad?.65:duration*.7,pad?1100:bass?500:2400);
 }
 private cue(cue:FarmAudioCue){
  if(!this.context||!this.effects)return;const now=this.context.currentTime,at=now+.025;
  // Effects are one-shot accents, not layers in the score. A new event fades
  // the previous accent, including notes scheduled to start in the future.
  for(const voice of this.voices){
   if(voice.bus!==this.effects||voice.retiring)continue;
   voice.retiring=true;voice.envelope.gain.cancelScheduledValues(now);voice.envelope.gain.setValueAtTime(voice.levelAt(now),now);voice.envelope.gain.exponentialRampToValueAtTime(.0001,now+.16);voice.oscillator.stop(now+.18);
  }
  if(cue==='warning'){
   // A brief rising wooden pair marks distant tracks before a wolf actually arrives.
   for(const [index,midi] of [62,67].entries())this.oscillator('triangle',hz(midi),at+index*.24,.55,.035,this.effects,.035,.4,1500);
  }else if(cue==='arrival'){
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
 dispose(){if(this.disposed)return;this.disposed=true;this.stop();if(this.context)this.context.onstatechange=null;for(const layer of this.layers)layer.bus.disconnect();this.layers=[];this.music?.disconnect();this.effects?.disconnect();this.master?.disconnect();void this.context?.close().catch(()=>{});this.publish();}
}

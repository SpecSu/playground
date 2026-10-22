import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,estateSnapshot} from '../src/v5/estate.ts';
const T=1_800_000_000_000;
async function api(){return import('../src/v5/estate-audio.ts').catch(error=>assert.fail(`Farm audio is not implemented: ${error.message}`));}

test('original calm score spans32 bars with melody, warm pad and bass at bounded gain',async()=>{
 const {MUSIC_BARS,BEATS_PER_BAR,musicBeat}=await api();assert.equal(MUSIC_BARS,32);assert.equal(BEATS_PER_BAR,4);
 const score=Array.from({length:MUSIC_BARS*BEATS_PER_BAR},(_,beat)=>musicBeat(beat));
 assert.ok(score.flat().some(note=>note.voice==='melody'));assert.ok(score.flat().some(note=>note.voice==='pad'));assert.ok(score.flat().some(note=>note.voice==='bass'));
 assert.ok(new Set(score.flat().filter(n=>n.voice==='melody').map(n=>n.midi)).size>=8,'score contains an actual melody, not one repeated tone');
 assert.ok(new Set(score.map(notes=>JSON.stringify(notes))).size>=16,'phrases vary through the arrangement');
 for(const note of score.flat()){assert.ok(note.midi>=36&&note.midi<=88);assert.ok(note.duration>0&&note.duration<=4);assert.ok(note.gain>0&&note.gain<=.07);assert.ok(note.offset>=0&&note.offset<1);}
 assert.deepEqual(musicBeat(0),musicBeat(128));assert.deepEqual(musicBeat(15),musicBeat(143));
 assert.notDeepEqual(score.slice(0,32),score.slice(64,96),'second half has melodic variation');
});

test('opening wolf sound starts at approach, not while establishing the farm',async()=>{
 const {audioScene,AudioCueTracker}=await api();const data=estateSnapshot(createEstate('audio',T),T),tracker=new AudioCueTracker();
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.opening!.stage='rustle';assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.opening!.stage='approach';assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
 for(const stage of ['startle','choose','arrival','defend'] as const){data.profile.opening!.stage=stage;assert.deepEqual(tracker.update(audioScene(data),true),[]);}
 data.profile.opening!.stage='done';data.profile.threat!.phase='complete';assert.deepEqual(tracker.update(audioScene(data),true),['safe']);
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
});

test('saved completed events are silent; real new attacks and reset runs each get one cue',async()=>{
 const {audioScene,AudioCueTracker}=await api();const data=estateSnapshot(createEstate('audio',T),T),tracker=new AudioCueTracker();
 data.profile.tutorial='done';data.profile.opening!.stage='done';data.profile.threat!.phase='complete';
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.threat!.id='next-attack';data.profile.threat!.phase='active';assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
 for(let i=0;i<50;i++){data.now+=200;assert.deepEqual(tracker.update(audioScene(data),true),[]);}
 data.profile.threat!.phase='complete';assert.deepEqual(tracker.update(audioScene(data),true),['safe']);
 data.profile.runId='new-run';data.profile.threat!.phase='active';assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
});

test('muting/background does not accumulate old victory cues or replay an already heard threat',async()=>{
 const {audioScene,AudioCueTracker}=await api();const data=estateSnapshot(createEstate('audio',T),T),tracker=new AudioCueTracker();data.profile.opening!.stage='approach';
 assert.deepEqual(tracker.update(audioScene(data),false),[]);assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
 assert.deepEqual(tracker.update(audioScene(data),false),[]);assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.opening!.stage='done';data.profile.threat!.phase='complete';assert.deepEqual(tracker.update(audioScene(data),false),[]);assert.deepEqual(tracker.update(audioScene(data),true),[]);
});

test('independent opening replay has its own cue sequence without changing saved gameplay',async()=>{
 const {audioScene,AudioCueTracker}=await api();const data=estateSnapshot(createEstate('audio',T),T),copy=structuredClone(data),tracker=new AudioCueTracker();
 const opening={version:1 as const,stage:'approach' as const,elapsed:0,guardian:null};
 assert.deepEqual(tracker.update(audioScene(data,opening,true),true),['arrival']);
 assert.deepEqual(tracker.update(audioScene(data,opening,true),true),[]);
 tracker.update(audioScene(data),true);
 assert.deepEqual(tracker.update(audioScene(data,opening,true),true),['arrival']);assert.deepEqual(data,copy);
});

// No browser/audio output is claimed: this minimal WebAudio boundary proves
// gesture gating and resource disposal, while the score/event rules above are real.
class Param {value=0;setValueAtTime(value:number){this.value=value;}linearRampToValueAtTime(value:number){this.value=value;}exponentialRampToValueAtTime(value:number){this.value=value;}cancelScheduledValues(){}setTargetAtTime(value:number){this.value=value;}}
class Node {gain=new Param();frequency=new Param();Q=new Param();type='';onended:(()=>void)|null=null;started=false;stopped=false;disconnected=false;connect(){return this;}disconnect(){this.disconnected=true;}start(){this.started=true;}stop(at?:number){if(at===undefined){this.stopped=true;this.onended?.();}}}
class Context {static instances:Context[]=[];state='suspended';currentTime=0;resumeCalls=0;closed=false;destination=new Node();oscillators:Node[]=[];gains:Node[]=[];constructor(){Context.instances.push(this);}createGain(){const node=new Node();this.gains.push(node);return node;}createOscillator(){const node=new Node();this.oscillators.push(node);return node;}createBiquadFilter(){return new Node();}async resume(){this.resumeCalls++;this.state='running';}async close(){this.closed=true;this.state='closed';}}

test('audio context is created/resumed only by gesture; mute, hidden and dispose clear active voices',async context=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{value:Context,configurable:true});Context.instances=[];
 context.mock.timers.enable({apis:['setInterval']});
 try{
  const {FarmAudio}=await api(),statuses:string[]=[],audio=new FarmAudio(status=>statuses.push(status));const data=estateSnapshot(createEstate('audio',T),T);
  audio.update(data);audio.setEnabled(true);audio.setVisible(true);assert.equal(Context.instances.length,0);assert.equal(audio.status,'awaiting-gesture');
  await audio.unlock();const engine=Context.instances[0];assert.equal(engine.resumeCalls,1);assert.equal(audio.status,'playing');assert.ok(engine.oscillators.some(node=>node.started));
  audio.setVisible(false);assert.equal(audio.status,'paused');assert.ok(engine.oscillators.every(node=>node.stopped));const count=engine.oscillators.length;context.mock.timers.tick(2000);assert.equal(engine.oscillators.length,count);
  audio.setVisible(true);assert.equal(engine.resumeCalls,1,'visibility must not call resume outside gesture');audio.setEnabled(false);assert.equal(audio.status,'muted');assert.ok(engine.oscillators.every(node=>node.stopped));
  audio.setEnabled(true);assert.equal(engine.resumeCalls,1);audio.dispose();assert.ok(engine.closed);assert.ok(engine.oscillators.every(node=>node.stopped&&node.disconnected));const final=engine.oscillators.length;context.mock.timers.tick(3000);assert.equal(engine.oscillators.length,final);
  assert.ok(statuses.includes('playing')&&statuses.includes('paused')&&statuses.includes('muted'));
 }finally{if(original)Object.defineProperty(globalThis,'AudioContext',original);else Reflect.deleteProperty(globalThis,'AudioContext');context.mock.timers.reset();}
});

test('unavailable WebAudio fails quietly and never blocks gameplay state',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Reflect.deleteProperty(globalThis,'AudioContext');
 try{const {FarmAudio}=await api(),audio=new FarmAudio();await audio.unlock();assert.equal(audio.status,'unavailable');audio.dispose();}finally{if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,estateSnapshot,type EstateSnapshot} from '../src/v5/estate.ts';
import {createRaidCycle} from '../src/v5/raid-cycle.ts';
import {createThreat} from '../src/v5/threat.ts';
import {FarmAudio,musicBeat,MUSIC_BPM} from '../src/v5/estate-audio.ts';

const T=1_800_000_000_000,beatSeconds=60/MUSIC_BPM;
function scene(){const data=estateSnapshot(createEstate('tension-audio',T),T);data.profile.tutorial='done';data.profile.opening!.stage='done';data.profile.threat=null;data.profile.raidCycle=createRaidCycle(7,T,0);return data;}
function warn(data:EstateSnapshot){const cycle=data.profile.raidCycle!;cycle.phase='warning';cycle.pending={id:'wolf-a',seed:7,risk:cycle.risk,wolves:1};}
function attack(data:EstateSnapshot){const p=data.profile;p.raidCycle!.phase='active';p.threat=createThreat({id:'wolf-a',seed:7,mode:'reassure',guardian:'dog',actors:p.animals.map(a=>({id:a.id,position:a.position}))},p.layout);}

type Automation={kind:'set'|'linear'|'exponential';value:number;at:number};
class Param{
 value=0;events:Automation[]=[];
 setValueAtTime(value:number,at:number){this.events.push({kind:'set',value,at});return this;}
 linearRampToValueAtTime(value:number,at:number){this.events.push({kind:'linear',value,at});return this;}
 exponentialRampToValueAtTime(value:number,at:number){this.events.push({kind:'exponential',value,at});return this;}
 setTargetAtTime(value:number,at:number){return this.setValueAtTime(value,at);}
 cancelScheduledValues(at:number){this.events=this.events.filter(event=>event.at<at);return this;}
 at(time:number){let previous:Automation={kind:'set',value:this.value,at:0};for(const event of this.events){if(event.at>time){if(event.kind==='set')break;const p=(time-previous.at)/(event.at-previous.at);return event.kind==='exponential'?previous.value*(event.value/previous.value)**p:previous.value+(event.value-previous.value)*p;}previous=event;}return previous.value;}
}
class Node{
 gain=new Param();frequency=new Param();Q=new Param();type='';outputs:Node[]=[];disconnected=false;
 connect(node:Node){this.outputs.push(node);return node;}disconnect(){this.outputs=[];this.disconnected=true;}
}
class Oscillator extends Node{
 onended:(()=>void)|null=null;startAt=Infinity;stopAt=Infinity;ended=false;
 start(at:number){this.startAt=at;}stop(at=0){this.stopAt=at;}
}
class Context{
 static last:Context;state='suspended';currentTime=0;resumeCalls=0;closeCalls=0;onstatechange:(()=>void)|null=null;
 destination=new Node();nodes:Node[]=[];oscillators:Oscillator[]=[];
 constructor(){Context.last=this;}
 createGain(){const node=new Node();this.nodes.push(node);return node;}createBiquadFilter(){const node=new Node();this.nodes.push(node);return node;}
 createOscillator(){const node=new Oscillator();this.nodes.push(node);this.oscillators.push(node);return node;}
 async resume(){this.resumeCalls++;this.state='running';this.onstatechange?.();}
 async close(){this.closeCalls++;this.state='closed';this.onstatechange?.();}
 collect(){for(const node of this.oscillators)if(!node.ended&&node.stopAt<=this.currentTime){node.ended=true;node.onended?.();}}
}
// Classify score notes by their real connection path: oscillator/filter/envelope/layer/music/master.
function musicLayers(engine:Context){const voice=scoreVoices(engine)[0];if(!voice)return [];const music=voice.outputs[0]?.outputs[0]?.outputs[0]?.outputs[0];return engine.nodes.filter(node=>node.outputs[0]===music);}
function rootFrequency(note:Oscillator){return note.frequency.events[0]?.value;}
function scoreVoices(engine:Context){return engine.oscillators.filter(node=>{let current:Node|undefined=node;let depth=0;while(current&&current!==engine.destination&&depth<10){current=current.outputs[0];depth++;}return current===engine.destination&&depth===6;});}

async function setup(context:test.TestContext){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});context.mock.timers.enable({apis:['setInterval']});
 const data=scene(),audio=new FarmAudio();audio.update(data);await audio.unlock();const engine=Context.last;
 function advance(seconds:number){for(let left=seconds;left>0.00001;left-=.05){const step=Math.min(.05,left);engine.currentTime+=step;context.mock.timers.tick(Math.round(step*1000));engine.collect();}}
 context.after(()=>{audio.dispose();context.mock.timers.reset();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');});
 return {data,audio,engine,advance};
}

test('warning and guard are original distinct minor arrangements, not louder calm music or looping cues',()=>{
 const calm=Array.from({length:32},(_,beat)=>musicBeat(beat));
 // New optional score argument is deliberately exercised before implementation.
 const warning=Array.from({length:32},(_,beat)=>musicBeat(beat,'warning'));
 const guard=Array.from({length:32},(_,beat)=>musicBeat(beat,'guard'));
 assert.notDeepEqual(warning,calm);assert.notDeepEqual(guard,warning);
 assert.ok(warning[0].some(note=>note.midi===60),'A minor pad includes C, rather than C-major E');
 assert.ok(guard.flat().filter(note=>note.voice==='bass').length>warning.flat().filter(note=>note.voice==='bass').length,'guard has a steady but restrained low pulse');
 assert.ok(guard.flat().some(note=>note.offset===.5),'light syncopation is part of the score');
 for(const notes of [...warning,...guard]){assert.ok(notes.reduce((gain,note)=>gain+note.gain,0)<=.12);for(const note of notes){assert.ok(note.midi>=40&&note.midi<=79);assert.ok(note.gain<=.043);assert.ok(note.duration>0&&note.duration<=4);}}
 assert.deepEqual(musicBeat(128,'guard'),musicBeat(0,'guard'));
});

test('real scheduler changes the score with bounded crossfades and a slower return to calm',async context=>{
 const {data,audio,engine,advance}=await setup(context);advance(1.2);
 const original=scoreVoices(engine).find(node=>node.startAt<.1)!;assert.ok(original,'music has its own filter, envelope and submix');
 warn(data);audio.update(data);const changeAt=engine.currentTime;advance(.8);
 const warningNotes=scoreVoices(engine).filter(node=>node.startAt>=changeAt);
 assert.ok(warningNotes.some(node=>Math.abs(rootFrequency(node)-110)<.01),'scheduler actually emits A-minor low notes');
 attack(data);audio.update(data);advance(2.4);
 const layers=musicLayers(engine);assert.equal(layers.length,3,'three reusable music buses, not a new layer per update');
 for(let i=0;i<100;i++)audio.update(data);assert.equal(musicLayers(engine).length,3);
 const beforeRecovery=engine.currentTime;data.profile.threat!.phase='complete';audio.update(data);
 const ramps=layers.flatMap(layer=>layer.gain.events.filter(event=>event.kind==='linear'&&event.at>beforeRecovery));
 assert.ok(ramps.some(event=>event.value===1&&event.at-beforeRecovery>=4),'peace returns gently rather than cutting immediately');
 for(let elapsed=0;elapsed<5;elapsed+=.1){advance(.1);const sum=layers.reduce((value,layer)=>value+layer.gain.at(engine.currentTime),0);assert.ok(sum<=1.001&&sum>=.99,`crossfade has constant bounded gain, got ${sum}`);}
 assert.equal(layers.filter(layer=>layer.gain.at(engine.currentTime)>.001).length,1);
});

test('repeated threat snapshots and guardian-choice waiting neither restart the beat nor stack loops',async context=>{
 const {audio,engine,advance,data}=await setup(context);data.profile.tutorial='choose';data.profile.opening!.stage='choose';audio.update(data);
 const starts:number[]=[];
 for(let i=0;i<1200;i++){audio.update(data);advance(.1);}
 const voices=engine.oscillators.filter(node=>!node.ended&&!node.disconnected);assert.ok(voices.length<30,`only a bounded score window is alive, got ${voices.length}`);
 assert.ok(engine.oscillators.filter(node=>node.ended).every(node=>node.disconnected),'ended voices disconnect all their nodes');
 // A two-minute guardian wait is a continuous metered composition, not a replayed arrival sound.
 for(const node of engine.oscillators)if(node.startAt>5&&node.frequency.events[0]?.value===110)starts.push(node.startAt);
 assert.ok(starts.length>10);for(const at of starts){const beat=(at-.06)/beatSeconds;assert.ok(Math.abs(beat*2-Math.round(beat*2))<1e-8,'all notes stay on the shared beat grid');}
 const count=engine.oscillators.length;for(let i=0;i<100;i++)audio.update(data);assert.equal(engine.oscillators.length,count,'snapshots schedule no duplicate one-shots or restarts');
});

test('mute, background and system suspension drop old cues, keep score position, and reclaim every node on disposal',async context=>{
 const {data,audio,engine,advance}=await setup(context);advance(2.1);audio.setEnabled(false);warn(data);audio.update(data);advance(10);attack(data);audio.update(data);
 audio.setVisible(false);audio.setEnabled(true);const mutedCount=engine.oscillators.length;advance(10);assert.equal(engine.oscillators.length,mutedCount);
 audio.setVisible(true);assert.equal(engine.resumeCalls,1,'visibility does not resume an interrupted AudioContext');
 const resumed=engine.oscillators.slice(mutedCount);assert.ok(!resumed.some(node=>Math.abs(rootFrequency(node)-293.6647679)<.01&&node.startAt<engine.currentTime+.1),'old warning pair is not replayed');
 audio.setVisible(false);data.profile.threat!.phase='complete';audio.update(data);audio.setVisible(true);const completeCount=engine.oscillators.length;
 for(let i=0;i<20;i++){audio.setEnabled(false);audio.setEnabled(true);}
 assert.ok(engine.oscillators.filter(node=>!node.disconnected).length<15,'repeated toggle cannot accumulate voices');
 engine.state='suspended';engine.onstatechange?.();assert.ok(engine.oscillators.every(node=>node.disconnected),'OS suspension promptly releases pending voices');
 const suspendedCount=engine.oscillators.length;advance(20);assert.equal(engine.oscillators.length,suspendedCount);assert.equal(audio.status,'awaiting-gesture');
 await audio.unlock();assert.equal(engine.resumeCalls,2);assert.ok(engine.oscillators.length>completeCount);
 audio.dispose();audio.dispose();assert.equal(engine.closeCalls,1);assert.ok(engine.nodes.every(node=>node.disconnected),'all score buses, envelopes and filters disconnect');
 const finalCount=engine.oscillators.length;advance(20);assert.equal(engine.oscillators.length,finalCount);
});

test('interrupting a crossfade preserves current gain and retires the superseded one-shot promptly',async context=>{
 const {data,audio,engine,advance}=await setup(context);advance(1.1);warn(data);audio.update(data);
 const warningVoices=engine.oscillators.filter(node=>node.startAt>=engine.currentTime&&node.stopAt-node.startAt<.7);assert.equal(warningVoices.length,2);
 advance(.1);const layers=musicLayers(engine),before=layers.map(layer=>layer.gain.at(engine.currentTime));attack(data);audio.update(data);
 for(const [i,layer] of layers.entries())assert.ok(Math.abs(layer.gain.at(engine.currentTime)-before[i])<1e-9,'an interrupted ramp does not jump to its old target');
 assert.ok(warningVoices.every(node=>node.stopAt<=engine.currentTime+.21),'old warning cannot continue under a newly arriving wolf');
 advance(.23);assert.ok(warningVoices.every(node=>node.disconnected),'fading a future scheduled warning still reclaims its nodes');
 const arrivalVoices=engine.oscillators.filter(node=>!node.ended&&!node.disconnected&&node.startAt>1.2&&node.frequency.events.length>1);
 assert.equal(arrivalVoices.length,2);data.profile.threat!.phase='complete';audio.update(data);advance(.23);assert.ok(arrivalVoices.every(node=>node.disconnected),'arrival tails cannot stack under the safe cue');
});

test('a delayed scheduler skips missed beats instead of replaying a catch-up burst',async context=>{
 const {audio,engine,data}=await setup(context);warn(data);audio.update(data);attack(data);audio.update(data);
 const count=engine.oscillators.length;engine.currentTime+=120;engine.collect();context.mock.timers.tick(100);
 const resumed=engine.oscillators.slice(count);assert.ok(resumed.length>0&&resumed.length<=8,'one score beat, not two minutes of missed audio');assert.ok(resumed.every(node=>node.startAt>=engine.currentTime));
});

test('unmuting resumes the next musical beat, not the beginning or missed wall-clock beats',async context=>{
 const {audio,engine,advance}=await setup(context);advance(1);audio.setEnabled(false);advance(30);
 const count=engine.oscillators.length;audio.setEnabled(true);const resumed=engine.oscillators.slice(count);
 const expected=musicBeat(2).map(note=>440*2**((note.midi-69)/12)).sort((a,b)=>a-b);
 assert.deepEqual(resumed.map(rootFrequency).sort((a,b)=>a-b),expected);
 assert.ok(resumed.every(note=>Math.abs(note.startAt-(engine.currentTime+.06))<1e-8));
});

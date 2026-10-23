import test from 'node:test';
import assert from 'node:assert/strict';
import {createEstate,estateSnapshot,type EstateSnapshot} from '../src/v5/estate.ts';
import {createRaidCycle} from '../src/v5/raid-cycle.ts';
import {createThreat} from '../src/v5/threat.ts';
import {AudioCueTracker,audioScene,FarmAudio} from '../src/v5/estate-audio.ts';
const T=1_800_000_000_000;
function warning(id='natural-a'){
 const data=estateSnapshot(createEstate('raid-audio',T),T),p=data.profile;
 p.tutorial='done';p.opening!.stage='done';p.threat=null;p.raidCycle=createRaidCycle(7,T,0);
 p.raidCycle.phase='warning';p.raidCycle.pending={id,seed:7,risk:p.raidCycle.risk,wolves:1};return data;
}
function launch(data:EstateSnapshot){
 const p=data.profile;p.raidCycle!.phase='active';p.threat=createThreat({id:p.raidCycle!.pending!.id,seed:7,mode:'reassure',guardian:'dog',actors:p.animals.map(a=>({id:a.id,position:a.position}))},p.layout);
}

test('natural warning, real wolf arrival and completion each sound once for their actual event',()=>{
 const data=warning(),tracker=new AudioCueTracker();
 assert.deepEqual(tracker.update(audioScene(data),true),['warning']);
 for(let i=0;i<20;i++){data.profile.raidCycle!.warningMs-=200;assert.deepEqual(tracker.update(audioScene(data),true),[]);}
 data.profile.raidCycle!.phase='ready';assert.deepEqual(tracker.update(audioScene(data),true),[]);
 launch(data);assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.threat!.phase='complete';assert.deepEqual(tracker.update(audioScene(data),true),['safe']);
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
 assert.deepEqual(tracker.update(audioScene(warning('natural-b')),true),['warning']);
});

test('muted or background raids do not queue an expired warning or completion sound',()=>{
 const data=warning(),tracker=new AudioCueTracker();
 assert.deepEqual(tracker.update(audioScene(data),false),[]);
 launch(data);assert.deepEqual(tracker.update(audioScene(data),false),[]);
 assert.deepEqual(tracker.update(audioScene(data),true),['arrival'],'only the still-current wolf may sound');
 data.profile.threat!.phase='complete';assert.deepEqual(tracker.update(audioScene(data),false),[]);
 assert.deepEqual(tracker.update(audioScene(data),true),[]);
 const next=warning('next');assert.deepEqual(tracker.update(audioScene(next),false),[]);
 next.profile.raidCycle!.phase='peace';next.profile.raidCycle!.pending=null;
 assert.deepEqual(tracker.update(audioScene(next),true),[],'cancelled warning stays silent');
});

test('a current warning can sound after unmuting but repeated mute and ready snapshots do not repeat it',()=>{
 const data=warning(),tracker=new AudioCueTracker();
 tracker.update(audioScene(data),false);assert.deepEqual(tracker.update(audioScene(data),true),['warning']);
 tracker.update(audioScene(data),false);assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.raidCycle!.phase='ready';assert.deepEqual(tracker.update(audioScene(data),true),[]);
 data.profile.runId='reset';assert.deepEqual(tracker.update(audioScene(data),true),['warning']);
});

test('opening replay and an actual threat take precedence over an unrelated pending raid warning',()=>{
 const data=warning(),tracker=new AudioCueTracker(),before=structuredClone(data);
 assert.deepEqual(tracker.update(audioScene(data,{version:1,stage:'establish',elapsed:0,guardian:null},true),true),[]);
 assert.deepEqual(tracker.update(audioScene(data,{version:1,stage:'approach',elapsed:0,guardian:null},true),true),['arrival']);
 assert.deepEqual(data,before,'audio never writes saved raid state');
 launch(data);data.profile.raidCycle!.phase='warning';data.profile.raidCycle!.pending!.id='another';
 assert.deepEqual(tracker.update(audioScene(data),true),['arrival']);
});

// Minimal WebAudio boundary only: these assertions do not claim an audible browser check.
class Param{value=0;cancelScheduledValues(){}setValueAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}setTargetAtTime(v:number){this.value=v;}}
class AudioNode{gain=new Param();frequency=new Param();Q=new Param();type='';onended:(()=>void)|null=null;at=-1;stopAt=-1;connect(){}disconnect(){}start(at:number){this.at=at;}stop(at?:number){this.stopAt=at??0;}}
class Context{static last:Context;state='suspended';currentTime=0;destination=new AudioNode();oscillators:AudioNode[]=[];constructor(){Context.last=this;}createGain(){return new AudioNode();}createBiquadFilter(){return new AudioNode();}createOscillator(){const n=new AudioNode();this.oscillators.push(n);return n;}async resume(){this.state='running';}async close(){this.state='closed';}}
test('warning keeps its short two-note effect separate from the persistent music transition',async context=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});
 context.mock.timers.enable({apis:['setInterval']});const audio=new FarmAudio();
 try{
  await audio.unlock();const engine=Context.last,baseline=engine.oscillators.length;const data=warning();audio.update(data);
  const notes=engine.oscillators.slice(baseline);assert.equal(notes.length,2);assert.ok(notes[1].at>notes[0].at);assert.ok(notes.every(n=>n.stopAt-n.at<1));
  audio.update(data);assert.equal(engine.oscillators.length,baseline+2,'snapshot replay schedules no extra warning voices');
  launch(data);audio.update(data);assert.equal(engine.oscillators.length,baseline+6,'the real wolf arrival keeps its existing four voices');
 }finally{audio.dispose();context.mock.timers.reset();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});

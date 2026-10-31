import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioCueTracker,FarmAudio} from '../src/v5/estate-audio.ts';
import {MinimalAudioScenes} from '../src/minimal/audio.ts';
import {createMinimalState} from '../src/minimal/model.ts';

const T=1_800_000_000_000;
test('minimal archived wolf events stay silent and never create an arrival or recovery cue',()=>{
 const scenes=new MinimalAudioScenes(),tracker=new AudioCueTracker(),state=createMinimalState(T),quiet={scope:`minimal-farm:${T}`,eventId:null,warning:false,active:false,complete:false};
 assert.deepEqual(scenes.update(state),quiet);
 state.wolfEvent={startedAt:T+1000,endsAt:T+19000,helped:false};state.updatedAt=T+1000;const before=structuredClone(state);
 for(let i=0;i<100;i++){assert.deepEqual(scenes.update(state),quiet);assert.deepEqual(tracker.update(scenes.update(state),true),[]);}
 assert.deepEqual(state,before,'audio never writes archived defense data');
 state.wolfEvent.helped=true;assert.deepEqual(tracker.update(scenes.update(state),true),[]);
 state.wolfEvent=null;assert.deepEqual(scenes.update(state),quiet);assert.deepEqual(tracker.update(scenes.update(state),true),[]);
});

test('reload, expiry, reset and hidden completion cannot fabricate a recovery cue',()=>{
 const state=createMinimalState(T),scenes=new MinimalAudioScenes(),tracker=new AudioCueTracker();
 state.wolfEvent={startedAt:T-20000,endsAt:T-2000,helped:false};
 assert.equal(scenes.update(state).active,false,'expired saved raid never starts tense music');
 assert.deepEqual(tracker.update(scenes.update(state),true),[]);
 state.wolfEvent={startedAt:T,endsAt:T+18000,helped:false};
 assert.deepEqual(tracker.update(scenes.update(state),false),[]);
 state.wolfEvent=null;assert.deepEqual(tracker.update(scenes.update(state),false),[]);
 assert.deepEqual(tracker.update(scenes.update(state),true),[],'background completion is discarded');
 state.wolfEvent={startedAt:T+1,endsAt:T+18001,helped:false};tracker.update(scenes.update(state),true);
 assert.deepEqual(tracker.update(scenes.update(createMinimalState(T+50000)),true),[],'new farm is not old raid completion');
});

class Param{value=0;cancelScheduledValues(){}setValueAtTime(v:number){this.value=v;}linearRampToValueAtTime(v:number){this.value=v;}exponentialRampToValueAtTime(v:number){this.value=v;}}
class Node{gain=new Param();frequency=new Param();Q=new Param();type='';disconnected=false;onended:(()=>void)|null=null;connect(){}disconnect(){this.disconnected=true;}start(){}stop(){}}
class Context{
 static instances:Context[]=[];state='suspended';currentTime=0;destination=new Node();nodes:Node[]=[];oscillators:Node[]=[];closed=0;
 constructor(){Context.instances.push(this);}createGain(){const n=new Node();this.nodes.push(n);return n;}createBiquadFilter(){return this.createGain();}
 createOscillator(){const n=this.createGain();this.oscillators.push(n);return n;}async resume(){this.state='running';}async close(){this.closed++;this.state='closed';}
}

test('minimal adapter starts only on gesture, keeps one score, and disposes all resources',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});
 t.mock.timers.enable({apis:['setInterval']});Context.instances=[];
 const scenes=new MinimalAudioScenes(),audio=new FarmAudio(),state=createMinimalState(T);
 try{
  audio.updateScene(scenes.update(state));assert.equal(Context.instances.length,0);assert.equal(audio.status,'awaiting-gesture');
  await audio.unlock();const ctx=Context.instances[0];assert.equal(audio.status,'playing');assert.ok(ctx.oscillators.length>0);
  const calm=ctx.oscillators.length;for(let i=0;i<100;i++)audio.updateScene(scenes.update(state));assert.equal(ctx.oscillators.length,calm);
  state.wolfEvent={startedAt:T,endsAt:T+18000,helped:false};audio.updateScene(scenes.update(state));assert.equal(ctx.oscillators.length,calm);
  for(let i=0;i<100;i++)audio.updateScene(scenes.update(state));assert.equal(ctx.oscillators.length,calm);
  state.wolfEvent=null;audio.updateScene(scenes.update(state));assert.equal(ctx.oscillators.length,calm);
  for(let i=0;i<100;i++)audio.updateScene(scenes.update(state));assert.equal(ctx.oscillators.length,calm);
  audio.setVisible(false);assert.equal(audio.status,'paused');const hidden=ctx.oscillators.length;t.mock.timers.tick(10000);assert.equal(ctx.oscillators.length,hidden);
  audio.setEnabled(false);audio.setVisible(true);assert.equal(audio.status,'muted');
  audio.dispose();audio.dispose();assert.equal(ctx.closed,1);assert.ok(ctx.nodes.every(node=>node.disconnected));
  audio.updateScene(scenes.update(state));await audio.unlock();t.mock.timers.tick(10000);assert.equal(ctx.oscillators.length,hidden);
 }finally{audio.dispose();t.mock.timers.reset();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});

test('minimal audio gracefully reports unavailable when WebAudio is absent',async()=>{
 const descriptors=['AudioContext','webkitAudioContext'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
 const audio=new FarmAudio();try{
  for(const [key] of descriptors)Object.defineProperty(globalThis,key,{configurable:true,value:undefined});
  audio.updateScene(new MinimalAudioScenes().update(createMinimalState(T)));await audio.unlock();assert.equal(audio.status,'unavailable');
  audio.setVisible(false);audio.setEnabled(false);audio.dispose();
 }finally{for(const [key,descriptor] of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
});

test('accepted sale chime is short, once per animal, silent while muted or hidden, and never replays',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});
 t.mock.timers.enable({apis:['setInterval']});Context.instances=[];const audio=new FarmAudio();
 try{
  assert.equal(typeof audio.sale,'function','sale needs its own accepted-event sound');
  audio.sale('before-unlock');assert.equal(Context.instances.length,0);
  await audio.unlock();const ctx=Context.instances[0],before=ctx.oscillators.length;
  audio.sale('cow');assert.equal(ctx.oscillators.length,before+3);audio.sale('cow');assert.equal(ctx.oscillators.length,before+3);
  audio.setEnabled(false);audio.sale('muted');audio.setEnabled(true);const after=ctx.oscillators.length;audio.sale('muted');assert.equal(ctx.oscillators.length,after);
  audio.setVisible(false);audio.sale('hidden');audio.setVisible(true);const visible=ctx.oscillators.length;audio.sale('hidden');assert.equal(ctx.oscillators.length,visible);
 }finally{audio.dispose();t.mock.timers.reset();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');}
});

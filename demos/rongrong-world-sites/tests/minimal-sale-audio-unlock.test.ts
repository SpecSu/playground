import test from 'node:test';
import assert from 'node:assert/strict';
import {FarmAudio} from '../src/v5/estate-audio.ts';
class Param{value=0;setValueAtTime(){}linearRampToValueAtTime(){}exponentialRampToValueAtTime(){}cancelScheduledValues(){}}
class Node{gain=new Param();frequency=new Param();Q=new Param();connect(){}disconnect(){}start(){}stop(){}}
class Context{
 static current:Context;state='suspended';currentTime=0;destination=new Node();resumeCalls=0;onstatechange:()=>void=()=>{};resolve!:()=>void;reject!:(e:Error)=>void;promise=new Promise<void>((r,j)=>{this.resolve=r;this.reject=j;});
 constructor(){Context.current=this;}createGain(){return new Node();}createBiquadFilter(){return new Node();}createOscillator(){return new Node();}
 async resume(){this.resumeCalls++;await this.promise;this.state='running';this.onstatechange();}async close(){}
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
async function setup(t:test.TestContext){
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'AudioContext'),clock=Object.getOwnPropertyDescriptor(globalThis,'performance');let now=100;
 Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:Context});Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>now}});t.mock.timers.enable({apis:['setTimeout','setInterval']});
 const audio=new FarmAudio(),ready=audio.unlock(),ctx=Context.current,gesture={ready,startedAt:now};
 const effects=()=>{const a=audio as unknown as {voices:Set<{bus:unknown}>;effects:unknown};return [...a.voices].filter(v=>v.bus===a.effects).length;};
 t.after(()=>{audio.dispose();t.mock.timers.reset();if(descriptor)Object.defineProperty(globalThis,'AudioContext',descriptor);else Reflect.deleteProperty(globalThis,'AudioContext');if(clock)Object.defineProperty(globalThis,'performance',clock);});
 return {audio,ctx,gesture,effects,elapse(ms:number){now+=ms;},advance(ms:number){now+=ms;t.mock.timers.tick(ms);},async resolve(){ctx.resolve();await ready;await flush();}};
}
test('current gesture pending resume gives accepted sale exactly one cue without extra resume calls',async t=>{
 const f=await setup(t);f.audio.sale('cow',f.gesture);f.audio.sale('cow',f.gesture);assert.equal(f.effects(),0);f.advance(100);await f.resolve();assert.equal(f.effects(),3);assert.equal(f.ctx.resumeCalls,1);f.audio.sale('cow',f.gesture);assert.equal(f.effects(),3);
});
for(const mode of ['timeout','throttled-timeout','muted','hidden','disposed','rejected','no-token','old-token'] as const)test(`pending sale is permanently discarded for ${mode}`,async t=>{
 const f=await setup(t);if(mode==='old-token')f.advance(501);f.audio.sale('cow',mode==='no-token'?undefined:f.gesture);
 if(mode==='timeout')f.advance(501);if(mode==='throttled-timeout')f.elapse(501);
 if(mode==='muted'){f.audio.setEnabled(false);f.audio.setEnabled(true);}
 if(mode==='hidden'){f.audio.setVisible(false);f.audio.setVisible(true);}
 if(mode==='disposed')f.audio.dispose();
 if(mode==='rejected'){f.ctx.reject(new Error('resume rejected'));await f.gesture.ready;await flush();}else await f.resolve();
 assert.equal(f.effects(),0);f.audio.sale('cow',f.gesture);assert.equal(f.effects(),0);assert.equal(f.ctx.resumeCalls,1);
});
test('sale with no audio context never creates or resumes one even with a resolved token',async t=>{
 const f=await setup(t),audio=new FarmAudio();const current=Context.current;audio.sale('cow',{ready:Promise.resolve(),startedAt:100});await flush();assert.equal(Context.current,current);assert.equal(audio.status,'awaiting-gesture');audio.dispose();f.ctx.resolve();await f.gesture.ready;
});

test('pointer and click capture may both unlock but one accepted sale still schedules only one chime',async t=>{const f=await setup(t);const second={ready:f.audio.unlock(),startedAt:100};f.audio.sale('cow',second);f.audio.sale('cow',f.gesture);await f.resolve();await second.ready;await flush();assert.equal(f.effects(),3);assert.equal(f.ctx.resumeCalls,2,'only the two explicit gestures called resume');assert.equal((f.audio as unknown as {pendingSaleCues:Set<unknown>}).pendingSaleCues.size,0);});

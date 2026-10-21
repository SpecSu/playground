import test from 'node:test';
import assert from 'node:assert/strict';
import { FestivalAudio } from '../lib/festival-audio.ts';
class Param {value=0;events=[];cancelScheduledValues(t){this.events.push(['cancel',t]);}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}setTargetAtTime(v,t,d){this.value=v;this.events.push(['target',v,t,d]);}linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t]);}exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exponential',v,t]);}}
class Node {connections=[];connect(n){this.connections.push(n);return n;}disconnect(){this.connections=[];}start(...a){this.startArgs=a;}stop(...a){this.stopArgs=a;}}
class Context {
 state='suspended';currentTime=0;sampleRate=22050;destination=new Node();nodes=[];resumes=0;suspends=0;closes=0;blocked=false;gate=null;
 node(fields={}){const n=Object.assign(new Node(),fields);this.nodes.push(n);return n;}
 createGain(){return this.node({gain:new Param()});}createBiquadFilter(){return this.node({frequency:new Param(),Q:new Param()});}createOscillator(){return this.node({frequency:new Param(),detune:new Param()});}createBufferSource(){return this.node();}
 createDynamicsCompressor(){return this.node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
 createBuffer(c,l,s){const data=Array.from({length:c},()=>new Float32Array(l));return {length:l,sampleRate:s,getChannelData:i=>data[i]};}
 async resume(){this.resumes++;if(this.blocked)throw Error('blocked');if(this.gate)await this.gate;this.state='running';this.onstatechange?.();}
 async suspend(){this.suspends++;this.state='suspended';this.onstatechange?.();}async close(){this.closes++;this.state='closed';}
}
function fixture(){
 const ctx=new Context(),timers=new Map();let id=0,created=0;
 let frame={now:10000,round:{index:1,startsAt:0,burnAt:300000,ashesAt:335000,endsAt:345000},builders:[],listener:{x:0,z:0},selfId:'self'};
 const audio=new FestivalAudio({getFrame:()=>frame,createContext:()=>{created++;return ctx;},storage:{getItem:()=>null,setItem(){}},schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id)});
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const tick=async()=>{for(const[k,fn]of [...timers]){timers.delete(k);fn();}await flush();};
 return{ctx,audio,timers,created:()=>created,frame:()=>frame,setFrame:f=>frame=f,flush,tick};
}
test('independent audio QA: disabled scene never unlocks, pending resume cannot outlive disposal',async()=>{
 const h=fixture();h.audio.setActive(false,true);h.audio.requestFromGesture();assert.equal(h.created(),0);
 h.audio.setActive(true);let release;h.ctx.gate=new Promise(r=>release=r);h.audio.requestFromGesture();h.audio.dispose();release();await h.flush();
 assert.equal(h.audio.status.playing,false);assert.equal(h.timers.size,0);assert.equal(h.ctx.closes,1);assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));
});
test('independent audio QA: missing snapshot clears sound sources and phase jump seeks only present cues',async()=>{
 const h=fixture();h.audio.requestFromGesture();await h.flush();
 const previousSources=h.ctx.nodes.filter(n=>n.startArgs&&n.startArgs.length>0);
 h.setFrame(null);await h.tick();assert.ok(previousSources.every(n=>n.connections.length===0));
 const count=h.ctx.nodes.length;h.ctx.currentTime=320;h.setFrame({now:320000,round:{index:1,startsAt:0,burnAt:300000,ashesAt:335000,endsAt:345000},builders:[],listener:{x:0,z:0},selfId:'self'});await h.tick();
 assert.ok(h.ctx.nodes.slice(count).filter(n=>n.startArgs).every(n=>n.startArgs[0]>=320));h.audio.dispose();
});
test('independent audio QA: finished oscillator voices disconnect during an extended score',async()=>{
 const h=fixture();h.audio.requestFromGesture();await h.flush();
 for(let i=1;i<=1500;i++){
  h.ctx.currentTime=i*.06;h.setFrame({...h.frame(),now:10000+i*60});
  for(const n of h.ctx.nodes)if(n.onended&&n.stopArgs?.[0]<=h.ctx.currentTime)n.onended();
  await h.tick();
 }
 const live=h.ctx.nodes.filter(n=>n.connections.length>0);assert.ok(live.length<100,`bounded live graph: ${live.length}`);
 h.audio.dispose();assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));
});

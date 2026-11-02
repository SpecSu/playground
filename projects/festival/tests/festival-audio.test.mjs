import test from 'node:test';
import assert from 'node:assert/strict';
import {FestivalAudio, FESTIVAL_MUTE_KEY, musicEvents, hammerEvents, createFestivalNoise} from '../lib/festival-audio.ts';

const round = {index:1, startsAt:0, burnAt:300000, ashesAt:335000, endsAt:345000};
test('daytime score has warm chords, bass and sparse melody; burn leaves space for the recording',()=>{
 const day=musicEvents(round,0,27000), burn=musicEvents(round,300000,310000);
 assert.ok(day.some(e=>e.kind==='pad'&&e.notes.length===4));
 assert.ok(day.some(e=>e.kind==='bass')); assert.ok(day.some(e=>e.kind==='pluck'));
 assert.deepEqual(burn,[],'the recording has no procedural ceremony layers');
 assert.ok(day.every(e=>e.notes.every(n=>n<=74)),'no piercing high notes');
 const a=musicEvents(round,1000,1100),b=musicEvents(round,1000,1100);assert.deepEqual(a,b);
 assert.ok(musicEvents(round,335000,345000).every(e=>e.kind==='pad'),'ashes settle to pads');
 assert.deepEqual(musicEvents(round,345000,350000),[],'old round never continues');
});
test('lookahead windows are disjoint and no note before window is replayed',()=>{
 const all=musicEvents(round,0,4000), parts=[...musicEvents(round,0,1300),...musicEvents(round,1300,4000)];
 assert.deepEqual(parts,all);assert.ok(musicEvents(round,212000,212180).every(e=>e.at>=212000));
});
test('hammer follows .6s pickup plus .76 of 1.2s downstroke and caps nearby voices',()=>{
 const builders=Array.from({length:6},(_,i)=>({id:String(i),arrivalAt:1000,finishAt:21000,x:i,z:0}));
 const cues=hammerEvents(builders,{x:0,z:0},'5',2500,2600,300000);
 assert.equal(cues.length,3); assert.equal(cues[0].id,'5');assert.ok(cues.every(e=>e.at===2512));
 assert.deepEqual(hammerEvents(builders,{x:0,z:0},'5',2600,3700,300000),[]);
 assert.equal(hammerEvents(builders,{x:0,z:0},'5',3700,3800,300000).length,3);
 // Even a stale longer task cannot schedule impacts after the current 12s limit.
 assert.deepEqual(hammerEvents(builders,{x:0,z:0},'5',13000,21000,300000),[]);
 assert.deepEqual(hammerEvents(builders,{x:0,z:0},'5',21000,22000,300000),[]);
 assert.deepEqual(hammerEvents(builders,{x:0,z:0},'5',2500,2600,2500),[]);
 assert.deepEqual(hammerEvents(builders,{x:100,z:100},'',2500,2600,300000),[]);
});
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
function setup(muted=false){const ctx=new Context(),timers=new Map(),saved=new Map([[FESTIVAL_MUTE_KEY,String(muted)]]);let id=0,created=0,now=10000,builders=[];
 const audio=new FestivalAudio({createContext:()=>{created++;return ctx;},storage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},getFrame:()=>({now,round,builders,listener:{x:0,z:0},selfId:''}),schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id)});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};const tick=async()=>{for(const [k,f]of [...timers]){timers.delete(k);f();}await flush();};
 return {audio,ctx,saved,timers,flush,tick,created:()=>created,setNow:n=>now=n,setBuilders:b=>builders=b};}
test('visitor speaker starts on first gesture; no context before it; truthful playing state',async()=>{const h=setup();h.audio.setActive(true);assert.equal(h.created(),0);h.audio.toggleFromGesture();assert.equal(h.ctx.resumes,1);await h.flush();assert.equal(h.audio.status.playing,true);assert.equal(h.audio.status.muted,false);assert.ok(h.ctx.nodes.some(n=>n.frequency?.events.length));h.audio.dispose();assert.equal(h.ctx.closes,1);assert.equal(h.timers.size,0);});
test('saved mute survives join gestures and toggles persist',async()=>{const h=setup(true);h.audio.requestFromGesture();assert.equal(h.created(),0);h.audio.toggleFromGesture();await h.flush();assert.equal(h.audio.status.playing,true);assert.equal(h.saved.get(FESTIVAL_MUTE_KEY),'false');h.audio.toggleFromGesture();await h.tick();assert.equal(h.ctx.state,'suspended');assert.equal(h.saved.get(FESTIVAL_MUTE_KEY),'true');h.audio.requestFromGesture();assert.equal(h.audio.status.playing,false);h.audio.dispose();});
test('autoplay denial can retry and explicit mute beats a pending resume',async()=>{const h=setup();h.ctx.blocked=true;h.audio.requestFromGesture();await h.flush();assert.equal(h.audio.status.playing,false);assert.equal(h.audio.status.needsGesture,true);h.ctx.blocked=false;h.audio.toggleFromGesture();await h.flush();assert.equal(h.audio.status.playing,true);h.audio.dispose();const p=setup();let release;p.ctx.gate=new Promise(r=>release=r);p.audio.requestFromGesture();p.audio.toggleFromGesture();release();await p.flush();assert.equal(p.audio.status.muted,true);assert.equal(p.ctx.state,'suspended');p.audio.dispose();});
test('hidden/profile/disconnect suspend and resume seeks current score without backlog',async()=>{const h=setup();h.audio.requestFromGesture();await h.flush();h.audio.setActive(false,true);await h.flush();assert.equal(h.ctx.state,'suspended');const n=h.ctx.nodes.length;h.setNow(210000);h.ctx.currentTime=200;h.audio.setActive(true);await h.flush();assert.equal(h.audio.status.playing,true);const starts=h.ctx.nodes.slice(n).filter(n=>n.startArgs);assert.ok(starts.length);assert.ok(starts.every(n=>n.startArgs[0]>=200));h.audio.dispose();});
test('interrupted audio clears queued notes and reports needs gesture; disposal cancels all nodes',async()=>{const h=setup();h.audio.requestFromGesture();await h.flush();h.ctx.state='suspended';h.ctx.onstatechange();assert.equal(h.audio.status.playing,false);assert.equal(h.audio.status.needsGesture,true);h.audio.dispose();assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));});
test('generated noise is deterministic, centered, finite and softly bounded without files',()=>{const a=createFestivalNoise(22050),b=createFestivalNoise(22050);assert.deepEqual(a,b);let mean=0,peak=0;for(const n of a){assert.ok(Number.isFinite(n));mean+=n;peak=Math.max(peak,Math.abs(n));}assert.ok(Math.abs(mean/a.length)<.001);assert.ok(peak<=.81);});
test('browser-managed resume restarts current phrase and truthful status after interruption',async()=>{const h=setup();h.audio.requestFromGesture();await h.flush();h.ctx.state='suspended';h.ctx.onstatechange();h.setNow(312000);h.ctx.currentTime=302;h.ctx.state='running';h.ctx.onstatechange();assert.equal(h.audio.status.playing,true);assert.equal(h.audio.status.needsGesture,false);assert.equal(h.timers.size,1);h.audio.dispose();});

test('cancelled or replaced construction cancels scheduled hammer sources without stopping music',async()=>{const h=setup();h.setNow(2500);h.setBuilders([{id:'a',arrivalAt:1000,finishAt:21000,x:0,z:0}]);h.audio.requestFromGesture();await h.flush();const hammer=h.ctx.nodes.find(n=>n.startArgs?.[1]===.8);assert.ok(hammer,'queued future impact exists');h.setNow(2505);h.setBuilders([]);await h.tick();assert.deepEqual(hammer.connections,[],'cancel removed the queued impact');assert.equal(h.audio.status.playing,true);h.audio.dispose();});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as score from '../lib/festival-audio.ts';
const round={index:1,startsAt:0,burnAt:300000,ashesAt:335000,endsAt:345000};
class Param {value=0;events=[];cancelScheduledValues(t){this.events.push(['cancel',t]);}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);}setTargetAtTime(v,t,d){this.value=v;this.events.push(['target',v,t,d]);}linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t]);}exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exp',v,t]);}}
class Node {connections=[];connect(n){this.connections.push(n);return n;}disconnect(){this.connections=[];}start(...a){this.startArgs=a;}stop(...a){this.stopArgs=a;}}
class Context {
 state='suspended';currentTime=0;sampleRate=22050;destination=new Node();nodes=[];decodes=0;decodeGate=null;
 node(fields={}){const n=Object.assign(new Node(),fields);this.nodes.push(n);return n;}
 createGain(){return this.node({gain:new Param()});}createBiquadFilter(){return this.node({frequency:new Param(),Q:new Param()});}createOscillator(){return this.node({frequency:new Param(),detune:new Param()});}createBufferSource(){return this.node();}
 createDynamicsCompressor(){return this.node(Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,new Param()])));}
 createBuffer(c,l,s){const data=Array.from({length:c},()=>new Float32Array(l));return {length:l,sampleRate:s,duration:l/s,getChannelData:i=>data[i]};}
 async decodeAudioData(data){this.decodes++;if(this.decodeGate)await this.decodeGate;const asset=new Uint8Array(data)[0];return {duration:asset===3?64:10,asset};}
 async resume(){this.state='running';this.onstatechange?.();}async suspend(){this.state='suspended';this.onstatechange?.();}async close(){this.state='closed';}
}
function setup({fail=false,loadGate=null}={}){const contexts=[new Context()],timers=new Map(),loads=[];let id=0,created=0,now=310000,currentRound=round;
 const audio=new score.FestivalAudio({createContext:()=>{if(created)contexts.push(new Context());return contexts[created++];},storage:{getItem:()=>null,setItem(){}},getFrame:()=>({now,round:currentRound,builders:[],listener:{x:0,z:0},selfId:''}),loadAsset:async(url)=>{loads.push(url);if(loadGate)await (typeof loadGate==='function'?loadGate(url):loadGate);if(typeof fail==='function'?fail(url):fail)throw Error('offline');return Uint8Array.of(url.includes('arabic')?3:url.includes('fire')?1:2).buffer;},schedule:fn=>{timers.set(++id,fn);return id;},cancel:id=>timers.delete(id)});
 const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};const tick=async()=>{for(const[k,fn]of[...timers]){timers.delete(k);fn();}await flush();};
 return{audio,get ctx(){return contexts.at(-1);},contexts,loads,timers,created:()=>created,setNow:n=>now=n,setRound:r=>currentRound=r,flush,tick};}
const recorded=h=>h.ctx.nodes.filter(n=>n.buffer?.asset&&n.startArgs);
const music=h=>recorded(h).filter(n=>n.buffer.asset===3);
const live=h=>recorded(h).filter(n=>n.connections.length);
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} versus ${expected}`);

test('ceremony smoothly crossfades with restrained effects and fades fully at ashes',()=>{
 const day=score.ceremonyMix(round,290000),build=score.ceremonyMix(round,295500),peak=score.ceremonyMix(round,322000),ash=score.ceremonyMix(round,339000);
 assert.deepEqual(day,{day:1,burn:0,fire:0,crowd:0});assert.ok(build.day>0&&build.day<1&&build.burn>0&&build.burn<1);assert.equal(build.fire,0);
 assert.ok(peak.burn>.7&&peak.fire>.15&&peak.crowd>.1);assert.ok(peak.fire<peak.burn/3&&peak.crowd<peak.burn/3);assert.equal(peak.day,0);
 assert.equal(ash.burn,0);assert.equal(ash.crowd,0);assert.equal(ash.fire,0);assert.ok(ash.day>0);
 for(let now=290000;now<=345000;now+=25)for(const value of Object.values(score.ceremonyMix(round,now)))assert.ok(Number.isFinite(value)&&value>=0&&value<=1);
 assert.deepEqual(score.ceremonyMix(round,345000),{day:0,burn:0,fire:0,crowd:0});
});
test('all recordings preload without opening audio and a late join seeks shared time exactly',async()=>{
 const h=setup();await h.audio.preload();assert.equal(h.created(),0);assert.equal(h.loads.length,3);assert.equal(h.ctx.nodes.length,0);
 h.setNow(312500);h.audio.requestFromGesture();await h.flush();await h.tick();
 assert.equal(recorded(h).length,3);const track=music(h)[0];assert.equal(track.loop,false);close(track.startArgs[0],.015);close(track.startArgs[1],28.7725);close(track.stopArgs[0],22.5);
 assert.ok(recorded(h).filter(n=>n.buffer.asset!==3).every(n=>n.loop&&Math.abs(n.startArgs[1]-2.5)<.001));
 await h.tick();assert.equal(recorded(h).length,3,'one source per recording');h.audio.dispose();assert.equal(h.timers.size,0);
});
test('pre-roll is scheduled once and survives uninterrupted through ignition',async()=>{
 const h=setup();h.setNow(290900);h.audio.requestFromGesture();await h.flush();await h.tick();
 const track=music(h)[0];assert.ok(track);close(track.startArgs[0],.1);close(track.startArgs[1],7.2575);assert.equal(track.loop,false);
 for(let i=1;i<=180;i++){h.ctx.currentTime=i*.06;h.setNow(290900+i*60);await h.tick();}
 assert.equal(music(h).length,1);assert.ok(track.connections.length);h.audio.dispose();
});
test('independent clients enter the identical recording position for identical server time',async()=>{
 const a=setup(),b=setup();a.ctx.currentTime=40;b.ctx.currentTime=300;a.setNow(321234);b.setNow(321234);
 a.audio.requestFromGesture();b.audio.requestFromGesture();await a.flush();await b.flush();await a.tick();await b.tick();
 close(music(a)[0].startArgs[1],music(b)[0].startArgs[1]);close(music(a)[0].startArgs[0]-40,music(b)[0].startArgs[0]-300);a.audio.dispose();b.audio.dispose();
});
test('mute, hidden return and interruptions replace the source at current phase without replay',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();await h.tick();const first=music(h)[0];
 h.audio.toggleFromGesture();await h.tick();assert.equal(h.ctx.state,'suspended');assert.equal(first.connections.length,0);
 h.setNow(320000);h.ctx.currentTime=20;h.audio.toggleFromGesture();await h.flush();await h.tick();close(music(h).at(-1).startArgs[1],36.2725);assert.equal(live(h).filter(n=>n.buffer.asset===3).length,1);
 h.audio.setActive(false,true);assert.equal(live(h).length,0);h.setNow(325000);h.ctx.currentTime=25;h.audio.setActive(true);await h.flush();await h.tick();close(music(h).at(-1).startArgs[1],41.2725);
 h.ctx.state='suspended';h.ctx.onstatechange();assert.equal(live(h).length,0);h.setNow(327000);h.ctx.currentTime=27;h.ctx.state='running';h.ctx.onstatechange();await h.tick();close(music(h).at(-1).startArgs[1],43.2725);
 h.audio.dispose();assert.ok(h.ctx.nodes.every(n=>n.connections.length===0));
});
test('late decoding seeks the current passage and disposal prevents delayed starts',async()=>{
 let release;const h=setup();h.ctx.decodeGate=new Promise(r=>release=r);h.audio.requestFromGesture();await h.flush();assert.equal(music(h).length,0);
 h.setNow(323000);h.ctx.currentTime=13;release();await h.flush();await h.tick();close(music(h)[0].startArgs[1],39.2725);h.audio.dispose();
 let finish;const p=setup({loadGate:new Promise(r=>finish=r)});p.audio.requestFromGesture();p.audio.dispose();finish();await p.flush();assert.equal(p.ctx.decodes,0);assert.equal(recorded(p).length,0);assert.equal(p.timers.size,0);
});
test('ashes and round rollover cancel music, while clock refinements leave playback alone',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();await h.tick();const first=music(h)[0];
 h.setNow(314000);await h.tick();assert.ok(first.connections.length,'a same-round clock refinement never interrupts the short recording');assert.equal(music(h).length,1);
 h.setNow(335000);h.ctx.currentTime=25;await h.tick();assert.equal(live(h).filter(n=>n.buffer.asset===3).length,0,'music is stopped at ashes');
 h.setRound({...round,index:2,startsAt:345000,burnAt:645000,ashesAt:680000,endsAt:690000});h.setNow(645000);h.ctx.currentTime=335;await h.tick();close(music(h).at(-1).startArgs[1],16.2725);assert.equal(live(h).filter(n=>n.buffer.asset===3).length,1);h.audio.dispose();
});
test('closed context recovery decodes cached bytes and keeps one current music source',async()=>{
 const h=setup();h.audio.requestFromGesture();await h.flush();await h.tick();const previous=h.ctx;previous.state='closed';previous.onstatechange();h.setNow(319000);h.audio.requestFromGesture();await h.flush();await h.tick();
 assert.equal(h.created(),2);assert.equal(h.loads.length,3);assert.equal(live(h).filter(n=>n.buffer.asset===3).length,1);close(music(h)[0].startArgs[1],35.2725);assert.ok(previous.nodes.every(n=>n.connections.length===0));h.audio.dispose();
});
test('failed music stays silent without synthesized replacement and retries only on request',async()=>{
 let offline=true;const h=setup({fail:url=>offline&&url.includes('arabic')});h.audio.requestFromGesture();await h.flush();await h.tick();
 assert.equal(h.loads.length,3);assert.equal(live(h).length,2);assert.equal(music(h).length,0);assert.ok(!h.ctx.nodes.some(n=>n.startArgs&&n.frequency),'no procedural burn voices');
 for(let i=0;i<8;i++)await h.tick();assert.equal(h.loads.length,3);
 offline=false;h.setNow(316000);h.audio.requestFromGesture();await h.flush();await h.tick();assert.equal(h.loads.length,4);assert.equal(h.ctx.decodes,3);close(music(h)[0].startArgs[1],32.2725);
 h.audio.setActive(false,true);h.audio.setActive(true);await h.flush();await h.tick();assert.equal(h.loads.length,4);h.audio.dispose();
});
test('persistent failures retry once on resume and concurrent requests share in-flight work',async()=>{
 const h=setup({fail:true});h.audio.requestFromGesture();await h.flush();assert.equal(h.loads.length,3);h.audio.setActive(false,true);h.audio.setActive(true);await h.flush();assert.equal(h.loads.length,6);
 for(let i=0;i<8;i++)await h.tick();assert.equal(h.loads.length,6);h.audio.dispose();
 let finish;const p=setup({loadGate:new Promise(r=>finish=r)});p.audio.requestFromGesture();p.audio.requestFromGesture();await p.flush();assert.equal(p.loads.length,3);finish();await p.flush();await p.tick();assert.equal(p.ctx.decodes,3);assert.equal(live(p).length,3);p.audio.dispose();
});
test('whole build, burn and ashes keep exactly one music source then release it',async()=>{
 const h=setup();h.setNow(291000);h.audio.requestFromGesture();await h.flush();await h.tick();let peak=0;
 for(let i=1;i<=900;i++){h.ctx.currentTime=i*.06;h.setNow(291000+i*60);for(const n of h.ctx.nodes)if(n.onended&&n.stopArgs?.[0]<=h.ctx.currentTime)n.onended();await h.tick();peak=Math.max(peak,live(h).filter(n=>n.buffer.asset===3).length);}
 assert.equal(peak,1);assert.equal(music(h).length,1);assert.equal(live(h).filter(n=>n.buffer.asset===3).length,0);h.audio.dispose();
});
test('bundled effects retain their CC0 source credits and all asset measurements match bytes',()=>{
 const credits=readFileSync(new URL('../public/audio/festival/CREDITS.txt',import.meta.url),'utf8');for(const term of ['BeeProductive','AntumDeluge','CC0'])assert.ok(credits.includes(term));
 for(const file of ['crowd-cheer.mp3','fire-crackle.mp3'])assert.ok(statSync(new URL('../public/audio/festival/'+file,import.meta.url)).size<250000);
 const report=JSON.parse(readFileSync(new URL('../public/audio/festival/MEASUREMENTS.json',import.meta.url),'utf8'));assert.equal(report.audiblePlayback,false);
 for(const asset of report.bundled){const bytes=readFileSync(new URL('../public/audio/festival/'+asset.filename,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.ok(asset.samplePeak>0&&asset.samplePeak<1);assert.equal(asset.nonFiniteSamples,0);assert.ok(Math.abs(asset.dcOffset)<(asset.filename==='arabic-nights-128beat.mp3'?.001:.0001),'unchanged music DC is below -60 dBFS');}
});

test('a stalled optional effect never blocks ready music or fire from decoding and starting',async()=>{
 let finish;const gate=new Promise(r=>finish=r),h=setup({loadGate:url=>url.includes('crowd')?gate:Promise.resolve()});
 h.audio.requestFromGesture();await h.flush();await h.tick();
 assert.equal(h.ctx.decodes,2,'ready music and fire decode independently');assert.equal(music(h).length,1);assert.equal(live(h).length,2);
 finish();await h.flush();await h.tick();assert.equal(h.ctx.decodes,3);assert.equal(live(h).length,3);assert.equal(music(h).length,1);h.audio.dispose();
});

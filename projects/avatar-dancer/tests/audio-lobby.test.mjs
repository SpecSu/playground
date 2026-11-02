import {createPerformancePlaylist} from '../src/performance-playlist.js';
import {createAvatarCreationStore} from '../src/avatar-creation.js';
import {createAvatarGeneration} from '../src/avatar-generation.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioTransport} from '../src/audio.js';
class Context {
 constructor(){this.currentTime=0;this.sampleRate=48000;this.destination={};this.sources=[];}
 resume(){return this.pendingResume||Promise.resolve()}
 decodeAudioData(){this.decodeCount=(this.decodeCount||0)+1;return this.pendingDecode||Promise.resolve({duration:30.407,sampleRate:44100})}
 createGain(){return {gain:{value:1,events:[],setTargetAtTime(v){this.value=v},setValueAtTime(v,t){this.events.push(['set',v,t]);this.value=v},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);this.value=v},cancelScheduledValues(){}},connect(){},disconnect(){}}}
 createBuffer(channels,length,rate){const data=Array.from({length:channels},()=>new Float32Array(length));return {duration:length/rate,sampleRate:rate,getChannelData:i=>data[i]}}
 createBufferSource(){const s={connect(node){this.output=node},disconnect(){this.disconnected=true},start(){this.started=true},stop(at){this.stoppedAt=at??0}};this.sources.push(s);return s;}
}
globalThis.AudioContext=Context;
const recordingResponse=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
globalThis.fetch=async()=>recordingResponse();
test('lobby is silent until gesture, then one looping Disco recording fades in',async()=>{
 const a=new AudioTransport();a.setLobby(true);assert.equal(a.context,null);await a.unlock();const s=a.lobbySource;assert(s?.started);assert.equal(s.loop,true);assert.deepEqual(a.lobbyGain.gain.events,[['set',0,0],['ramp',.36,1.2]]);assert(a.lobbyGain.gain.value>0&&a.lobbyGain.gain.value<.4);await a.unlock();a.setLobby(true);assert.equal(a.context.sources.length,1);
 assert.equal(s.buffer.duration,30.407);assert.equal(s.buffer.sampleRate,44100);
});
test('dance replaces lobby; pause stays silent; lobby return honors master mute',async()=>{
 const a=new AudioTransport();await a.unlock();const lobby=a.lobbySource,lobbyGain=a.lobbyGain;a.buffer={duration:77};assert.equal(await a.play(),true);assert.equal(a.lobbySource,null);assert.equal(lobby.stoppedAt,.3);assert.deepEqual(lobbyGain.gain.events.at(-1),['ramp',0,.3]);a.pause();assert.equal(a.lobbySource,null);a.mute(true);a.stop();a.setLobby(true);assert(a.lobbySource);assert.equal(a.gain.gain.value,0);a.mute(false);assert.equal(a.gain.gain.value,.75);
});
test('hidden lobby cancels pending unlock and restores only current mode on return',async()=>{
 const a=new AudioTransport();await a.init();let resolve;a.context.pendingResume=new Promise(r=>resolve=r);const pending=a.unlock();a.setActive(false);resolve();await pending;assert.equal(a.lobbySource,null);a.setActive(true);assert(a.lobbySource);a.setActive(false);assert.equal(a.lobbySource,null);a.setLobby(false);a.setActive(true);assert.equal(a.lobbySource,null);
});
test('hidden tab cancels in-flight dance play instead of starting background music',async()=>{
 const a=new AudioTransport();await a.init();a.buffer={duration:77};let resolve;a.context.pendingResume=new Promise(r=>resolve=r);const pending=a.play();a.setActive(false);resolve();assert.equal(await pending,false);assert.equal(a.playing,false);
});

test('app connects gesture, mute, visibility and lobby-return to the real transport',async()=>{
 const fs=await import('node:fs');const {RhythmGame}=await import('../src/rhythm.js');const {makeChart,estimateTempo}=await import('../src/audio.js');
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks,transport;const handlers={};
 const replacements={createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createAvatarCreationStore,createAvatarGeneration,AudioTransport:class extends AudioTransport{constructor(){super();transport=this;}},RhythmGame,makeChart,estimateTempo,versionCharacterManifest:x=>x,createDailyScores:()=>({getRows:()=>[],recordCompleted(){}}),
 createUI(c){callbacks=c;return {setMode(){},toast(){},setTrack(){},updateGame(){}}},createStage:async()=>({available:false,setMode(){}}),
 document:{hidden:false,querySelector:()=>({}),addEventListener(type,fn){handlers[type]=fn}},window:{addEventListener(type,fn){handlers[type]=fn}},requestAnimationFrame(){},fetch:async()=>({...recordingResponse(),json:async()=>({})})};
 const saved=new Map(Object.keys(replacements).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{Object.assign(globalThis,replacements);await import('data:text/javascript,'+encodeURIComponent(source)+'#lobby-audio');await new Promise(r=>setImmediate(r));assert.equal(transport.context,null);assert.equal(typeof handlers.pointerdown,'function');await handlers.pointerdown();assert(transport.lobbySource);callbacks.onMute(true);assert.equal(transport.gain.gain.value,0);document.hidden=true;handlers.visibilitychange();assert.equal(transport.lobbySource,null);document.hidden=false;handlers.visibilitychange();assert(transport.lobbySource);transport.setLobby(false);callbacks.onLobby();assert(transport.lobbySource);assert.equal(transport.gain.gain.value,0);handlers.pagehide();assert.equal(transport.lobbySource,null);handlers.pageshow();assert(transport.lobbySource);
 }finally{for(const [key,d] of saved){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}}
});

test('tab hiding silences even the short retiring lobby fade',async()=>{
 const a=new AudioTransport();await a.unlock();const old=a.lobbySource;a.buffer={duration:77};await a.play();assert.equal(old.stoppedAt,.3);a.setActive(false);assert.equal(old.stoppedAt,0);assert.equal(a.retiringLobby.size,0);assert.equal(a.playing,false);
});

test('lobby recording is loaded once and late decode cannot start after leaving',async()=>{
 const a=new AudioTransport();await a.init();let resolve;a.context.pendingDecode=new Promise(r=>resolve=r);const first=a.unlock(),second=a.unlock();await new Promise(r=>setImmediate(r));a.setLobby(false);resolve({duration:30.407});await Promise.all([first,second]);assert.equal(a.lobbySource,null);assert.equal(a.context.sources.length,0);a.setLobby(true);assert(a.lobbySource);assert.equal(a.context.sources.length,1);assert.equal(a.context.decodeCount,1);
});
test('failed lobby recording load is retryable without replacing gameplay buffer',async()=>{
 const a=new AudioTransport(),track={duration:77};a.buffer=track;const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:false});try{await assert.rejects(a.unlock(),/准备音乐/);assert.equal(a.lobbySource,null);assert.equal(a.buffer,track);}finally{globalThis.fetch=originalFetch;}await a.unlock();assert(a.lobbySource);assert.equal(a.buffer,track);
});

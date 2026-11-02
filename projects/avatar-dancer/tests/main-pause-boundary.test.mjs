import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RhythmGame} from '../src/rhythm.js';
import {versionCharacterManifest} from '../src/asset-revision.js';
import {createPerformancePlaylist} from '../src/performance-playlist.js';
import {createAvatarCreationStore} from '../src/avatar-creation.js';
import {createAvatarGeneration} from '../src/avatar-generation.js';

async function fixture(tag){
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks,audio,uiMode='lobby',stageMode='lobby',results=0,completed=0,frame;
 const docEvents=new Map(),windowEvents=new Map();
 const replacements={RhythmGame,versionCharacterManifest,createAvatarCreationStore,createAvatarGeneration,
 createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createDailyScores:()=>({getRows:()=>[],recordCompleted(){completed++}}),
 AudioTransport:class{constructor(){audio=this;this.duration=10;this.time=0;this.pauses=0;this.active=true;}setLobby(){}async load(){return true}stop(){this.time=0}async play(){return true}pause(){this.pauses++}setActive(value){this.active=value}cancelLoad(){}},
 makeChart:()=>[],estimateTempo:()=>({}),
 createUI(c){callbacks=c;return {setMode(value){uiMode=value},setTrack(){},setLoading(){},updateGame(){},toast(){},showResults(){results++;uiMode='results'},getSelection:()=>({outfit:0})}},
 createStage:()=>({setAssetManifest(){},setCharacter(){return true},setBPM(){},setMode(value){stageMode=value},hit(){},update(){}}),
 document:{hidden:false,querySelector:()=>({}),addEventListener:(type,listener)=>docEvents.set(type,listener)},
 window:{addEventListener:(type,listener)=>windowEvents.set(type,listener)},
 requestAnimationFrame:callback=>{frame=callback},fetch:async url=>({ok:true,json:async()=>url.includes('metadata')?{bpm:170,duration:10,chart:[{time:1,lane:0}]}:{}}),
 };
 const saved=new Map(Object.keys(replacements).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,replacements);
 const cleanup=()=>{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}};
 try{await import('data:text/javascript,'+encodeURIComponent(source)+'#pause-'+tag);await new Promise(resolve=>setImmediate(resolve));await callbacks.onStart();}
 catch(error){cleanup();throw error;}
 return {callbacks,audio,doc:replacements.document,docEvents,windowEvents,frame:()=>frame(performance.now()),get state(){return {game:window.__encoreDiagnostics().game,uiMode,stageMode,results,completed}},cleanup};
}

for(const trigger of ['pause-button','visibilitychange','pagehide'])test(`end-boundary ${trigger} preserves results instead of reopening pause`,async()=>{
 const f=await fixture(trigger);try{
 f.audio.time=10;
 const pause=()=>{if(trigger==='pause-button')f.callbacks.onPause();else if(trigger==='visibilitychange'){f.doc.hidden=true;f.docEvents.get(trigger)();}else f.windowEvents.get(trigger)();};
 pause();assert.deepEqual(f.state,{game:'ended',uiMode:'results',stageMode:'results',results:1,completed:1});
 assert.equal(f.audio.pauses,1);pause();f.frame();await f.callbacks.onResume();
 assert.deepEqual(f.state,{game:'ended',uiMode:'results',stageMode:'results',results:1,completed:1});
 if(trigger!=='pause-button')assert.equal(f.audio.active,false);
 }finally{f.cleanup();}
});

test('normal pause freezes the round and resume continues without premature completion',async()=>{
 const f=await fixture('normal');try{f.audio.time=4;f.callbacks.onPause();assert.deepEqual(f.state,{game:'paused',uiMode:'paused',stageMode:'paused',results:0,completed:0});assert.equal(f.audio.pauses,1);f.callbacks.onPause();assert.equal(f.audio.pauses,1);await f.callbacks.onResume();assert.deepEqual(f.state,{game:'playing',uiMode:'playing',stageMode:'playing',results:0,completed:0});f.audio.time=10;f.frame();assert.equal(f.state.uiMode,'results');assert.equal(f.state.completed,1);}finally{f.cleanup();}
});

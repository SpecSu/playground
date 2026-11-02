import {createPerformancePlaylist} from '../src/performance-playlist.js';
import {createAvatarCreationStore} from '../src/avatar-creation.js';
import {createAvatarGeneration} from '../src/avatar-generation.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {RhythmGame} from '../src/rhythm.js';import {versionCharacterManifest} from '../src/asset-revision.js';
test('main forwards judged hits once, distinguishes wrong keys, aborts to lobby, and records completion once',async()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks,transport,frame;const hits=[],modes=[],completed=[],turns=[],button={};
 const replacements={createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createAvatarCreationStore,createAvatarGeneration,
  AudioTransport:class{constructor(){transport=this;this.duration=10;this.time=0;}setLobby(){}async load(){return {}}stop(){this.time=0}async play(){return true}pause(){}tap(){}cancelLoad(){}},
  RhythmGame,versionCharacterManifest,makeChart:()=>[{lane:0,time:1},{lane:1,time:1},{lane:2,time:2}],estimateTempo:()=>({}),
  createDailyScores:()=>({getRows:()=>[{name:'你',score:0,self:true}],recordCompleted:s=>completed.push(s)}),
  createUI(c){callbacks=c;return {setMode(){},toast(){},setTrack(){},setLoading(){},getSelection:()=>({outfit:0}),updateGame(){},showResults(){}}},
  createStage:()=>({available:true,setAssetManifest(){},setCharacter(){},setBPM(){},rotateAvatar:delta=>{turns.push(delta);return true},setMode:m=>modes.push(m),hit:(...args)=>hits.push(args),update(){}}),
  document:{querySelector:s=>s==='.start-button'?button:{},addEventListener(){}},window:{addEventListener(){}},
  requestAnimationFrame:fn=>{frame=fn},fetch:async url=>({ok:true,json:async()=>url.includes('metadata')?{bpm:170,duration:10,chart:[{lane:0,time:1},{lane:1,time:1},{lane:2,time:2}]}:{}}),
 };
 const saved=new Map(Object.keys(replacements).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  Object.assign(globalThis,replacements);await import('data:text/javascript,'+encodeURIComponent(source)+'#motion');await new Promise(r=>setImmediate(r));assert.equal(callbacks.onRotateAvatar(.3),true);assert.deepEqual(turns,[.3]);await callbacks.onStart();assert.equal(callbacks.onRotateAvatar(.4),false);assert.deepEqual(turns,[.3]);
  transport.time=1;callbacks.onHit(0);assert.deepEqual(hits,[[0,'perfect',{kind:'note',noteTime:1}]]);
  callbacks.onHit(3);assert.deepEqual(hits.at(-1),[3,'miss',{kind:'wrong'}]);
  transport.time=1.2;frame(performance.now());assert(hits.some(x=>x[0]===1&&x[1]==='miss'&&x[2].kind==='note'));
  callbacks.onPause();assert.equal(modes.at(-1),'paused');callbacks.onLobby();assert.equal(modes.at(-1),'lobby');assert.equal(completed.length,0);assert.equal(window.__encoreDiagnostics().game,'idle');
  await callbacks.onStart();transport.time=11;frame(performance.now());frame(performance.now());assert.equal(completed.length,1);assert.equal(completed[0].status,'ended');
  assert.equal(callbacks.onRank()[0].self,true);
 }finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('outfit showcase spins only after latest successful lobby load, not failed, stale or gameplay loads',async()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks,spins=0,loaded=true,pending=[];
 const replacements={createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createAvatarCreationStore,createAvatarGeneration,
 AudioTransport:class{constructor(){this.duration=10;this.time=0;}setLobby(){}async load(){return true}stop(){}async play(){return true}pause(){}cancelLoad(){}},
 RhythmGame,versionCharacterManifest,makeChart:()=>[],estimateTempo:()=>({}),createDailyScores:()=>({getRows:()=>[],recordCompleted(){}}),
 createUI(c){callbacks=c;return {setMode(){},toast(){},setTrack(){},setLoading(){},getSelection:()=>({outfit:0}),updateGame(){}}},
 createStage:()=>({available:true,setAssetManifest(){},setCharacter(){return loaded===null?new Promise(resolve=>pending.push(resolve)):Promise.resolve(loaded)},spinShowcase(){spins++},setBPM(){},setMode(){}}),
 document:{querySelector:()=>({}),addEventListener(){}},window:{addEventListener(){}},requestAnimationFrame(){},fetch:async url=>({ok:true,json:async()=>url.includes('metadata')?{bpm:170,duration:10,chart:[{lane:0,time:1}]}:{}})};
 const saved=new Map(Object.keys(replacements).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{Object.assign(globalThis,replacements);await import('data:text/javascript,'+encodeURIComponent(source)+'#showcase');await new Promise(r=>setImmediate(r));assert.equal(spins,0);
 await callbacks.onOutfit(1);assert.equal(spins,1);await callbacks.onOutfit(1);assert.equal(spins,1);
 loaded=false;await callbacks.onOutfit(2);assert.equal(spins,1);
 loaded=null;const stale=callbacks.onOutfit(0),latest=callbacks.onOutfit(1);pending.shift()(true);await stale;assert.equal(spins,1);pending.shift()(true);await latest;assert.equal(spins,2);
 const interrupted=callbacks.onOutfit(2);await callbacks.onStart();assert.equal(window.__encoreDiagnostics().game,'idle');pending.shift()(true);await interrupted;assert.equal(spins,3);await callbacks.onStart();loaded=true;await callbacks.onOutfit(0);assert.equal(spins,3);callbacks.onPause();await callbacks.onResume();assert.equal(spins,3);
 }finally{for(const[k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});

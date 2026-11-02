import {createPerformancePlaylist} from '../src/performance-playlist.js';
import {createAvatarCreationStore} from '../src/avatar-creation.js';
import {createAvatarGeneration} from '../src/avatar-generation.js';
import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {versionCharacterManifest} from '../src/asset-revision.js';
import {createDailyScores} from '../src/daily-scores.js';
import {RhythmGame} from '../src/rhythm.js';
import {makeChart,estimateTempo} from '../src/audio.js';

test('startup gates start and preserves early character/outfit selection',async()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks,resolveMetadata,gameUnderTest,loadedUrl;const song=JSON.parse(fs.readFileSync(new URL('../public/assets/audio/popstars-gameplay.metadata.json',import.meta.url)));const stageModes=[],stageSelection=[],fetchRequests=[],button={};
 const replacements={createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createAvatarCreationStore,createAvatarGeneration,
  AudioTransport:class{constructor(){this.duration=77;this.time=0;}setLobby(){}async load(url){loadedUrl=url;return {}}stop(){}async play(){return true}pause(){}},
  RhythmGame:class extends RhythmGame{constructor(options){super(options);gameUnderTest=this}},makeChart,estimateTempo,versionCharacterManifest,createDailyScores,
  createUI(c){callbacks=c;return {setMode(){},toast(){},setTrack(){},getSelection(){return {outfit:2}},updateGame(){}}},
  createStage(){return {setAssetManifest(){stageSelection.push(['jiji',0])},setCharacter(...args){stageSelection.push(args)},setMode(mode){stageModes.push(mode)}}},
  document:{querySelector(selector){return selector==='.start-button'?button:{}},addEventListener(){}},
  window:{addEventListener(){}},requestAnimationFrame(){},
  fetch(url,options){fetchRequests.push({url,options});if(url.includes('metadata'))return new Promise(resolve=>resolveMetadata=resolve);return Promise.resolve({ok:true,json:async()=>({})})},
 };
 const saved=new Map(Object.keys(replacements).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  Object.assign(globalThis,replacements);
  await import('data:text/javascript,'+encodeURIComponent(source));
  assert.equal(button.disabled,true);
  callbacks.onCharacter('lx');callbacks.onOutfit(2);await callbacks.onStart();
  assert.equal(window.__encoreDiagnostics().game,'idle');
  resolveMetadata({ok:true,json:async()=>song});await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(fetchRequests.find(r=>r.url.includes('manifest')).options,{cache:'no-store'});assert.deepEqual(stageSelection.at(-1),['lx',2]);assert.equal(button.disabled,false);
  await callbacks.onStart();assert.equal(window.__encoreDiagnostics().game,'playing');assert.equal(stageModes.at(-1),'playing');assert.equal(loadedUrl,'/assets/audio/popstars-gameplay.mp3');assert.equal(gameUnderTest.state.notes.length,song.chart.length);assert.equal(gameUnderTest.state.notes[0].time,song.chart[0].time);assert.equal(gameUnderTest.state.duration,song.duration);
 }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

test('unavailable WebGL settles model loading and prevents a misleading start',async()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import.*;\n/gm,'');
 let callbacks;const loading=[],button={};
 const replacements={createPerformancePlaylist:()=>createPerformancePlaylist(undefined,null),createAvatarCreationStore,createAvatarGeneration,
  AudioTransport:class{constructor(){this.duration=77;this.time=0}},RhythmGame,makeChart,estimateTempo,versionCharacterManifest,createDailyScores,
  createUI(c){callbacks=c;return {setMode(){},toast(){},setTrack(){},setLoading(...args){loading.push(args)},updateGame(){}}},
  createStage(){return {available:false}},document:{querySelector(s){return s==='.start-button'?button:{}},addEventListener(){}},
  window:{addEventListener(){}},requestAnimationFrame(){},fetch:async()=>({ok:true,json:async()=>({})}),
 };
 const saved=new Map(Object.keys(replacements).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{Object.assign(globalThis,replacements);await import('data:text/javascript,'+encodeURIComponent(source)+'#unavailable');await new Promise(resolve=>setImmediate(resolve));
 assert.equal(button.disabled,true);assert.deepEqual(loading.at(-1),['model',null]);assert.equal(window.__encoreDiagnostics().stageUnavailable,true);
 }finally{for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});

import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as stage from '../src/stage.js';
const songs=['popstars','fantastic','uptownfunk','killlove'].map(id=>JSON.parse(fs.readFileSync(new URL(`../public/assets/audio/${id}-gameplay.metadata.json`,import.meta.url))));
for(const song of songs)test(`${song.title}: audible transport grid has fast strong/weak push and return without perfect input`,()=>{
 const beat=60/song.bpm,origin=song.offset+16*beat;
 const at=t=>stage.stagePerformanceFraming(t,song.bpm,0,false,0,{offset:song.offset});
 const before=at(origin-.08),peak=at(origin),returning=at(origin+.225);
 assert(peak.position[2]<before.position[2]*.84,'normal play gets >=16% beat push');
 assert(returning.position[2]>peak.position[2]*1.15,'returns within300ms');
 assert(at(origin+beat).position[2]>peak.position[2],'not identical push on every beat');
 const wrongPhase=stage.stagePerformanceFraming(origin,song.bpm,0,false,0,{offset:song.offset+beat/2});assert(Math.abs(wrongPhase.position[2]-peak.position[2])>.3,'metadata phase is applied');
});
test('reduced motion remains static150% and pulse is bounded at all three tempi',()=>{
 for(const song of songs)for(let i=0;i<600;i++){
 const time=i/60,frame=stage.stagePerformanceFraming(time,song.bpm,1,false,0,{offset:song.offset});assert(frame.position[2]>=3.9);assert(frame.position[2]<=5.334);
 assert.deepEqual(stage.stagePerformanceFraming(time,song.bpm,1,true,2.8,{offset:song.offset}),stage.stageCameraFraming('playing',false,0));
 }
});
test('fast imported tempi have continuous anticipatory envelopes',()=>{
 for(const bpm of [201,220,240]){let previous=0;for(let i=0;i<3000;i++){const pulse=stage.stageCameraRhythm(i/1000,bpm,0,1).pulse;if(i)assert(Math.abs(pulse-previous)<.006);previous=pulse;}}
});
for(const song of songs)for(const fps of [30,60])test(`${song.title}: camera peak coincides with transport downbeat at${fps}fps`,()=>{
 const beat=60/song.bpm,origin=song.offset+24*beat;let peak={value:-1,time:0};
 for(let i=Math.floor((origin-.15)*fps);i<Math.ceil((origin+.15)*fps);i++){const time=i/fps,value=stage.stageCameraRhythm(time,song.bpm,song.offset,0).pulse;if(value>peak.value)peak={value,time}}
 assert(Math.abs(peak.time-origin)<=1/fps);assert(peak.value>.18);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {danceTempoScale,stageMusicalState} from '../src/stage.js';
test('dance time scales align nearest two beats within bounds',()=>{for(const bpm of [60,100,128,180,220])for(const duration of [.2,.5,1,2.7,4.4,6,9.3,20]){const rate=danceTempoScale(duration,bpm);assert(rate>=.85&&rate<=1.2);if(rate>.85&&rate<1.2){const phrase=duration/rate/(120/bpm);assert(Math.abs(phrase-Math.round(phrase))<1e-10)}}assert.equal(danceTempoScale(0),1);assert.equal(danceTempoScale(4,NaN),1)});
test('song sections change at deliberate phrase boundaries',()=>{assert.deepEqual([0,14.99,15,29.99,30,45,67.5,90].map(t=>stageMusicalState(t).section),[0,0,1,1,2,3,4,4])});
test('beat pulse is smooth, bounded and peaks on beat',()=>{const beat=60/128;assert.equal(stageMusicalState(0).beatPulse,1);assert(stageMusicalState(beat/2).beatPulse<1e-9);assert(Math.abs(stageMusicalState(beat).beatPulse-1)<1e-9);for(let t=0;t<3;t+=.001){const p=stageMusicalState(t).beatPulse;assert(p>=0&&p<=1);assert(Math.abs(p-stageMusicalState(t+.001).beatPulse)<.04)}});

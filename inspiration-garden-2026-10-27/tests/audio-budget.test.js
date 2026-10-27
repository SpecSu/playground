import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceBudget,timbreFor,noiseFor} from '../src/audio-budget.js';
test('voice budget bounds rapid scrub starts and simultaneous sound sources, then admits after release or expiry',()=>{
 const b=createVoiceBudget({maxVoices:4,maxStarts:3,windowMs:100});const a=b.reserve(0,500),c=b.reserve(0,500),d=b.reserve(0,500);assert.ok(a&&c&&d);assert.equal(b.reserve(10,500),null);
 const e=b.reserve(120,500);assert.ok(e);assert.equal(b.reserve(125,500),null);b.release(a);assert.ok(b.reserve(130,500));assert.ok(b.reserve(700,200));assert.ok(b.activeCount<=4);
});
test('invalid or overlong reservations cannot allocate unbounded audio work',()=>{
 const b=createVoiceBudget();for(const duration of [0,-1,NaN,Infinity,5000])assert.equal(b.reserve(0,duration),null);assert.equal(b.activeCount,0);
});
test('authored timbres distinguish plucked corn, glass bells, warm drum, and airy sea breath',()=>{
 assert.equal(timbreFor('key').wave,'pluck');assert.equal(timbreFor('key').attack,.004);assert.equal(timbreFor('bell').wave,'glass');
 assert.equal(noiseFor('drum').filter,'lowpass');assert.equal(noiseFor('wave').filter,'bandpass');assert.ok(noiseFor('whisper').gain<=.02);
 for(const kind of ['drum','wave','whisper','gramophone']){const n=noiseFor(kind);assert.ok(n.duration<=1);assert.ok(n.gain<=.05);}
});

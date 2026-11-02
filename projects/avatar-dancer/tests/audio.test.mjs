import test from 'node:test';
import assert from 'node:assert/strict';
import {makeChart,estimateTempo} from '../src/audio.js';
test('chart stays inside complete track and has varied lanes',()=>{const c=makeChart(128,77,0);assert(c.length>130&&c.length<190);assert(c[0].time>=3);assert(c.every(n=>n.time<75&&n.lane>=0&&n.lane<=3));assert.equal(new Set(c.map(n=>n.lane)).size,4);});
test('local import detects a clean120BPM pulse train',()=>{const rate=44100,data=new Float32Array(rate*20);for(let b=0;b<40;b++)for(let j=0;j<400;j++)data[Math.round((b*.5+.1)*rate)+j]=.8*Math.exp(-j/80);const r=estimateTempo({getChannelData:()=>data,sampleRate:rate});assert(Math.abs(r.bpm-120)<=1);assert(r.offset>=0&&r.offset<.5);});

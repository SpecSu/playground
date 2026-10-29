import test from 'node:test';import assert from 'node:assert/strict';
import {createAftershow} from '../src/aftershow.js';
test('one turn burst per results entry; held portrait, exits and reduced motion are safe',()=>{const events=[],a=createAftershow(e=>events.push(e));a.setMode('results');for(let i=0;i<600;i++)a.update(1/60);assert.equal(events.length,1);assert.equal(events[0].runId,1);assert.equal(a.getState().gesture,0);const held=a.getState().time;a.update(1,{active:false});assert.equal(a.getState().time,held);a.setMode('lobby');a.update(2);assert.equal(events.length,1);a.setMode('results');a.update(.08);assert.equal(a.getState().runId,2);a.setReducedMotion(true);for(let i=0;i<200;i++)a.update(1/60);assert.equal(events.length,1);assert.equal(a.getState().turn,0);assert.equal(a.getState().gesture,0)});
test('hidden time freezes; leaving and re-entering creates a fresh one-shot run',()=>{
 const events=[],a=createAftershow(e=>events.push(e));a.setMode('results');
 for(let i=0;i<20;i++)a.update(.05);const before=a.getState();for(let i=0;i<200;i++)a.update(.08,{active:false});assert.deepEqual(a.getState(),before);assert.equal(events.length,0);
 a.update(.08);assert.equal(events.length,1);a.setMode('playing');for(let i=0;i<30;i++)a.update(.08);assert.equal(events.length,1);a.setMode('results');for(let i=0;i<30;i++)a.update(.08);assert.equal(events.length,2);assert.equal(events[1].runId,2);
});

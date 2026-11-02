import test from 'node:test';
import assert from 'node:assert/strict';
import {desiredExpression,advanceExpression} from '../src/expression-frames.js';
test('optional puffer and sleepy frames follow direct control mood without changing catalogue identity',()=>{
 assert.equal(desiredExpression({kind:'puff',active:true,pressure:.8,startedAt:0},500),'inflated');assert.equal(desiredExpression({kind:'puff',active:false,pressure:.8,releasedAt:500},700),'exhale');assert.equal(desiredExpression({kind:'puff',active:false,releasedAt:500},1200),'base');
 assert.equal(desiredExpression({kind:'sleep',active:true,startedAt:0,taps:1},100),'awake');assert.equal(desiredExpression({kind:'sleep',active:true,startedAt:0,taps:2},100),'grumpy');assert.equal(desiredExpression({kind:'sleep',active:true,startedAt:0,taps:1},850),'asleep');
});
test('frame crossfade stays continuous and normalized during interrupted mood changes and return to base',()=>{
 let a=advanceExpression(null,'inflated',0);assert.equal(a.weights.base,1);a=advanceExpression(a,'inflated',60);assert.ok(a.weights.inflated>.4&&a.weights.inflated<.6);
 const before=a.weights.inflated;a=advanceExpression(a,'exhale',60);assert.equal(a.weights.inflated,before);assert.equal(Object.values(a.weights).reduce((x,y)=>x+y,0),1);
 a=advanceExpression(a,'exhale',180);assert.equal(a.weights.exhale,1);a=advanceExpression(a,'base',180);a=advanceExpression(a,'base',360);assert.deepEqual(a.weights,{base:1});
});

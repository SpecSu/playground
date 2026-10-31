import test from 'node:test';
import assert from 'node:assert/strict';
import {LunarShowcaseTimeline,type LunarTimelineSpec} from '../src/minimal/lunar-showcase-timeline.ts';

const spec=():LunarTimelineSpec=>({idle:{clip:'idle',duration:2},carried:{clip:'carried',duration:1},actions:[{id:'wave',clip:'wave',duration:1.2,cycles:1},{id:'dribble',clip:'dribble',duration:1,cycles:3}],automatic:{actionId:'wave',delaySeconds:1.5}});

test('an actor action uses its own clips and active time, not farm state or wall time',()=>{
 const clock=new LunarShowcaseTimeline(spec());assert.equal(clock.snapshot().clip,'idle');
 assert.equal(clock.play('unknown'),false);assert.equal(clock.play('wave'),true);clock.advance(.2);const active=clock.snapshot();assert.equal(active.actionId,'wave');assert.equal(active.clip,'wave');assert.equal(active.elapsed,.2);
 clock.setPaused(true);clock.advance(60);assert.deepEqual(clock.snapshot(),{...active,paused:true});
 clock.setPaused(false);clock.advance(.1);assert.ok(Math.abs(clock.snapshot().elapsed-.3)<1e-8);assert.equal(clock.snapshot().actionId,'wave');
});
test('finite cycles return to idle once, and a new action cancels old completion',()=>{
 const clock=new LunarShowcaseTimeline(spec());clock.play('dribble');for(let i=0;i<8;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,'dribble');assert.equal(clock.snapshot().clipTime,0);
 clock.play('wave');const revision=clock.snapshot().revision;for(let i=0;i<5;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,null);assert.equal(clock.snapshot().clip,'idle');assert.equal(clock.snapshot().revision,revision+1);clock.advance(.25);assert.equal(clock.snapshot().revision,revision+1);
});
test('large or invalid deltas never burst through a performance, and snapshot data cannot change it',()=>{
 const clock=new LunarShowcaseTimeline(spec());clock.play('wave');for(const bad of [NaN,Infinity,-1])clock.advance(bad);assert.equal(clock.snapshot().elapsed,0);
 clock.advance(3600);assert.equal(clock.snapshot().elapsed,.25);assert.equal(clock.snapshot().actionId,'wave');
 const snapshot=clock.snapshot();assert.throws(()=>{Object.assign(snapshot,{clip:'pig'});},TypeError);assert.equal(clock.snapshot().clip,'wave');
});
test('auto performance is once per visit, never catches up while paused and yields to user input',()=>{
 const clock=new LunarShowcaseTimeline(spec());clock.setPaused(true);for(let i=0;i<20;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,null);clock.setPaused(false);
 for(let i=0;i<6;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,'wave');for(let i=0;i<100;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,null);
 const manual=new LunarShowcaseTimeline(spec());manual.play('dribble');for(let i=0;i<100;i++)manual.advance(.25);assert.equal(manual.snapshot().actionId,null);assert.equal(manual.snapshot().automaticConsumed,true);
});
test('carry resets performance, prevents actions, and returns to idle with no old ball/action replay',()=>{
 const clock=new LunarShowcaseTimeline(spec());clock.play('dribble');clock.advance(.25);assert.equal(clock.setCarried(true),true);assert.equal(clock.snapshot().clip,'carried');assert.equal(clock.snapshot().actionId,null);assert.equal(clock.play('wave'),false);clock.advance(.25);assert.equal(clock.snapshot().carried,true);
 assert.equal(clock.setCarried(false),true);assert.equal(clock.snapshot().clip,'idle');assert.equal(clock.snapshot().elapsed,0);for(let i=0;i<20;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,null);
 const noCarry=new LunarShowcaseTimeline({...spec(),carried:undefined});assert.equal(noCarry.setCarried(true),false);assert.equal(noCarry.snapshot().carried,false);
});
test('dispose and explicit cancellation invalidate pending action revisions without callbacks or timers',()=>{
 const clock=new LunarShowcaseTimeline(spec());clock.play('wave');const old=clock.snapshot().revision;clock.cancel();assert.equal(clock.snapshot().revision,old+1);assert.equal(clock.snapshot().clip,'idle');clock.dispose();const terminal=clock.snapshot();assert.equal(clock.play('wave'),false);assert.equal(clock.setCarried(true),false);clock.advance(.25);clock.cancel();clock.setPaused(false);clock.dispose();assert.deepEqual(clock.snapshot(),terminal);
});
test('clip specifications reject invalid or duplicate actions and cannot be mutated after construction',()=>{
 for(const bad of [{...spec(),idle:{clip:'',duration:2}},{...spec(),actions:[{id:'wave',clip:'wave',duration:NaN,cycles:1}]},{...spec(),actions:[spec().actions[0],spec().actions[0]]},{...spec(),automatic:{actionId:'missing',delaySeconds:0}},{...spec(),actions:[{id:'wave',clip:'wave',duration:1,cycles:999}]}])assert.throws(()=>new LunarShowcaseTimeline(bad));
 const input=spec(),clock=new LunarShowcaseTimeline(input);input.actions[0].clip='pig';clock.play('wave');assert.equal(clock.snapshot().clip,'wave');
});
test('a shot holds its authored final pose for the ball tail, never loops back to the hand',()=>{
 const input=spec();input.actions=[{id:'shoot',clip:'shoot',duration:1,cycles:1,holdSeconds:1.2}];input.automatic=undefined;const clock=new LunarShowcaseTimeline(input);clock.play('shoot');for(let i=0;i<6;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,'shoot');assert.ok(clock.snapshot().clipTime>.99);for(let i=0;i<3;i++)clock.advance(.25);assert.equal(clock.snapshot().actionId,null);
});

test('walk phase is advanced only by locomotion distance, and yields to actions and carry',()=>{
 const clock=new LunarShowcaseTimeline({...spec(),automatic:undefined,walk:{clip:'walk',duration:1}});assert.equal(clock.locomote(.3),true);assert.equal(clock.snapshot().clip,'walk');assert.equal(clock.snapshot().clipTime,.3);clock.advance(.2);assert.equal(clock.snapshot().clipTime,.3);clock.locomote(.1);assert.equal(clock.snapshot().clipTime,.4);clock.play('wave');assert.equal(clock.locomote(.1),false);clock.cancel();clock.locomote(.2);clock.stopWalking();assert.equal(clock.snapshot().clip,'idle');clock.setCarried(true);assert.equal(clock.locomote(.1),false);
});

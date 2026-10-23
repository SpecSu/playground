import test from 'node:test';
import assert from 'node:assert/strict';
import {createLayout} from '../src/v5/layout.ts';
import {startLookout,advanceLookout} from '../src/v5/lookout.ts';
import {LookoutMotionTrack} from '../src/v5/lookout-motion.ts';
function setup(){const layout=createLayout();layout.buildings.push({id:'tower',kind:'tower',x:7,z:1,rotation:0,paidCost:12,capacity:1,doors:[]});return {layout,state:startLookout(layout,{x:7,z:3},'tower')!};}
test('lookout visual follows certified slope continuously at buffered authority time',()=>{
 const {layout,state}=setup(),track=new LookoutMotionTrack(layout,state,1000),next=advanceLookout(layout,state,1000)!;track.push(next,2000);
 const a=track.sample(1720),b=track.sample(1820);assert.ok(a.height>0&&a.height<next.height);assert.ok(b.height>a.height);assert.ok(Math.abs((b.height-a.height)/(a.position.z-b.position.z)-1.115)<.001);
 assert.ok(Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z,a.height-b.height)<.16);
});
test('a repeated render/property update does not rewind or restart the climb',()=>{
 const {layout,state}=setup(),track=new LookoutMotionTrack(layout,state,1000);const next=advanceLookout(layout,state,1000)!;track.push(next,2000);const a=track.sample(1920);assert.equal(track.push(next,2000),false);const b=track.sample(1500);assert.deepEqual(a.position,b.position);assert.equal(a.height,b.height);
});

test('stationary authoritative ascent frames never invent movement and then snap back',()=>{
 const {layout,state}=setup(),paused=advanceLookout(layout,state,700)!,track=new LookoutMotionTrack(layout,paused,1000);track.push(paused,1200);
 for(const t of [1220,1300,1400,1419,1420]){const sample=track.sample(t);assert.deepEqual(sample.position,paused.position);assert.equal(sample.height,paused.height);}
});
test('partly advanced authority bounds every interpolated height to both endpoints',()=>{
 const {layout,state}=setup(),start=advanceLookout(layout,state,700)!,next=advanceLookout(layout,start,50)!,track=new LookoutMotionTrack(layout,start,1000);track.push(next,1200);
 let last=start.height;for(let t=1220;t<=1420;t+=10){const sample=track.sample(t);assert.ok(sample.height>=last-1e-9);assert.ok(sample.height<=next.height+1e-9);last=sample.height;}
});

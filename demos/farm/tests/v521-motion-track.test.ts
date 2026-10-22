import test from 'node:test';
import assert from 'node:assert/strict';
import {BufferedMotionTrack,DEFAULT_RENDER_DELAY_MS} from '../src/v5/motion-track.ts';
const close=(a:number,b:number,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} should be ${b}`);

test('rendering uses an explicit 220ms authoritative sample buffer',()=>{
 assert.equal(DEFAULT_RENDER_DELAY_MS,220);
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 close(track.sample(720).position.x,.5);close(track.sample(720).distance,.5);
});

test('fractional snapshots never detour backwards to rounded grid centres',()=>{
 const track=new BufferedMotionTrack({x:6.4,z:2},0);track.push({position:{x:6.9,z:2},at:500,route:[{x:6.4,z:2},{x:6.9,z:2}]});let previous=6.4;
 for(let now=0;now<=1000;now+=10){const sample=track.sample(now);assert.ok(sample.position.x>=previous-1e-9);assert.ok(sample.position.x<=6.9);close(sample.position.z,2);previous=sample.position.x;}
});

test('500ms streaming never reverses or overshoots and only stalls when the buffer is exhausted',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);let previous=track.sample(0),latestAt=0;
 for(let now=10;now<=4000;now+=10){
  if(now%500===0){latestAt=now;track.push({position:{x:now/1000,z:0},at:now});}
  const current=track.sample(now),delta=current.position.x-previous.position.x;
  assert.ok(delta>=-1e-9);assert.ok(current.position.x<=latestAt/1000+1e-9);
  if(now>DEFAULT_RENDER_DELAY_MS&&delta<1e-9)assert.ok(now-DEFAULT_RENDER_DELAY_MS>=latestAt);
  previous=current;
 }
});

test('200ms streaming stays continuous at the original one-cell-per-second speed',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);let previous=track.sample(0);
 for(let now=10;now<=4000;now+=10){
  if(now%200===0)track.push({position:{x:now/1000,z:0},at:now});
  const current=track.sample(now);if(now>300){close(current.position.x-previous.position.x,.01);close(current.speed,1);}
  previous=current;
 }
});

test('legal corner routes interpolate by arclength without cutting diagonally',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:2,z:2},at:1000,route:[{x:2,z:0}]});
 let sample=track.sample(470);close(sample.position.x,1);close(sample.position.z,0);close(sample.heading,Math.PI/2);close(sample.distance,1);close(sample.speed,4);
 sample=track.sample(720);close(sample.position.x,2);close(sample.position.z,0);close(sample.heading,0);
 sample=track.sample(970);close(sample.position.x,2);close(sample.position.z,1);close(sample.distance,3);
});

test('including or omitting route endpoints produces exactly the same motion',()=>{
 const a=new BufferedMotionTrack({x:0,z:0},0),b=new BufferedMotionTrack({x:0,z:0},0);
 a.push({position:{x:2,z:2},at:1000,route:[{x:0,z:0},{x:2,z:0},{x:2,z:2}]});
 b.push({position:{x:2,z:2},at:1000,route:[{x:2,z:0}]});
 for(let now=0;now<1500;now+=17)assert.deepEqual(a.sample(now),b.sample(now));
});

test('stationary or target-property snapshots never retime an earlier movement or invent movement',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 track.push({position:{x:1,z:0},at:1100,route:[{x:9,z:9}]});
 close(track.sample(720).position.x,.5);
 const still=track.sample(1270);close(still.position.x,1);close(still.position.z,0);close(still.distance,1);close(still.speed,0);
});

test('reordered responses and equal timestamp duplicates cannot overwrite a newer authority',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},1000);assert.equal(track.push({position:{x:1,z:0},at:2000}),true);
 assert.equal(track.push({position:{x:100,z:0},at:1999}),false);assert.equal(track.push({position:{x:9,z:9},at:2000}),false);
 const sample=track.sample(5000);close(sample.position.x,1);close(sample.position.z,0);close(sample.distance,1);close(sample.speed,0);
});

test('a render-clock correction cannot rewind an already displayed actor',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 const before=track.sample(920),after=track.sample(420);assert.deepEqual(after,before);
 close(track.sample(1020).position.x,.8);
});

test('stopped paths clamp to the latest sample without extrapolation or speed chasing',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 const stopped=track.sample(5000);close(stopped.position.x,1);close(stopped.distance,1);close(stopped.speed,0);
 track.push({position:{x:2,z:0},at:6000});const resumed=track.sample(5720);close(resumed.position.x,1.9);close(resumed.distance,1.9);
});

test('buffer exhaustion records only rendered authority time so late samples can resume immediately',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 close(track.sample(100000).position.x,1);
 track.push({position:{x:1.2,z:0},at:1200});
 const resumed=track.sample(1320);close(resumed.position.x,1.1);close(resumed.distance,1.1);close(resumed.speed,1);
});

test('different frame rates produce the same authoritative position and accumulated distance',()=>{
 const results=[];
 for(const fps of [30,60,144]){
  const track=new BufferedMotionTrack({x:0,z:0},0);for(let at=200;at<=2000;at+=200)track.push({position:{x:at/1000,z:0},at});
  for(let frame=0;frame<fps;frame++)track.sample(frame/fps*1000);
  results.push(track.sample(1220));
 }
 for(const result of results){close(result.position.x,1);close(result.distance,1);close(result.speed,1);}
});

test('foot placements query persistent global arclength through corners independently of render time',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:2,z:2},at:1000,route:[{x:2,z:0}]});
 assert.deepEqual(track.sampleAtDistance(1),{x:1,z:0,heading:Math.PI/2});assert.deepEqual(track.sampleAtDistance(3),{x:2,z:1,heading:0});
 close(track.sample(470).position.x,1);close(track.sampleAtDistance(4).z,2);
});

test('a corner shared by consecutive snapshots faces along the following edge',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});track.push({position:{x:1,z:1},at:2000});
 const corner=track.sample(1220);close(corner.position.x,1);close(corner.position.z,0);close(corner.heading,0);
 assert.deepEqual(track.sampleAtDistance(1),{x:1,z:0,heading:0});
});

test('stationary history keeps its last moving heading and cumulative foot distance after pruning',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);track.push({position:{x:1,z:0},at:1000});
 for(let i=1;i<=130;i++)track.push({position:{x:1,z:0},at:1000+i*200});
 const still=track.sample(100000);close(still.position.x,1);close(still.distance,1);close(still.speed,0);close(still.heading,Math.PI/2);
 assert.deepEqual(track.sampleAtDistance(0),{x:1,z:0,heading:Math.PI/2});
});

test('a 120-sample history remains bounded without resetting its cumulative foot distance',()=>{
 const track=new BufferedMotionTrack({x:0,z:0},0);for(let i=1;i<=200;i++)track.push({position:{x:i,z:0},at:i*100});
 const sample=track.sample(100000);close(sample.position.x,200);close(sample.distance,200);
 close(track.sampleAtDistance(199.2).x,199.2);close(track.sampleAtDistance(0).x,81);close(track.sampleAtDistance(999).x,200);
});

test('pushed route arrays are copied and do not change when a later snapshot mutates its inputs',()=>{
 const route=[{x:2,z:0}],position={x:2,z:2},track=new BufferedMotionTrack({x:0,z:0},0);track.push({position,at:1000,route});
 route[0].x=50;position.z=50;const sample=track.sample(470);close(sample.position.x,1);close(sample.position.z,0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { clubMotionAt, CLUB_BOOTH_BOUNDS } from '../lib/club-scene-motion.ts';
import { clubGroupMotionAt } from '../lib/club-group-motion.ts';
const start = 1791806400000;
const event = { id: 'train-v3', kind: 'train' as const, version: 3 as const, startsAt: start, endsAt: start + 16000, beatMs: 500, sourceClockBySlot: Array(10).fill(start) };
const gap = (a: {x:number;z:number}, b:{x:number;z:number}) => Math.hypot(a.x-b.x,a.z-b.z);
async function train(){assert.ok(existsSync(new URL('../lib/club-train-motion.ts',import.meta.url)), 'shared train timeline exists');return import('../lib/club-train-motion.ts');}
test('v3 train jumps into place within 700ms and starts bunny-hopping immediately', async()=>{
 const { sampleTrainFrame, trainSlotPlacement } = await train();
 const jumping = clubGroupMotionAt(start+350,7,event,clubMotionAt(start+350,7))!;
 assert.equal(jumping.pose.version,3); assert.ok(jumping.pose.trainLift!>1);
 const hopped=clubGroupMotionAt(start+900,0,event,clubMotionAt(start+900,0))!;
 assert.equal(sampleTrainFrame(start+900,event)!.phase,'hop');assert.equal(hopped.motion.walkBlend,0);assert.ok(hopped.pose.trainLift!>.1);
 assert.ok(gap(clubGroupMotionAt(start+700,0,event,clubMotionAt(start+700,0))!.motion,trainSlotPlacement(0))<1e-8);
});
test('half lap of bunny hops precedes a real rising train and exactly two rapid laps',async()=>{
 const {sampleTrainFrame,TRAIN_RING_RADIUS,TRAIN_DECK_HEIGHT}=await train();
 assert.equal(sampleTrainFrame(start+5499,event)!.phase,'hop');
 const rise=sampleTrainFrame(start+6000,event)!;assert.equal(rise.phase,'rise');assert.ok(rise.emergence>0&&rise.emergence<1);
 const boarded=sampleTrainFrame(start+6500,event)!;assert.equal(boarded.phase,'ride');assert.equal(boarded.lift,TRAIN_DECK_HEIGHT);
 const sink=sampleTrainFrame(start+14500,event)!;assert.equal(sink.phase,'sink');assert.ok(Math.abs(sink.distance-boarded.distance-4*Math.PI*TRAIN_RING_RADIUS)<1e-8);
 assert.equal(sampleTrainFrame(start+16000,event),null);
});
test('timeline is deterministic, finite, late-join safe, reduced-motion quiet and rejects malformed events',async()=>{
 const {sampleTrainFrame}=await train();const expected=sampleTrainFrame(start+8234,event);
 sampleTrainFrame(start+125,event);assert.deepEqual(sampleTrainFrame(start+8234,event),expected);
 for(const bad of [{...event,beatMs:0},{...event,startsAt:NaN},{...event,endsAt:start},{...event,version:2}])assert.equal(sampleTrainFrame(start+500,bad),null);
 assert.equal(sampleTrainFrame(start+8500,event,true),null);assert.equal(sampleTrainFrame(start-1,event),null);
});
test('train path and release roam clear the DJ, floor and neighbors; expiry lands in place',async()=>{
 const {trainReleaseMotion,sampleTrainFrame,trainSlotPlacement,TRAIN_TOTAL_DISTANCE}=await train();
 for(let t=700;t<16000;t+=71){const frame=sampleTrainFrame(start+t,event)!;const actors=Array.from({length:10},(_,slot)=>trainSlotPlacement(slot,frame.distance,frame.formation));for(let i=0;i<10;i++){const p=actors[i],u=(p.x-p.z)*Math.SQRT1_2,v=(p.x+p.z)*Math.SQRT1_2;assert.ok(Math.abs(u)<=4.2&&v>=-4.2&&v<=6);const b=CLUB_BOOTH_BOUNDS;assert.ok(Math.hypot(Math.max(b.minU-u,0,u-b.maxU),Math.max(b.minV-v,0,v-b.maxV))>=1.1);for(let j=i+1;j<10;j++)assert.ok(gap(p,actors[j])>=2.12);}}
 for(let t=0;t<90000;t+=93){const actors=Array.from({length:10},(_,slot)=>trainReleaseMotion(event.endsAt+t,slot,event)!);for(let i=0;i<10;i++){const p=actors[i];assert.ok(Number.isFinite(p.speed));for(let j=i+1;j<10;j++)assert.ok(gap(p,actors[j])>=2.12);}}
 for(let slot=0;slot<10;slot++){const p=trainSlotPlacement(slot,TRAIN_TOTAL_DISTANCE),release=trainReleaseMotion(event.endsAt,slot,event)!;assert.ok(gap(p,release)<1e-9);assert.equal(release.speed,0);assert.ok(gap(release,trainReleaseMotion(event.endsAt+4000,slot,event)!)>.01);}
});

test('release genuinely disperses into existing wandering territories without a teleport or DJ crossing',async()=>{
 const {trainReleaseMotion,TRAIN_SLOT_ORDER}=await train();
 for(let slot=0;slot<10;slot++){
  const mapped=TRAIN_SLOT_ORDER[(TRAIN_SLOT_ORDER.indexOf(slot)+5)%10];
  const at=event.endsAt+7000,actual=trainReleaseMotion(at,slot,event)!,expected=clubMotionAt(at,mapped);
  assert.ok(gap(actual,expected)<1e-8,'resumes a full existing roam route');
  for(const boundary of [0,2000,3000,5000]){const a=trainReleaseMotion(event.endsAt+Math.max(0,boundary-.001),slot,event)!,b=trainReleaseMotion(event.endsAt+boundary+.001,slot,event)!;assert.ok(gap(a,b)<.0001);}
 }
 for(let t=0;t<20000;t+=29){const actors=Array.from({length:10},(_,slot)=>trainReleaseMotion(event.endsAt+t,slot,event)!);for(let i=0;i<10;i++){const p=actors[i],u=(p.x-p.z)*Math.SQRT1_2,v=(p.x+p.z)*Math.SQRT1_2,b=CLUB_BOOTH_BOUNDS;assert.ok(Math.hypot(Math.max(b.minU-u,0,u-b.maxU),Math.max(b.minV-v,0,v-b.maxV))>=1.1);for(let j=i+1;j<10;j++)assert.ok(gap(p,actors[j])>=2.12-1e-8);}}
});

test('a repeated train starts on the previous landing side and still makes only two driven laps',async()=>{
 const {sampleTrainFrame,trainReleaseMotion,TRAIN_RING_RADIUS,TRAIN_TOTAL_DISTANCE,trainSlotPlacement}=await train();
 const repeat={...event,trainStartDistance:Math.PI*TRAIN_RING_RADIUS};
 assert.equal(sampleTrainFrame(start+700,repeat)!.distance,repeat.trainStartDistance);
 for(let slot=0;slot<10;slot++)assert.ok(gap(trainReleaseMotion(repeat.endsAt,slot,repeat)!,trainSlotPlacement(slot,TRAIN_TOTAL_DISTANCE+repeat.trainStartDistance))<1e-8);
});

test('the short jump into formation keeps automatic roots clear of DJ and neighboring bodies',()=>{
 for(const offset of [0,8917,42033])for(let t=0;t<=700;t+=11){
  const e={...event,startsAt:start+offset,endsAt:start+offset+16000,sourceClockBySlot:Array(10).fill(start+offset)};
  const actors=Array.from({length:10},(_,slot)=>clubGroupMotionAt(e.startsAt+t,slot,e,clubMotionAt(e.startsAt+t,slot))!.motion);
  for(let i=0;i<10;i++){const p=actors[i],u=(p.x-p.z)*Math.SQRT1_2,v=(p.x+p.z)*Math.SQRT1_2,b=CLUB_BOOTH_BOUNDS;assert.ok(Math.hypot(Math.max(b.minU-u,0,u-b.maxU),Math.max(b.minV-v,0,v-b.maxV))>=1.1);for(let j=i+1;j<10;j++)assert.ok(gap(p,actors[j])>=2.12);}
 }
});

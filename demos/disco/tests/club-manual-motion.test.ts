import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { CLUB_AVATAR_SCALE } from '../lib/club-avatar-scale.ts';
const modulePath = new URL('../lib/club-manual-motion.ts', import.meta.url);
async function manual() { assert.ok(existsSync(modulePath), 'manual navigation module exists'); return import('../lib/club-manual-motion.ts'); }
const fromUV = (u: number,v: number) => ({ x:(u+v)*Math.SQRT1_2,z:(v-u)*Math.SQRT1_2 });

test('enlarged models reserve full scenery clearance while retaining smaller passable foot cores', async () => {
 const { MOVEMENT_BODY_RADIUS, MOVEMENT_PEER_RADIUS } = await import('../lib/room-movement.ts');
 const { CLUB_BOOTH_BOUNDS } = await import('../lib/club-scene-motion.ts');
 const { constrainManualPosition, manualPeerClearance } = await manual();
 assert.equal(MOVEMENT_BODY_RADIUS, .7 * CLUB_AVATAR_SCALE, 'the widest scene-scaled asset clears physical scenery');
 assert.equal(MOVEMENT_PEER_RADIUS, .18 * CLUB_AVATAR_SCALE);
 const point = constrainManualPosition(fromUV(0, CLUB_BOOTH_BOUNDS.maxV + .8));
 assert.ok((point.x + point.z) * Math.SQRT1_2 >= CLUB_BOOTH_BOUNDS.maxV + MOVEMENT_BODY_RADIUS + .02 - 1e-8);
 assert.ok(manualPeerClearance() < MOVEMENT_BODY_RADIUS, 'nearby dancers remain passable');
});

test('manual sweep crosses former territories but never cuts through booth or floor edges', async () => {
 const { sweepManualPosition, isManualWalkable } = await manual();
 let position=fromUV(-4,4); const destination=fromUV(4,4);
 position=sweepManualPosition(position,{x:destination.x-position.x,z:destination.z-position.z});
 assert.ok(Math.hypot(position.x-destination.x,position.z-destination.z)<1e-6, 'walks across seat boundaries');
 const across=fromUV(4,0), start=fromUV(-4,0);
 const blocked=sweepManualPosition(start,{x:across.x-start.x,z:across.z-start.z});
 assert.ok(isManualWalkable(blocked)); assert.ok((blocked.x-blocked.z)*Math.SQRT1_2 < -2, 'stops before booth');
 const edge=sweepManualPosition(fromUV(4,5),fromUV(100,100)); assert.ok(isManualWalkable(edge));
});

test('disc sweep prevents tunnelling and slides without moving a parked blocker', async () => {
 const { sweepManualPosition } = await manual();
 const blocker=fromUV(0,4), start=fromUV(-3,4), end=fromUV(3,4);
 const position=sweepManualPosition(start,{x:end.x-start.x,z:end.z-start.z},[blocker]);
 assert.ok(Math.hypot(position.x-blocker.x,position.z-blocker.z)>=.385-1e-6);
 assert.ok((position.x-position.z)*Math.SQRT1_2 < 0);
 assert.deepEqual(blocker,fromUV(0,4));
});

test('remote interpolation routes around booth corners and caps extrapolation', async () => {
 const { remoteManualTarget, approachManualTarget, isManualWalkable } = await manual();
 const sample={...fromUV(-3,0),heading:0,vx:1,vz:0,acceptedAt:1000};
 assert.deepEqual(remoteManualTarget(sample,5000),remoteManualTarget(sample,1900));
 let current=fromUV(-3,0);const target=fromUV(3,0);
 for(let i=0;i<500;i++){current=approachManualTarget(current,target,.03);assert.ok(isManualWalkable(current));}
 assert.ok(Math.hypot(current.x-target.x,current.z-target.z)<.05, 'reaches remote target around booth rather than getting stuck');
});

test('manual walking preserves actual travelled distance and planted-foot samples', async () => {
 const { ManualWalkTrail } = await manual();
 const trail=new ManualWalkTrail(fromUV(-3,3),0);
 trail.append(fromUV(-2,3),Math.PI/2);trail.append(fromUV(-2,4),0);
 assert.ok(Math.abs(trail.distance-2)<1e-6);
 const middle=trail.sampleAtDistance(1.5);const expected=fromUV(-2,3.5);
 assert.ok(Math.hypot(middle.x-expected.x,middle.z-expected.z)<1e-6);
 for(let i=0;i<500;i++)trail.append(fromUV(-2,4+i*.001),0);
 assert.ok(trail.size<=96,'bounded gait history');
});

test('camera-relative input remains normalized and preserves a frozen gesture basis', async () => {
 const { movementVectorFromCamera } = await manual();
 const a=movementVectorFromCamera(1,0,{x:0,z:-1}); assert.deepEqual(a,{x:3.6,z:0});
 const b=movementVectorFromCamera(1,1,{x:0,z:-1}); assert.ok(Math.abs(Math.hypot(b.x,b.z)-3.6)<1e-8);
 assert.deepEqual(movementVectorFromCamera(.02,.02,{x:0,z:-1}),{x:0,z:0});
});

test('required stop barriers survive same-pose movement deduplication across generations',async()=>{
 const {shouldEmitMovementSample}=await manual();const stop={mode:'manual' as const,x:1,z:3,heading:0,vx:0,vz:0,reason:'stop' as const};
 assert.equal(shouldEmitMovementSample(stop,stop,false),true,'transport must decide whether a previously blocked stop was sent');
 assert.equal(shouldEmitMovementSample(stop,stop,true),true,'new membership/group/reconcile generation publishes a barrier');
});

test('remote catch-up can travel along a floor edge without floating-point tangent stalls',async()=>{
 const {approachManualTarget,isManualWalkable}=await manual();let point={x:.5912622388220842,z:6.530959200789084};const target={x:-5.368645360902746,z:.5710516010642539};
 for(let frame=0;frame<600;frame++){point=approachManualTarget(point,target,.025);assert.ok(isManualWalkable(point));}
 assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<.02);
});

test('passive takeover invalidates an old moving lifecycle sample before blur can publish',async()=>{
 const {shouldStopMovementSample}=await manual();const moving={mode:'manual' as const,x:1,z:3,heading:0,vx:1,vz:0,reason:'move' as const};
 assert.equal(shouldStopMovementSample(moving,true),true);
 assert.equal(shouldStopMovementSample(moving,false),false,'different membership/group/reconcile generation cannot resurrect stale authority');
});

test('optional full-size flip radius expands booth and body clearance without changing ordinary walking', async () => {
 const { constrainManualPosition, sweepManualPosition } = await manual();
 const { MOVEMENT_BODY_RADIUS } = await import('../lib/room-movement.ts');
 const { CLUB_BOOTH_BOUNDS } = await import('../lib/club-scene-motion.ts');
 const close = fromUV(0, CLUB_BOOTH_BOUNDS.maxV + MOVEMENT_BODY_RADIUS + .02);
 assert.ok(Math.hypot(constrainManualPosition(close).x - close.x, constrainManualPosition(close).z - close.z) < 1e-8);
 const expanded = constrainManualPosition(close, CLUB_AVATAR_SCALE);
 assert.ok((expanded.x + expanded.z) * Math.SQRT1_2 >= CLUB_BOOTH_BOUNDS.maxV + CLUB_AVATAR_SCALE + .02 - 1e-5);
 const blocker = { ...fromUV(0, 4), radius: CLUB_AVATAR_SCALE };
 const stop = sweepManualPosition(fromUV(-4.1, 4), fromUV(8.2, 0), [blocker], CLUB_AVATAR_SCALE);
 assert.ok(Math.hypot(stop.x - blocker.x, stop.z - blocker.z) >= CLUB_AVATAR_SCALE * 2 + .025 - 1e-5);
});


test('held joystick escapes a formerly solid nine-person crowd with distinct foot cores', async () => {
 const { sweepManualPosition, isManualWalkable } = await manual();
 const start=fromUV(0,3.5),target=fromUV(3,3.5);
 // Scale the crowd spacing with its foot cores; the old unscaled ring would
 // geometrically close every gap around a doubled avatar.
 const blockers=Array.from({length:9},(_,i)=>({x:start.x+Math.sin(i/9*Math.PI*2)*2.65,z:start.z+Math.cos(i/9*Math.PI*2)*2.65}));
 let point=start;
 for(let frame=0;frame<300;frame++){
  const dx=target.x-point.x,dz=target.z-point.z,span=Math.hypot(dx,dz);if(span<.05)break;
  const step=Math.min(.045,span),previous=point;
  point=sweepManualPosition(point,{x:dx/span*step,z:dz/span*step},blockers);
  assert.ok(isManualWalkable(point));assert.ok(Math.hypot(point.x-previous.x,point.z-previous.z)<=step+1e-8);
  for(const blocker of blockers)assert.ok(Math.hypot(point.x-blocker.x,point.z-blocker.z)>=.385-1e-5);
 }
 assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<.05,'held movement leaves the crowd');
});

test('exact head-on contact slides around a dancer without weakening scenery sweeps', async () => {
 const {sweepManualPosition,isManualWalkable}=await manual();const blocker=fromUV(0,4),target=fromUV(2,4);let point=fromUV(-2,4);
 for(let i=0;i<250;i++){
  const dx=target.x-point.x,dz=target.z-point.z,span=Math.hypot(dx,dz);if(span<.04)break;
  const previous=point;point=sweepManualPosition(point,{x:dx/span*.035,z:dz/span*.035},[blocker]);
  assert.ok(isManualWalkable(point));assert.ok(Math.hypot(point.x-previous.x,point.z-previous.z)<=.03500001);
  assert.ok(Math.hypot(point.x-blocker.x,point.z-blocker.z)>=.385-1e-5);
 }
 assert.ok(Math.hypot(point.x-target.x,point.z-target.z)<.04);
});

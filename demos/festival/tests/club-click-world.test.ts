import assert from 'node:assert/strict';import test from 'node:test';
import {ClubManualWorld} from '../lib/club-manual-world.ts';
import {clubMotionAt,type ClubMotionState} from '../lib/club-scene-motion.ts';
import type {ManualIntent} from '../lib/club-manual-motion.ts';
const epoch=1791806400000,actor={id:'self',name:'Self',preset:'frog' as const,slot:0,joinedAt:epoch-10000,lastSeenAt:epoch,action:'dance' as const,actionAt:0};
const uv=(u:number,v:number)=>({x:(u+v)*Math.SQRT1_2,z:(v-u)*Math.SQRT1_2});
const origin=uv(-3,4),target=uv(3,4),distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function harness(tokens?:ConstructorParameters<typeof ClubManualWorld>[0]){
 const world=new ClubManualWorld(tokens);world.sync([actor],'self',[]);let at=epoch;
 const base={...clubMotionAt(epoch,0),...origin},canonical=new Map<number,ClubMotionState>([[0,base]]);
 return{world,canonical,update:(intent:ManualIntent,group?:{id:string;startsAt:number;endsAt:number})=>world.update({now:at+=25,deltaSeconds:.025,canonical,canonicalAt:()=>base,intent,group})};
}
const request=(sequence=1,point=target)=>({vx:0,vz:0,active:false,enabled:true,targetRequest:{sequence,...point}});
test('a click starts continuous local movement and emits a single parked stop on arrival',()=>{
 const h=harness();let state=h.update(request()),previous=origin;assert.equal(state.samples[0]?.reason,'start');
 let stops=0;for(let frame=0;frame<400;frame++){
  const point=state.motions.get(0)!;assert.ok(distance(previous,point)<=.04500001);previous=point;stops+=state.samples.filter(row=>row.reason==='stop').length;
  state=h.update(request());
 }
 assert.ok(distance(previous,target)<=.12);assert.equal(stops,1);assert.equal(h.world.destination,null);assert.equal(state.samples.length,0);
});
test('a newer click replaces the destination without snapping or resetting the walking trail',()=>{
 const h=harness();let state=h.update(request());for(let frame=0;frame<20;frame++)state=h.update(request());
 const before=state.motions.get(0)!;state=h.update(request(2,uv(-3,5)));
 assert.ok(distance(before,state.motions.get(0)!)<=.04500001);assert.ok(state.motions.get(0)!.distance>=before.distance);
 for(let frame=0;frame<200;frame++)state=h.update(request(2,uv(-3,5)));
 assert.ok(distance(state.motions.get(0)!,uv(-3,5))<=.12);
});
test('joystick takes over a target and releasing it never revives the old route',()=>{
 const h=harness();h.update(request());const moved=h.update({...request(),vx:0,vz:1.8,active:true});assert.equal(h.world.destination,null);
 const stop=h.update(request());assert.equal(stop.samples.at(-1)?.reason,'stop');const point=stop.motions.get(0)!;
 assert.ok(distance(moved.motions.get(0)!,point)<1e-8);for(let i=0;i<20;i++)assert.equal(h.update(request()).motions.get(0)!.x,point.x);
});
for(const [label,patch]of Object.entries({disabled:{enabled:false},cancel:{cancelRequest:1},auto:{autoRequest:1},reconcile:{reconcileRequest:1}}))test(`${label} cancels a target permanently`,()=>{
 const h=harness();h.update(request());h.update({...request(),...patch});assert.equal(h.world.destination,null);
 for(let i=0;i<10;i++)h.update({...request(),...patch,enabled:true});assert.equal(h.world.destination,null);
});
test('group/membership changes and a reconstructed world cannot replay historical target requests',()=>{
 const h=harness();h.update(request());const group={id:'g1',startsAt:epoch,endsAt:epoch+1000};h.update(request(),group);assert.equal(h.world.destination,null);
 h.world.sync([{...actor,joinedAt:epoch+2000}],'self');h.update(request());assert.equal(h.world.destination,null);
 const restored=harness({targetRequest:request().targetRequest});const result=restored.update(request());assert.equal(restored.world.destination,null);assert.equal(result.samples.length,0);
});
test('disabled and absent owners cannot queue a target that starts later',()=>{
 const h=harness();h.update({...request(),enabled:false});h.update(request());assert.equal(h.world.destination,null);
 h.world.sync([],null);h.update(request(2));h.world.sync([actor],'self');h.update(request(2));assert.equal(h.world.destination,null);
});

test('wave v2 freezes current manual position at full size, cancels click travel and parks there afterward',()=>{
 const h=harness();h.update(request());let moving=h.update(request());const before=moving.motions.get(0)!;
 const wave={id:'wave-2',kind:'wave',version:2,startsAt:epoch+350,endsAt:epoch+10000};
 const active=h.update(request(),wave);const point=active.motions.get(0)!;
 assert.ok(distance(before,point)<1e-8);assert.equal(active.scales.get(0)??1,1);assert.equal(h.world.destination,null);assert.equal(active.samples.at(-1)?.reason,'stop');
 for(let i=0;i<410;i++){moving=h.update(request(),wave);assert.ok(distance(moving.motions.get(0)!,before)<1e-8);assert.equal(moving.scales.get(0)??1,1);}
 assert.equal(h.world.destination,null);
});
test('wave v2 holds genuinely yielded automatic positions instead of snapping to their route',()=>{
 const h=harness();h.canonical.set(1,{...clubMotionAt(epoch,1),...origin});
 let before=h.update({vx:0,vz:0,active:true,enabled:true});
 for(let i=0;i<80;i++)before=h.update({vx:0,vz:0,active:false,enabled:true});
 const yielded=before.motions.get(1)!;assert.ok(distance(yielded,origin)>.5);
 const group={id:'w2',kind:'wave',version:2,startsAt:epoch+3000,endsAt:epoch+13000};
 const active=h.update({vx:0,vz:0,active:false,enabled:true},group);
 assert.ok(distance(active.motions.get(1)!,yielded)<1e-8);assert.equal(active.motions.get(1)!.walkBlend,0);
});

test('post-wave hydration and reconciliation retain the old accepted manual point without replaying a click',()=>{
 const wave={id:'w2-retained',kind:'wave',version:2,startsAt:epoch,endsAt:epoch+10000},parked=uv(3.8,5.5),base=clubMotionAt(epoch,0);
 for(const hydratedAfter of [false,true]){
  const world=new ClubManualWorld(),sample={actorId:actor.id,moveSequence:3,joinedAt:actor.joinedAt,groupId:null,mode:'manual' as const,...parked,heading:0,vx:0,vz:0,acceptedAt:epoch-100};world.sync([actor],'self',[sample]);
  const update=(now:number,intent?:ManualIntent)=>world.update({now,deltaSeconds:.025,canonical:new Map([[0,base]]),canonicalAt:()=>base,group:wave,intent});
  if(!hydratedAfter)update(epoch+500);
  let result=update(wave.endsAt+1);assert.ok(distance(result.motions.get(0)!,parked)<1e-8,'hydration stays at retained endpoint');
  result=update(wave.endsAt+25,request(1,uv(3,4)));assert.ok(distance(result.motions.get(0)!,parked)<=.0450001);
  result=update(wave.endsAt+50,{...request(),reconcileRequest:1});assert.ok(distance(result.motions.get(0)!,parked)<1e-8,'rejected movement restores retained source');assert.equal(world.destination,null);
  for(const emitted of result.samples)assert.ok(distance(emitted,parked)<1e-8,'no contradictory canonical stop is sent');
  world.sync([actor],'self',[{...sample,moveSequence:4,groupId:wave.id,acceptedAt:wave.endsAt+50}]);
  result=update(wave.endsAt+75,{...request(),reconcileRequest:1});assert.ok(distance(result.motions.get(0)!,parked)<1e-8);assert.equal(world.destination,null);
 }
});
test('a wave-interrupted click publishes one retained endpoint stop after group expiry',()=>{
 const h=harness();let frame=h.update(request());for(let i=0;i<8;i++)frame=h.update(request());const parked=frame.motions.get(0)!;
 const group={id:'expiry-stop',kind:'wave',version:2,startsAt:epoch+350,endsAt:epoch+1000};
 h.update(request(),group);let stops=0;for(let i=0;i<80;i++){frame=h.update(request(),group);for(const sample of frame.samples)if(sample.reason==='stop'){stops++;assert.ok(distance(sample,parked)<1e-8);}}
 assert.equal(stops,1);assert.equal(h.world.destination,null);
});
test('passive same-account takeover cannot publish a competing wave-expiry stop now or next frame',()=>{
 for(const beforeExpiry of [false,true]){
  const h=harness();h.update(request());const wave={id:'superseded-wave',kind:'wave',version:2,startsAt:epoch+350,endsAt:epoch+1000};h.update(request(),wave);
  // Keep this tab active enough to own a pending expiry stop, then hydrate the winner.
  const point=uv(2,4);h.world.sync([actor],'self',[{actorId:'self',moveSequence:20,joinedAt:actor.joinedAt,groupId:wave.id,mode:'manual',...point,heading:0,vx:0,vz:0,acceptedAt:wave.endsAt}]);
  const update=(now:number,reconcile=1)=>h.world.update({now,deltaSeconds:.025,canonical:h.canonical,canonicalAt:()=>h.canonical.get(0)!,group:wave,intent:{vx:0,vz:0,active:false,enabled:true,reconcileRequest:reconcile,reconcileStop:false}});
  const result=update(beforeExpiry?wave.endsAt-25:wave.endsAt);assert.equal(result.samples.length,0);
  for(let i=0;i<5;i++)assert.equal(update(wave.endsAt+i*25).samples.length,0);
 }
});
test('an accepted current-wave endpoint wins even without a transport supersession callback',()=>{
 const h=harness();h.update(request());const wave={id:'silent-winner',kind:'wave',version:2,startsAt:epoch+350,endsAt:epoch+1000};h.update(request(),wave);
 const accepted=uv(2,4);h.world.sync([actor],'self',[{actorId:'self',moveSequence:30,joinedAt:actor.joinedAt,groupId:wave.id,mode:'manual',...accepted,heading:0,vx:0,vz:0,acceptedAt:wave.endsAt}]);
 for(let i=0;i<100;i++){
  const result=h.world.update({now:wave.endsAt+i*25,deltaSeconds:.025,canonical:h.canonical,canonicalAt:()=>h.canonical.get(0)!,group:wave,intent:request()});
  assert.equal(result.samples.length,0,'old tab never publishes a competing retained endpoint');assert.equal(h.world.destination,null);
 }
});

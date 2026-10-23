import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayout} from '../src/v5/layout.ts';
import {createThreat,guardianCommand,stepThreat} from '../src/v5/threat.ts';
import {startLookout,advanceLookout,lookoutIsReady} from '../src/v5/lookout.ts';

function fixture(){
 const layout=createLayout();layout.buildings.push({id:'working-tower',kind:'tower',x:8,z:6,rotation:0,paidCost:12,doors:[],capacity:1});
 const state=createThreat({id:'lookout-event',seed:1,mode:'rehearsal',actors:[{id:'lamb',position:{x:4,z:4}}],guardian:'cat',guardianPosition:{x:8,z:8},wolfSpawns:[{x:0,z:6}]},layout);
 state.wolves[0].blockedUntil=100;return {layout,state};
}

test('a cat standing beside a tower receives no passive scouting bonus',()=>{
 const {layout,state}=fixture();
 const stationary=guardianCommand(state,layout,{kind:'station',target:{x:8,z:8}}).state;
 assert.equal(stepThreat(stationary,layout,{dt:.05}).discoveredAt,null);
});

test('a real settled lookout sees past its own tower, reports once and walks down before responding',()=>{
 const {layout,state}=fixture();
 let lookout=startLookout(layout,state.guardian!.position,'working-tower')!;
 while(!lookoutIsReady(layout,lookout))lookout=advanceLookout(layout,lookout,50)!;
 state.guardian!.lookout=lookout;state.guardian!.position={...lookout.position};
 const reported=stepThreat(state,layout,{dt:.05});
 assert.equal(reported.discoveredAt,0);assert.equal(reported.guardian!.lookout?.alerted,true);
 assert.equal(reported.guardian!.lookout?.height,2.23);
 const resumed=JSON.parse(JSON.stringify(reported));
 const descending=stepThreat(resumed,layout,{dt:1});
 assert.equal(descending.guardian!.lookout?.phase,'descent');
 assert.ok(descending.guardian!.lookout!.height>0);
 const done=stepThreat(descending,layout,{dt:5});
 assert.equal(done.guardian!.lookout?.phase,'done');assert.equal(done.guardian!.lookout?.height,0);
 assert.equal(done.events.filter(e=>e.type==='alert').length,1);
});

test('lookout and interruption commands preserve real stair poses instead of teleporting to ground',()=>{
 const {layout,state}=fixture();
 const result=guardianCommand(state,layout,{kind:'lookout',buildingId:'working-tower'});
 assert.equal(result.ok,true);assert.ok(result.state.guardian!.lookout);
 let raised=stepThreat(result.state,layout,{dt:1});
 assert.ok(raised.guardian!.lookout!.height>0);
 const pose={...raised.guardian!.position},height=raised.guardian!.lookout!.height;
 const interrupted=guardianCommand(raised,layout,{kind:'station',target:{x:7,z:8}});
 assert.equal(interrupted.ok,true);assert.deepEqual(interrupted.state.guardian!.position,pose);
 assert.equal(interrupted.state.guardian!.lookout!.height,height);assert.equal(interrupted.state.guardian!.lookout!.phase,'descent');
 raised=stepThreat(interrupted.state,layout,{dt:5});
 assert.equal(raised.guardian!.lookout?.height,0);assert.ok(Math.hypot(raised.guardian!.position.x-7,raised.guardian!.position.z-8)<.05);
});

test('a stale saved lookout pose cannot grant a tower bonus to a guardian still on the ground',()=>{
 const {layout,state}=fixture();let lookout=startLookout(layout,state.guardian!.position,'working-tower')!;
 while(!lookoutIsReady(layout,lookout))lookout=advanceLookout(layout,lookout,50)!;
 state.guardian!.lookout=lookout;
 assert.equal(stepThreat(state,layout,{dt:.05}).discoveredAt,null);
});

test('an ended threat still returns a guardian safely from its tower without changing recorded animal results',()=>{
 const {layout,state}=fixture();let lookout=startLookout(layout,state.guardian!.position,'working-tower')!;
 while(!lookoutIsReady(layout,lookout))lookout=advanceLookout(layout,lookout,50)!;
 state.guardian!.lookout=lookout;state.guardian!.position={...lookout.position};state.phase='complete';
 const animals=structuredClone(state.actors),events=structuredClone(state.events);
 const finished=stepThreat(state,layout,{dt:5});
 assert.equal(finished.guardian!.lookout?.phase,'done');assert.equal(finished.guardian!.lookout?.height,0);
 assert.deepEqual(finished.actors,animals);assert.deepEqual(finished.events,events);assert.equal(finished.elapsed,state.elapsed);
});

test('new threats preserve certified lookout poses through approach, ascent, settle, watching and descent',()=>{
 const {layout}=fixture();let lookout=startLookout(layout,{x:7,z:8},'working-tower')!;
 const poses=new Map<string,typeof lookout>();
 for(let i=0;i<500&&lookout.phase!=='done';i++){
  if(!poses.has(lookout.phase))poses.set(lookout.phase,structuredClone(lookout));
  lookout=advanceLookout(layout,lookout,50)!;
 }
 assert.deepEqual([...poses.keys()],['approach','ascent','settle','watching','descent']);
 for(const [phase,pose] of poses)for(const mode of ['rehearsal','reassure','challenge'] as const){
  const state=createThreat({id:`start-on-tower-${phase}-${mode}`,seed:1,mode,actors:[{id:'lamb',position:{x:4,z:4},participant:mode==='challenge'}],
   guardian:'cat',guardianPosition:pose.position,guardianLookout:pose,wolfSpawns:[{x:0,z:6}],challengeAuthorized:true,confirmedParticipants:['lamb']},layout);
  assert.deepEqual(state.guardian!.position,pose.position);assert.deepEqual(state.guardian!.lookout,pose);
  assert.notEqual(state.guardian!.lookout,pose);
  const next=stepThreat(state,layout,{dt:.05});
  assert.ok(Math.hypot(next.guardian!.position.x-pose.position.x,next.guardian!.position.z-pose.position.z,(next.guardian!.lookout?.height??0)-pose.height)<.2);
 }
});

test('a fake height, off-stair position or different tower geometry cannot bypass threat start walkability',()=>{
 const {layout}=fixture();let lookout=startLookout(layout,{x:8,z:8},'working-tower')!;
 while(!lookoutIsReady(layout,lookout))lookout=advanceLookout(layout,lookout,50)!;
 for(const forged of [
  {...structuredClone(lookout),height:200},
  {...structuredClone(lookout),position:{x:9,z:6}},
  {...structuredClone(lookout),buildingId:'nonexistent-tower'},
  {...structuredClone(lookout),path:[{x:8.5,z:6.5,height:2.23},{x:0,z:0,height:2.23}],pathIndex:1},
 ])assert.throws(()=>createThreat({id:'forged-lookout',seed:1,mode:'rehearsal',actors:[{id:'lamb',position:{x:4,z:4}}],guardian:'cat',guardianPosition:forged.position,guardianLookout:forged},layout),/守护者|高台/);
 const changed=structuredClone(layout);changed.buildings.find(b=>b.id==='working-tower')!.x=7;
 assert.throws(()=>createThreat({id:'moved-tower',seed:1,mode:'rehearsal',actors:[{id:'lamb',position:{x:4,z:4}}],guardian:'cat',guardianPosition:lookout.position,guardianLookout:lookout},changed),/守护者|高台/);
});

test('settled lookout adds exactly dog 2, frog 2 and cat 4 sight, with no bonus while descending',()=>{
 for(const [kind,x,z,sees] of [
  ['dog',7,6,true],['dog',8,6,false],['frog',6,6,true],['frog',7,6,false],['cat',11,4,true],['cat',12,4,false],
 ] as const){
  const layout=createLayout();for(let x=12;x<15;x++)for(let z=0;z<8;z++)layout.owned.push({x,z});
  layout.buildings.push({id:'bonus-tower',kind:'tower',x,z,rotation:0,paidCost:12,doors:[],capacity:1});
  let pose=startLookout(layout,{x,z:z+2},'bonus-tower')!;assert.ok(pose);
  while(!lookoutIsReady(layout,pose))pose=advanceLookout(layout,pose,50)!;
  const options={id:`bonus-${kind}-${x}`,seed:1,mode:'rehearsal' as const,actors:[{id:'lamb',position:{x:4,z:4}}],guardian:kind,guardianPosition:pose.position,guardianLookout:pose,wolfSpawns:[{x:0,z:6}]};
  const watched=stepThreat(createThreat(options,layout),layout,{dt:.05});
  assert.equal(watched.discoveredAt!==null,sees,`${kind} tower ${x}`);
  const descending=advanceLookout(layout,pose,0,{cancel:true})!;
  const leaving=stepThreat(createThreat({...options,guardianLookout:descending},layout),layout,{dt:.05});
  assert.equal(leaving.discoveredAt,null,`${kind} descent has no tower bonus`);
 }
});

test('an old finished lookout never teleports a walking guardian back to its tower when a new event starts',()=>{
 const {layout}=fixture();let done=startLookout(layout,{x:8,z:8},'working-tower')!;
 done=advanceLookout(layout,done,30_000)!;assert.equal(done.phase,'done');
 const position={x:6,z:8};
 const state=createThreat({id:'after-lookout',seed:1,mode:'rehearsal',actors:[{id:'lamb',position:{x:4,z:4}}],guardian:'dog',guardianPosition:position,guardianLookout:done},layout);
 assert.deepEqual(state.guardian!.position,position);assert.equal(state.guardian!.lookout,undefined);
});

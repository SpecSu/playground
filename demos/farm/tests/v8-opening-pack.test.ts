import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createLayout,isWalkable,regionAt,type GridPoint} from '../src/v5/layout.ts';
import {createThreat,guardianCommand,stepThreat} from '../src/v5/threat.ts';

const distance=(a:GridPoint,b:GridPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const animals=[{id:'lamb-a',position:{x:4,z:4}},{id:'lamb-b',position:{x:5,z:4}},{id:'lamb-c',position:{x:4,z:5}}];
const opening=(actors=animals)=>createThreat({id:'saved-opening',seed:17,mode:'tutorial',actors,guardianPosition:{x:5,z:5}},createLayout());

test('a tutorial creates two persistent wolves outside the pen with separated safe approach routes',()=>{
 const layout=createLayout(),state=opening();
 assert.equal(state.wolves.length,2,'both wolves must exist in the actual simulation');
 assert.equal(new Set(state.wolves.map(w=>w.id)).size,2);
 assert.ok(distance(state.wolves[0].spawn,state.wolves[1].spawn)>=3);
 for(const wolf of state.wolves){
  assert.notEqual(regionAt(wolf.spawn),'pen');
  assert.ok(wolf.opening?.entryPath.length);
  assert.ok(wolf.opening.entryPath.every(p=>isWalkable(layout,p)&&animals.every(a=>distance(a.position,p)>=1.5)));
 }
 for(const a of state.wolves[0].opening!.entryPath)for(const b of state.wolves[1].opening!.entryPath)assert.ok(distance(a,b)>=1.1);
 assert.deepEqual(opening().wolves.map(w=>w.id),state.wolves.map(w=>w.id));
 assert.deepEqual(stepThreat(state,layout,{dt:180}),state,'choice never advances dangers or animal outcomes');
});

test('saved sheep on old north-west wolf route never share a tutorial entry or approach point',()=>{
 const actors=[...animals,{id:'saved-at-old-route',position:{x:0,z:1}}],state=opening(actors);
 assert.equal(state.wolves.length,2);
 for(const w of state.wolves)for(const p of w.opening!.entryPath)assert.ok(actors.every(a=>distance(a.position,p)>=1.5));
});

test('a blocked tutorial keeps both wolves waiting outside animals instead of spawning on a fallback sheep',()=>{
 const layout=createLayout();layout.buildings=layout.buildings.filter(b=>b.kind!=='shelter');
 const state=createThreat({id:'blocked-opening',seed:17,mode:'tutorial',actors:animals,guardianPosition:{x:5,z:5}},layout);
 assert.equal(state.wolves.length,2);
 for(const wolf of state.wolves){assert.equal(wolf.opening?.phase,'waiting');assert.ok(wolf.opening?.waitingReason);assert.ok(animals.every(a=>distance(a.position,wolf.position)>=1.5));}
 const selected=guardianCommand(state,layout,{kind:'select',guardian:'dog'});
 assert.equal(selected.ok,true);
 const ended=stepThreat(selected.state,layout,{dt:30});
 assert.equal(ended.phase,'complete');assert.ok(ended.actors.every(a=>a.injuredAt===null&&a.memorialAt===null));
});

test('wolves hold their real staging positions until their guardian intercept is established',()=>{
 const layout=createLayout(),state=opening(),selected=guardianCommand(state,layout,{kind:'select',guardian:'dog'}).state;
 const positions=state.wolves.map(w=>w.position),early=stepThreat(selected,layout,{dt:.1});
 assert.deepEqual(early.wolves.map(w=>w.position),positions);
 assert.ok(early.wolves.every(w=>w.opening?.interceptedAt===null));
 let running=early;
 for(let i=0;i<100&&running.phase!=='complete';i++){
  running=stepThreat(running,layout,{dt:.2});
  for(const w of running.wolves)assert.ok(running.actors.every(a=>['safe','lost','memorial'].includes(a.status)||distance(w.position,a.position)>=.6));
 }
 assert.equal(running.phase,'complete');assert.ok(running.actors.every(a=>a.injuredAt===null&&a.memorialAt===null));
 assert.ok(running.events.some(e=>e.type==='opening-intercept'));
});

import {createEstate,estateSnapshot} from '../src/v5/estate.ts';
import {deriveOpeningScene} from '../src/v5/opening-scene.ts';
import {initialOpening,openingPresentation,type OpeningState} from '../src/v5/opening.ts';
import {ensureOpeningThreat} from '../src/v5/threat.ts';

const sceneSnapshot=()=>{
 const data=estateSnapshot(createEstate('two-wolf-scene',1_800_000_000_000),1_800_000_000_000);
 data.profile.threat=createThreat({id:'opening-scene-event',seed:17,mode:'tutorial',actors:data.profile.animals,guardianPosition:data.profile.guardianAt},data.profile.layout);
 return data;
};
const phase=(stage:OpeningState['stage'],elapsed=0):OpeningState=>({version:1,stage,elapsed,guardian:null});

test('opening reveals the second persisted wolf 1.5 seconds later and exposes sniff then stalk poses',()=>{
 const data=sceneSnapshot();
 const start=deriveOpeningScene(data,phase('approach',0)).profile.threat!.wolves;
 assert.equal(start.length,2);assert.equal(start[0].opening!.visible,true);assert.equal(start[1].opening!.visible,false);
 assert.equal(start[0].opening!.phase,'sniffing');
 const stalking=deriveOpeningScene(data,phase('approach',1)).profile.threat!.wolves;
 assert.equal(stalking[0].opening!.phase,'stalking');assert.equal(stalking[1].opening!.visible,false);
 const reveal=deriveOpeningScene(data,phase('approach',1.5)).profile.threat!.wolves;
 assert.equal(reveal[1].opening!.visible,true);assert.equal(reveal[1].opening!.phase,'sniffing');
 const end=deriveOpeningScene(data,phase('approach',4.5)).profile.threat!.wolves;
 assert.deepEqual(end.map(w=>w.position),data.profile.threat!.wolves.map(w=>w.position));
 assert.deepEqual(end.map(w=>w.id),data.profile.threat!.wolves.map(w=>w.id));
});

test('replay and fresh staging avoid sheep, each other and old entry routes at every sampled time',()=>{
 for(const replay of [false,true])for(const savedPosition of [{x:0,z:1},{x:0,z:4},{x:6,z:0},{x:0,z:6}]){
  const data=sceneSnapshot();data.profile.animals[0].position=savedPosition;
  data.profile.threat=createThreat({id:'occupied-entry',seed:17,mode:'tutorial',actors:data.profile.animals,guardianPosition:data.profile.guardianAt},data.profile.layout);
  const before=structuredClone(data);
  for(const stage of ['establish','approach','startle','choose','arrival'] as const)for(let elapsed=0;elapsed<=4.5;elapsed+=.25){
   const scene=deriveOpeningScene(data,phase(stage,elapsed),{replay}),wolves=scene.profile.threat?.wolves??[];
   for(const w of wolves)for(const a of scene.profile.animals)assert.ok(distance(w.position,a.position)>=.8,`${replay}/${stage}/${elapsed}: ${w.id} overlaps ${a.id}`);
   if(wolves.length===2)assert.ok(distance(wolves[0].position,wolves[1].position)>=.9);
  }
  assert.deepEqual(data,before);
 }
});

test('old one-wolf saves upgrade once while started events retain their identities and progress',()=>{
 const layout=createLayout(),old=createThreat({id:'old-save',seed:17,mode:'tutorial',actors:animals,guardianPosition:{x:5,z:5},wolfSpawns:[{x:0,z:4}]},layout);
 const upgraded=ensureOpeningThreat(old,layout);
 assert.equal(upgraded.wolves.length,2);assert.equal(upgraded.wolves[0].id,old.wolves[0].id);
 assert.deepEqual(ensureOpeningThreat(JSON.parse(JSON.stringify(upgraded)),layout),upgraded);
 const active=stepThreat(guardianCommand(old,layout,{kind:'select',guardian:'dog'}).state,layout,{dt:1});
 assert.equal(ensureOpeningThreat(active,layout),active);
});

test('the opening presentation never locks movement input while danger remains paused',()=>{
 for(const stage of ['establish','rustle','approach','startle','choose','arrival','defend','done'] as const)
  assert.equal(openingPresentation({...initialOpening(),stage}).controlsLocked,false,stage);
});

test('expanded DIY layouts derive two valid perimeter entries without assuming the original gate',()=>{
 const layout=createLayout();
 for(let x=12;x<18;x++)for(let z=0;z<6;z++)layout.owned.push({x,z});
 layout.buildings=layout.buildings.filter(b=>b.kind!=='shelter');
 layout.buildings.push({id:'moved-home',kind:'shelter',x:13,z:1,rotation:0,paidCost:24,capacity:6,doors:[{id:'moved-door',x:14,z:4,open:true,paidCost:0}]});
 layout.buildings.push({id:'blocked-old-gate',kind:'decor',x:0,z:4,rotation:0,paidCost:2,capacity:0,doors:[]});
 const actors=[{id:'moved-sheep',position:{x:16,z:4}},{id:'moved-sheep-2',position:{x:16,z:5}}];
 const state=createThreat({id:'expanded-opening',seed:17,mode:'tutorial',actors,guardianPosition:{x:12,z:5}},layout);
 assert.equal(state.wolves.length,2);
 for(const wolf of state.wolves){
  assert.equal(wolf.targetDoorId,'moved-door');assert.equal(wolf.opening?.waitingReason,undefined);
  assert.ok(wolf.opening!.entryPath.every(p=>isWalkable(layout,p)&&actors.every(a=>distance(a.position,p)>=1.5)));
  assert.ok(wolf.path.every(p=>isWalkable(layout,p)));
 }
});

test('all three guardians keep occupied-save sheep separated from the pair throughout the real defense',()=>{
 const layout=createLayout();
 for(const guardian of ['dog','cat','frog'] as const)for(const position of [{x:0,z:1},{x:0,z:4},{x:6,z:0},{x:0,z:6}]){
  let state=opening([{id:'old-position',position},...animals]);
  state=guardianCommand(state,layout,{kind:'select',guardian}).state;
  for(let i=0;i<500&&state.phase!=='complete';i++){
   state=stepThreat(state,layout,{dt:.1});
   for(const wolf of state.wolves.filter(w=>w.status!=='retreated'))for(const actor of state.actors.filter(a=>!['safe','lost','memorial'].includes(a.status)))
    assert.ok(distance(wolf.position,actor.position)>=.6,`${guardian}/${position.x},${position.z}/${state.elapsed}: ${wolf.id} overlaps ${actor.id}`);
  }
  assert.equal(state.phase,'complete');assert.ok(state.actors.every(a=>a.injuredAt===null&&a.memorialAt===null));
 }
});

test('upgrading an old zero-clock save preserves an already issued guardian command and its receipt',()=>{
 const layout=createLayout(),legacy=createThreat({id:'old-command',seed:17,mode:'tutorial',actors:animals,guardianPosition:{x:5,z:5},wolfSpawns:[{x:0,z:4}]},layout);
 const selected=guardianCommand(legacy,layout,{kind:'select',guardian:'dog'}).state;
 const commanded=guardianCommand(selected,layout,{kind:'block',wolfId:selected.wolves[0].id}).state;
 const upgraded=ensureOpeningThreat(commanded,layout);
 assert.equal(upgraded.wolves.length,2);assert.deepEqual(upgraded.guardian,commanded.guardian);assert.deepEqual(upgraded.events,commanded.events);
});

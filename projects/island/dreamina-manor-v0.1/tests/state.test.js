import test from 'node:test';import assert from 'node:assert/strict';
import {createGame,applyCommand,assertGame,canClaimEmergency,publicGame} from '../lib/game/state.js';
import {constructionView} from '../lib/game/construction.js';
import {ECONOMY} from '../lib/game/economy.js';
const ctx=(now=1000)=>({now,seed:42,newId:()=>`id-${now}`,config:ECONOMY,canDisplayFish:()=>true});
const begin=(s,action,extra={},now=1000)=>applyCommand(s,{type:'begin-work',action,target:{kind:'land',cell:{x:0,z:0}},...extra},ctx(now)).state;
const finish=s=>applyCommand(s,{type:'finish-work',intentId:s.pending.id},ctx(s.pending.finishAt)).state;
const mature=()=>{let s=begin(createGame('qa-state',0),'plant',{tier:1});s=finish(s);return s;};
const collect=(s,now=s.jobs[0].readyAt)=>finish(begin(s,'harvest',{},now));

test('new namespace starts with only four tiles, one seed, no job/dock/tank',()=>{
 const s=createGame('qa-state',0);assert.equal(s.gameId,'manor-next');assert.equal(s.schemaVersion,1);assert.equal(s.land.length,4);assert.equal(s.coins,24);assert.deepEqual(s.seeds,[1,0,0,0,0]);assert.equal(s.jobs.length+s.docks.length+s.tank.length,0);assertGame(s);
});
test('begin/cancel walking consumes nothing and does not pre-draw any output',()=>{
 const original=createGame('qa-state',0),s=begin(original,'plant',{tier:1});assert.equal(s.seeds[0],1);assert.equal(s.jobs.length,0);assert.ok(s.pending);assert.equal(s.pending.product,undefined);
 const cancelled=applyCommand(s,{type:'cancel-work'},ctx(1100)).state;assert.equal(cancelled.seeds[0],1);assert.equal(cancelled.jobs.length,0);assert.equal(cancelled.pending,null);assert.deepEqual(original,createGame('qa-state',0));
});
test('cannot finish before arrival/gesture, first planted crop is exactly ten seconds',()=>{
 const s=begin(createGame('qa-state',0),'plant',{tier:1});assert.throws(()=>applyCommand(s,{type:'finish-work',intentId:s.pending.id},ctx(s.pending.finishAt-1)),/还没到/);
 const done=finish(s);assert.equal(done.seeds[0],0);assert.equal(done.jobs.length,1);assert.equal(done.jobs[0].readyAt-done.jobs[0].startedAt,10000);assert.equal(done.pending,null);assertGame(done);
});
test('one input produces one persisted product, reload does not reroll',()=>{
 const s=mature(),r=JSON.parse(JSON.stringify(s));assert.equal(r.jobs.length,1);assert.deepEqual(r.jobs[0],s.jobs[0]);assert.ok(r.jobs[0].product.id);assert.equal(s.items.length,0);assertGame(r);
 assert.throws(()=>applyCommand(r,{type:'finish-work',intentId:'already-finished'},ctx(999999)),/这次操作/);
});
test('duplicate target taps preserve the first arrival intent and do not restart walk',()=>{
 const s=begin(createGame('qa-state',0),'plant',{tier:1});const twice=begin(s,'plant',{tier:1},1200);assert.deepEqual(twice.pending,s.pending);assert.equal(twice.seeds[0],1);
});
test('target changed while walking leaves seed in bag and makes no product',()=>{
 const s=begin(createGame('qa-state',0),'plant',{tier:1});s.tank=[{x:0,z:0},{x:1,z:0}];assert.throws(()=>finish(s),/这里/);assert.equal(s.seeds[0],1);assert.equal(s.jobs.length,0);
});
test('harvest is not a remote open: arrival moves exactly one same-ID product to bag',()=>{
 const s=mature(),id=s.jobs[0].product.id;assert.throws(()=>begin(s,'harvest',{},s.jobs[0].readyAt-1),/还要/);
 const walking=begin(s,'harvest',{},s.jobs[0].readyAt);assert.equal(walking.items.length,0);assert.equal(walking.jobs.length,1);
 const done=finish(walking);assert.equal(done.items.length,1);assert.equal(done.items[0].id,id);assert.equal(done.items[0].location.kind,'bag');assert.equal(done.jobs.length,0);assert.equal(done.discovered[done.items[0].speciesId],1);assertGame(done);
});
test('second planting uses a new seed and no perpetual production from a display',()=>{
 let s=collect(mature());const id=s.items[0].id;s=finish(begin(s,'display',{itemId:id},30000));assert.equal(s.items[0].location.kind,'land');assert.equal(s.jobs.length,0);
 assert.throws(()=>begin(s,'harvest',{},999999),/没有可收/);assert.throws(()=>begin(s,'plant',{tier:1},999999),/这里/);assertGame(s);
});
test('holding a second item returns the first to bag atomically',()=>{
 let s=collect(mature());const p={...s.items[0],id:'second',location:{kind:'bag'}};s.items.push(p);s=applyCommand(s,{type:'hold',itemId:s.items[0].id},ctx()).state;s=applyCommand(s,{type:'hold',itemId:'second'},ctx()).state;assert.equal(s.items.filter(x=>x.location.kind==='hand').length,1);assert.equal(s.items[0].location.kind,'bag');assert.equal(s.items[1].location.kind,'hand');assertGame(s);
});
test('sale removes the one instance and pays exactly its saved value',()=>{
 let s=collect(mature());const item=s.items[0],coins=s.coins;s=applyCommand(s,{type:'hold',itemId:item.id},ctx()).state;s=applyCommand(s,{type:'sell',itemId:item.id},ctx()).state;assert.equal(s.items.length,0);assert.equal(s.coins,coins+item.value);assert.throws(()=>applyCommand(s,{type:'sell',itemId:item.id},ctx()),/找不到/);assertGame(s);
});
test('emergency seed follows all three approved conditions; holding/growing blocks a second',()=>{
 const s=createGame('qa-state',0);s.coins=4;s.seeds=[0,0,0,0,0];assert.ok(canClaimEmergency(s));const r=applyCommand(s,{type:'emergency-seed'},ctx()).state;assert.equal(r.seeds[0],1);assert.equal(r.coins,4);assert.ok(!canClaimEmergency(r));assert.throws(()=>applyCommand(r,{type:'emergency-seed'},ctx()),/还有/);
 const growing=finish(begin(r,'plant',{tier:1}));assert.ok(!canClaimEmergency(growing));const harvested=collect(growing);assert.ok(canClaimEmergency(harvested));assert.equal(harvested.items.length,1);
});
test('an existing collectible/display never must be sold to claim emergency seed',()=>{
 const s=collect(mature());s.coins=0;s.items[0].location={kind:'land',cell:{x:0,z:0}};assert.ok(canClaimEmergency(s));const r=applyCommand(s,{type:'emergency-seed'},ctx()).state;assert.equal(r.items[0].id,s.items[0].id);assert.equal(r.coins,0);
});
test('land is the same unit price, nonrectangular growth never moves old coordinates',()=>{
 const s=createGame('qa-state',0);s.coins=200;const old=structuredClone(s.land);const r=applyCommand(s,{type:'expand-land',cell:{x:-1,z:0}},ctx()).state;assert.equal(r.coins,140);assert.equal(r.land.length,4);assert.equal(constructionView(r,13000).land.length,5);assert.deepEqual(r.land,old);assert.throws(()=>applyCommand(r,{type:'expand-land',cell:{x:-2,z:-1}},ctx()),/相邻|连着/);
});
test('each dock is one fishing job location; only one bait is consumed after arrival',()=>{
 let s=createGame('qa-state',0);s.coins=200;s=applyCommand(s,{type:'build-dock',cell:{x:2,z:0}},ctx()).state;s=constructionView(s,13000);s=applyCommand(s,{type:'buy-input',kind:'bait',tier:1},ctx(13000)).state;const before=s.coins;s=begin(s,'fish',{tier:1,target:{kind:'dock',cell:{x:2,z:0}}});assert.equal(s.baits[0],1);s=finish(s);assert.equal(s.baits[0],0);assert.equal(s.jobs.length,1);assert.equal(s.jobs[0].product.kind,'fish');assert.equal(s.coins,before);assertGame(s);
});
test('first tank needs one owned empty cell; every later cell adds ten',()=>{
 let s=createGame('qa-state',0);s.coins=1000;
 s=applyCommand(s,{type:'build-tank',cells:[{x:0,z:0}]},ctx()).state;assert.equal(s.tank.length,0);s=constructionView(s,13000);assert.equal(s.tank.length,1);assert.equal(s.coins,920);
 s=applyCommand(s,{type:'build-tank',cells:[{x:0,z:1}]},ctx(13001)).state;s=constructionView(s,25001);assert.equal(s.tank.length*ECONOMY.tankCapacityPerCell,20);assert.equal(s.coins,840);assertGame(s);
});
test('public game exposes safe gameplay data, not private operation receipts',()=>{
 const s=createGame('qa-state',0);s.receipts={secret:'not-a-game-field'};const p=publicGame(s,1000);assert.equal(p.receipts,undefined);assert.equal(p.ownerUid,s.ownerUid);
});
test('unknown state version is rejected, never reset to an empty island',()=>{
 const s=createGame('qa-state',0);s.schemaVersion=9;assert.throws(()=>applyCommand(s,{type:'emergency-seed'},ctx()),/更新/);
});

test('dock extension preserves saved fish, readiness and spent bait; enclosing it spends nothing',()=>{let s=createGame('qa-water',0);s.coins=500;s.docks=[{x:1,z:2}];s.baits[0]=1;s=applyCommand(s,{type:'begin-work',action:'fish',tier:1,target:{kind:'dock',cell:s.docks[0]}},ctx()).state;s=finish(s);const saved=structuredClone(s.jobs[0]),bait=s.baits[0];const next=applyCommand(s,{type:'build-dock',cell:{x:1,z:3}},ctx()).state;assert.deepEqual(next.jobs[0],saved);assert.equal(next.baits[0],bait);assert.equal(next.coins,s.coins-60);const before=structuredClone(next);next.land.push({x:0,z:2});next.land.push({x:2,z:1});assert.throws(()=>applyCommand(next,{type:'expand-land',cell:{x:2,z:2}},ctx()),/留一片水/);assert.equal(next.coins,before.coins);assert.deepEqual(next.jobs[0],saved);});

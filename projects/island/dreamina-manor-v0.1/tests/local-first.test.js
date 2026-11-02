import test from 'node:test';import assert from 'node:assert/strict';
import {createGame} from '../lib/game/state.js';
import {applyLocalOperation,planLocalOperation,productionSeed} from '../lib/game/local-operations.js';
const game=()=>({...createGame('qa-local-v7',1000),localSync:{seed:12345,sequence:0,epoch:'test-epoch',issuedAt:1000}});
test('local purchase feeds plant and fixed growth/identity without cloud ACK',()=>{let s=game();s=applyLocalOperation(s,{id:'purchase-one',command:{type:'buy-input',kind:'seed',tier:1},at:2000,startedAt:2000,dependsOn:[]}).state;assert.equal(s.coins,16);assert.equal(s.seeds[0],2);const op=planLocalOperation(s,{type:'begin-work',action:'plant',tier:1,target:{kind:'land',cell:{x:0,z:0}}},{id:'plant-operation',now:2100});const a=applyLocalOperation(s,op),b=applyLocalOperation(s,op);assert.deepEqual(a.state.jobs,b.state.jobs);assert.equal(a.state.jobs[0].startedAt,op.at);assert.equal(a.state.jobs[0].readyAt,op.at+10000);assert.equal(a.state.seeds[0],1);assert.equal(a.state.localSync.sequence,1);});
test('production sequence cannot silently reroll across devices',()=>{const s=game(),op=planLocalOperation(s,{type:'begin-work',action:'plant',tier:1,target:{kind:'land',cell:{x:0,z:0}}},{id:'plant-operation',now:2000});const next=applyLocalOperation(s,op).state;assert.throws(()=>applyLocalOperation(next,{...op,id:'different-operation',command:{...op.command,target:{kind:'land',cell:{x:1,z:0}}}}),{code:'DRAW_CONFLICT'});assert.equal(productionSeed(s.localSync,0),productionSeed(s.localSync,0));});
import {memoryD1} from './d1-helper.js';import {SocialStore}from'../lib/server/social-store.js';import {readGame,performCommand}from'../lib/server/service.js';import {createLocalJournal}from'../lib/client/local-journal.js';
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
test('durable local buy plant grow harvest hold pipeline confirms same IDs in batch once',async()=>{const store=new SocialStore(memoryD1());let t=1000;const uid='qa-journal-seven',sessionId='qa-journal-session';const initial=await readGame(store,{uid,sessionId},t);const j=createLocalJournal({uid,sessionId,storage:storage(),now:()=>t});j.observe(initial);
 j.enqueue({type:'buy-input',kind:'seed',tier:1});assert.equal(j.view().game.coins,16);const plant=j.enqueue({type:'begin-work',action:'plant',tier:1,target:{kind:'land',cell:{x:0,z:0}}});t=plant.op.at;j.tick();const job=j.view().game.jobs[0];assert.equal(job.startedAt,t);t=job.readyAt;const harvest=j.enqueue({type:'begin-work',action:'harvest',target:job.target});t=harvest.op.at;j.tick();j.enqueue({type:'hold',itemId:job.product.id});assert.equal(j.view().game.items[0].location.kind,'hand');
 let sent;const client={get busy(){return false;},get hasUnconfirmed(){return false;},command:async(command,unused,opId)=>{sent={uid,sessionId,schemaVersion:1,command,opId};return performCommand(store,sent,t);}};await j.pump(client);assert.equal(j.entries().length,0);const final=await store.read(uid);assert.equal(final.items.length,1);assert.equal(final.items[0].id,job.product.id);assert.equal(final.items[0].location.kind,'hand');assert.equal(final.seeds[0],1);await performCommand(store,sent,t+100);assert.equal((await store.read(uid)).items.length,1);
});

test('local construction and fishing chain batch preserves geometry, exact fish and finances',async()=>{
 const db=memoryD1(),store=new SocialStore(db),uid='qa-local-build-fish',sessionId='qa-build-fish-session';try{
  await store.ensure(uid,1000);const funded=await store.read(uid);funded.coins=1000;db.raw.prepare('UPDATE manor_games SET state_json=? WHERE uid=?').run(JSON.stringify(funded),uid);
  let state=(await readGame(store,{uid,sessionId},1000)).game,t=1100;const operations=[];
  const add=command=>{const id=`qa-build-fish-op-${operations.length}`,op=planLocalOperation(state,command,{id,now:t,dependsOn:operations.length?[operations.at(-1).id]:[]});state=applyLocalOperation(state,op).state;t=op.at+1;operations.push(op);return op;};
  add({type:'expand-land',cell:{x:2,z:1}});t+=12000;add({type:'expand-land',cell:{x:2,z:0}});t+=12000;
  add({type:'build-dock',cell:{x:0,z:2}});add({type:'build-tank',cells:[{x:0,z:0},{x:1,z:0}]});t+=12000;add({type:'build-tank',cells:[{x:2,z:0}]});t+=12000;
  add({type:'buy-input',kind:'bait',tier:1});const fish=add({type:'begin-work',action:'fish',tier:1,target:{kind:'dock',cell:{x:0,z:2}}});
  const job=structuredClone(state.jobs[0]);assert.equal(job.startedAt,fish.at);t=job.readyAt;
  add({type:'begin-work',action:'harvest',target:job.target});add({type:'hold',itemId:job.product.id});add({type:'begin-work',action:'display',target:{kind:'tank',cell:{x:0,z:0}},itemId:job.product.id});
  assert.equal(state.items[0].location.kind,'tank');add({type:'begin-work',action:'retrieve',target:{kind:'tank',cell:{x:0,z:0}},itemId:job.product.id,destination:'hand'});assert.equal(state.items[0].location.kind,'hand');
  add({type:'store-hand'});add({type:'sell',itemId:job.product.id});assert.equal(state.coins,572+job.product.value);assert.equal(state.items.length,0);assert.equal(state.tank.length,3);
  const body={schemaVersion:1,uid,sessionId,opId:'qa-build-fish-batch',command:{type:'sync-local',operations:operations.map(({motion,...op})=>op)}};
  const result=await performCommand(store,body,t);assert.ok(result.receipt.results.every(r=>r.status==='confirmed'));assert.equal(result.game.coins,state.coins);assert.deepEqual(result.game.land,state.land);assert.deepEqual(result.game.tank,state.tank);assert.deepEqual(result.game.docks,state.docks);assert.equal(result.game.items.length,0);assert.equal(result.game.localSync.sequence,1);
  await performCommand(store,body,t+1000);assert.equal((await store.read(uid)).coins,state.coins);
 }finally{db.raw.close();}
});

test('server rejects an overspend and its dependent production without spending or random advancement',async()=>{
 const db=memoryD1(),store=new SocialStore(db),uid='qa-local-no-money',sessionId='qa-no-money-session';try{
  const initial=await readGame(store,{uid,sessionId},1000),rich={...initial.game,coins:1000};
  const buy=planLocalOperation(rich,{type:'buy-input',kind:'seed',tier:5},{id:'qa-too-expensive-buy',now:1100}),after=applyLocalOperation(rich,buy).state;
  const plant=planLocalOperation(after,{type:'begin-work',action:'plant',tier:5,target:{kind:'land',cell:{x:0,z:0}}},{id:'qa-dependent-high-plant',now:1200,dependsOn:[buy.id]});
  const result=await performCommand(store,{schemaVersion:1,uid,sessionId,opId:'qa-insufficient-batch',command:{type:'sync-local',operations:[buy,plant].map(({motion,...op})=>op)}},plant.at+1);
  assert.deepEqual(result.receipt.results.map(r=>r.status),['rejected','rejected']);assert.equal(result.receipt.results[0].code,'NOT_ENOUGH_COINS');assert.equal(result.receipt.results[1].code,'DEPENDENCY_REJECTED');assert.equal(result.game.coins,24);assert.deepEqual(result.game.seeds,[1,0,0,0,0]);assert.equal(result.game.localSync.sequence,0);assert.equal(result.game.jobs.length,0);
 }finally{db.raw.close();}
});

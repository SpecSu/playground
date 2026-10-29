import test from 'node:test';import assert from 'node:assert/strict';import {createAvatarCreationStore}from'../src/avatar-creation.js';
let api;try{api=await import('../src/avatar-generation.js')}catch{api={}}
function fixture({available=true,loadResult=true}={}){
 assert.equal(typeof api.createAvatarGeneration,'function');let time=0,finishWait,finishLoad,loadCalls=0,restores=0;
 const store=createAvatarCreationStore({storage:null,now:()=>time});
 const flow=api.createAvatarGeneration({store,now:()=>time,isAvailable:()=>available,wait:()=>new Promise(r=>finishWait=r),
 load:async()=>{loadCalls++;return typeof loadResult==='boolean'?loadResult:new Promise(r=>finishLoad=r)},restore:async()=>{restores++}});
 return {store,flow,advance(ms){time+=ms;finishWait?.()},finish(value){finishLoad?.(value)},get loadCalls(){return loadCalls},get restores(){return restores}};
}
test('five seconds alone never unlocks until actual model success; no point debit for base actor',async()=>{
 const f=fixture({loadResult:null});const run=f.flow.createAvatar();assert.equal(f.flow.getState().busy,true);assert.equal(f.loadCalls,0);
 f.advance(4999);await Promise.resolve();assert.equal(f.loadCalls,0);f.advance(1);await new Promise(r=>setImmediate(r));
 assert.equal(f.loadCalls,1);assert.equal(f.store.getState().unlocked,false);f.finish(true);const state=await run;
 assert.equal(state.unlocked,true);assert.deepEqual(state.outfits,[0]);assert.equal(state.points,300);assert.equal(state.busy,false);
});
test('missing or failed assets never unlock/debit; cancelled in-flight load restores selection',async()=>{
 const missing=fixture({available:false});assert.equal((await missing.flow.createAvatar()).unlocked,false);assert.equal(missing.loadCalls,0);
 const failed=fixture({loadResult:false});const bad=failed.flow.createAvatar();failed.advance(5000);assert.equal((await bad).unlocked,false);assert.equal(failed.restores,1);
 const cancelled=fixture({loadResult:null});const pending=cancelled.flow.createAvatar();cancelled.advance(5000);await new Promise(r=>setImmediate(r));cancelled.flow.cancel();cancelled.finish(true);await pending;
 assert.equal(cancelled.flow.getState().unlocked,false);assert.equal(cancelled.flow.getState().points,300);assert.equal(cancelled.restores,1);
});
test('cancel before timer never starts model load; new job remains independent',async()=>{
 const f=fixture();const first=f.flow.createAvatar();f.flow.cancel();f.advance(5000);await first;assert.equal(f.loadCalls,0);
 const second=f.flow.createAvatar();f.advance(5000);assert.equal((await second).unlocked,true);assert.equal(f.loadCalls,1);
});
test('double click preserves original job and successful completion clears errors; Pharaoh commits once after the prepared asset loads',async()=>{
 const f=fixture();const first=f.flow.createAvatar();const duplicate=await f.flow.createAvatar();assert.equal(duplicate.busy,true);
 f.advance(5000);const created=await first;assert.equal(created.error,null);
 const costume=f.flow.generateOutfit(1);assert.equal(f.flow.getState().points,300);f.advance(5000);
 const finished=await costume;assert.equal(finished.points,200);assert.deepEqual(finished.outfits,[0,1]);assert.equal(f.loadCalls,2);
 await f.flow.generateOutfit(1);assert.equal(f.flow.getState().points,200);
});
test('after timed preparation the pending model is a separate indeterminate phase',async()=>{
 const f=fixture({loadResult:null});const run=f.flow.createAvatar();assert.equal(f.flow.getState().phase,'preparing');
 f.advance(5000);await new Promise(r=>setImmediate(r));assert.equal(f.flow.getState().phase,'loading-model');assert.equal(f.flow.getState().progress,null);assert.equal(f.flow.getState().unlocked,false);
 f.finish(true);const state=await run;assert.equal(state.phase,'idle');assert.equal(state.unlocked,true);
});

test('Pharaoh failed load or cancellation after the timer never unlocks or charges',async()=>{
 for(const cancel of [false,true]){
  const f=fixture({loadResult:cancel?null:false});const base=f.store.beginAvatarCreation();f.advance(5000);f.store.completeOperation(base.token,{resultAvailable:true});
  const run=f.flow.generateOutfit(1);f.advance(5000);await new Promise(r=>setImmediate(r));
  if(cancel){f.flow.cancel();f.finish(true);}await run;
  assert.deepEqual(f.store.getState().outfits,[0]);assert.equal(f.store.getState().points,300);assert.equal(f.store.getState().operation,null);assert.equal(f.restores,1);
 }
});

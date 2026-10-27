import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {SAVE_KEY,loadGame,saveGame,archiveDamaged,validateState} from '../src/storage.js';
const NOW=1792942800000;
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),map};};
test('fresh storage stays empty until an intentional save; round trip preserves growing crop and currency',()=>{
  const store=memory();const empty=loadGame(store,NOW);assert.equal(empty.status,'empty');assert.equal(store.map.size,0);
  const s=reduce(createState(NOW,'round-trip'),{type:'PLANT',tileId:'tile-0-0',varietyId:'radish'},NOW).state;
  assert.equal(saveGame(store,s,NOW).ok,true);const loaded=loadGame(store,NOW+1000);assert.equal(loaded.status,'loaded');assert.deepEqual(loaded.state,s);
  assert.equal(SAVE_KEY,'inspiration-garden:v1');assert.equal([...store.map.keys()].some(k=>!k.startsWith(SAVE_KEY)),false);
});
test('second save keeps last valid revision as recovery and corrupt primary recovers without overwriting bytes',()=>{
  const store=memory(),s=createState(NOW,'recovery');saveGame(store,s,NOW);
  const newer=reduce(s,{type:'DAILY_CLAIM'},NOW).state;saveGame(store,newer,NOW+1);store.setItem(SAVE_KEY,'{broken');
  const loaded=loadGame(store,NOW+2);assert.equal(loaded.status,'recovered');assert.equal(loaded.state.crystals,3);assert.equal(store.getItem(SAVE_KEY),'{broken');
});
test('fully corrupt saves do not silently replace progress and can be explicitly archived',()=>{
  const store=memory();store.setItem(SAVE_KEY,'broken');store.setItem(SAVE_KEY+':recovery','also broken');
  const loaded=loadGame(store,NOW);assert.equal(loaded.status,'corrupt');assert.equal(loaded.state,null);assert.equal(store.getItem(SAVE_KEY),'broken');
  const archived=archiveDamaged(store,NOW);assert.equal(archived.ok,true);assert.ok([...store.map].some(([k,v])=>k.includes(':damaged:')&&v.includes('also broken')));
});
test('quota failure is visible and does not destroy primary or a valid recovery',()=>{
  const store=memory(),s=createState(NOW,'quota');saveGame(store,s,NOW);const original=store.getItem(SAVE_KEY);
  const denied={getItem:store.getItem,setItem(){throw new Error('QuotaExceededError');}};
  assert.equal(saveGame(denied,{...s,coins:90},NOW+1).ok,false);assert.equal(store.getItem(SAVE_KEY),original);
});
test('invalid references, negative balances, unsupported versions, orphaned terrain are rejected',()=>{
  const s=createState(NOW,'validation');assert.equal(validateState(s),true);
  assert.equal(validateState({...s,coins:-1}),false);assert.equal(validateState({...s,version:99}),false);
  assert.equal(validateState({...s,tiles:[...s.tiles,{id:'orphan',x:9,y:9,kind:'land'}]}),false);
  assert.equal(validateState({...s,plants:[{id:'bad',tileId:'none',varietyId:'radish',plantedAt:NOW,readyAt:NOW+15e3}]}),false);
  assert.equal(validateState({...s,inventory:{unknown:1}}),false);
});
test('storage getter denied is distinguishable from an empty garden',()=>{
  const loaded=loadGame({getItem(){throw new Error('SecurityError');}},NOW);assert.equal(loaded.status,'unavailable');assert.equal(loaded.state,null);
});
test('two browser snapshots cannot silently overwrite a newer coin/crystal head',()=>{
 const store=memory(),initial=createState(NOW,'tabs');const first=saveGame(store,initial,NOW,{expectedHead:null});assert.equal(first.ok,true);
 const tabA=loadGame(store,NOW),tabB=loadGame(store,NOW);assert.equal(tabA.head,tabB.head);
 const spent=reduce(tabA.state,{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:'tab-a'},NOW).state;
 const saved=saveGame(store,spent,NOW+1,{expectedHead:tabA.head});assert.equal(saved.ok,true);
 const stale=saveGame(store,{...tabB.state,coins:90},NOW+2,{expectedHead:tabB.head});assert.equal(stale.ok,false);assert.equal(stale.conflict,true);
 const final=loadGame(store,NOW+3);assert.equal(final.state.crystals,2);assert.equal(final.state.coins,120);assert.equal(final.head,saved.head);
});
import {createSaveCoordinator} from '../src/storage.js';
test('save coordinator serializes same-page snapshots but rejects a competing older tab head',async()=>{
 const queues=new Map(),locks={request(name,_options,callback){const next=(queues.get(name)??Promise.resolve()).then(callback);queues.set(name,next.catch(()=>{}));return next;}};
 const store=memory(),s=createState(NOW,'coordinator');const seed=saveGame(store,s,NOW);const a=createSaveCoordinator({storage:store,head:seed.head,locks}),b=createSaveCoordinator({storage:store,head:seed.head,locks});
 const r1=a.save({...s,coins:110},NOW+1),r2=a.save({...s,coins:100},NOW+2);assert.equal((await r1).ok,true);assert.equal((await r2).ok,true);assert.equal(loadGame(store).state.coins,100);
 const stale=await b.save({...s,crystals:2},NOW+3);assert.equal(stale.conflict,true);assert.equal(loadGame(store).state.coins,100);assert.equal(loadGame(store).state.crystals,3);
 b.adopt(loadGame(store).head);assert.equal((await b.save({...loadGame(store).state,crystals:2},NOW+4)).ok,true);assert.equal(loadGame(store).state.crystals,2);
});
test('recovered primary bytes are archived before replacement and failed archiving preserves original data',()=>{
 const store=memory(),s=createState(NOW,'corrupt-preserve');saveGame(store,s,NOW);saveGame(store,{...s,coins:90},NOW+1);store.setItem(SAVE_KEY,'{corrupt-exact-bytes');
 const recovered=loadGame(store,NOW+2);assert.equal(recovered.status,'recovered');const r=saveGame(store,{...recovered.state,coins:100},NOW+3,{expectedHead:recovered.head});assert.equal(r.ok,true);
 assert.ok([...store.map].some(([k,v])=>k.includes(':damaged:')&&JSON.parse(v).primary==='{corrupt-exact-bytes'));
 const denied=memory();saveGame(denied,s,NOW);saveGame(denied,{...s,coins:90},NOW+1);denied.setItem(SAVE_KEY,'BROKEN');const head=loadGame(denied).head;
 const blockArchive={getItem:denied.getItem,setItem(k,v){if(k.includes(':damaged:'))throw new Error('QuotaExceeded');denied.setItem(k,v);}};
 const failure=saveGame(blockArchive,s,NOW+3,{expectedHead:head});assert.equal(failure.ok,false);assert.equal(denied.getItem(SAVE_KEY),'BROKEN');
});
test('without a cross-tab lock API save coordinator fails closed into explicit temporary play',async()=>{
 const store=memory(),s=createState(NOW,'no-locks'),first=saveGame(store,s,NOW),coordinator=createSaveCoordinator({storage:store,head:first.head});
 const r=await coordinator.save({...s,crystals:2},NOW+1);assert.equal(r.ok,false);assert.equal(r.temporaryRequired,true);assert.equal(loadGame(store).state.crystals,3);
});

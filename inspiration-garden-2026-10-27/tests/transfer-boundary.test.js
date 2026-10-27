import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,reduce} from '../src/state.js';
import {CREATIVE_SAMPLES,BASIC_VARIETIES} from '../src/catalogue.js';
import {validateState} from '../src/storage.js';
const NOW=1792942800000;
const incoming=()=>({...CREATIVE_SAMPLES[0],id:'received',authorId:'friend',authorName:'Friend',rootId:'received',parentId:null});
test('receiving coercive or non-finite economics rejects atomically instead of poisoning coins or persistence',()=>{
 const s=createState(NOW,'boundary');for(const [field,value] of [['salePrice','28'],['seedPrice','18'],['growMs','90000'],['salePrice',NaN],['salePrice',Infinity],['seedPrice',18.5],['growMs',90000.5]]){
  const result=reduce(s,{type:'RECEIVE_SEED',variety:{...incoming(),[field]:value},transferId:`${field}:${value}`},NOW);
  assert.equal(result.ok,false,`${field}=${value} should not coerce`);assert.deepEqual(result.state,s);assert.equal(validateState(result.state),true);
 }
});
test('legal transferred seed remains save-valid throughout receiving planting and whole-plant sale',()=>{
 let s=createState(NOW,'save-valid');for(const [action,at] of [[{type:'RECEIVE_SEED',variety:incoming(),transferId:'valid'},NOW],[{type:'PLANT',tileId:'tile-0-0',varietyId:'received'},NOW]]){
  const r=reduce(s,action,at);assert.equal(r.ok,true,r.message);s=r.state;assert.equal(validateState(s),true);
 }
 const result=reduce(s,{type:'SELL',plantId:s.plants[0].id},s.plants[0].readyAt);assert.equal(result.ok,true);assert.equal(result.state.coins,120+incoming().salePrice);assert.equal(typeof result.state.coins,'number');assert.equal(validateState(result.state),true);
});
test('canonical basic seed propagation preserves its exact identity while forged attribution is rejected',()=>{
 const s=createState(NOW,'basic-copy'),base=BASIC_VARIETIES[0];
 const copied=reduce(s,{type:'RECEIVE_SEED',variety:{...base},transferId:'basic'},NOW);assert.equal(copied.ok,true);assert.equal(copied.state.inventory.radish,3);assert.equal(copied.state.varieties.radish.authorId,'garden-originals');assert.equal(validateState(copied.state),true);
 const forged=reduce(s,{type:'RECEIVE_SEED',variety:{...base,authorName:'Fake'},transferId:'forged'},NOW);assert.equal(forged.ok,false);
});
test('same immutable variety can arrive with different object key order without losing author identity',()=>{
 const s=createState(NOW,'order');const first=reduce(s,{type:'RECEIVE_SEED',variety:incoming(),transferId:'one'},NOW);assert.equal(first.ok,true);
 const reordered=Object.fromEntries(Object.entries(incoming()).reverse());const second=reduce(first.state,{type:'RECEIVE_SEED',variety:reordered,transferId:'two'},NOW);assert.equal(second.ok,true);assert.equal(second.state.inventory.received,2);
});
test('malformed incoming identities and impossible parent/root metadata are rejected before storage',()=>{
 for(const change of [{authorId:''},{authorName:[]},{name:'x'.repeat(181)},{rootId:null},{parentId:42},{kind:'anything'},{interaction:'remote-api'},{artKey:'untrusted-url'}]){
  const s=createState(NOW,'identity');assert.equal(reduce(s,{type:'RECEIVE_SEED',variety:{...incoming(),...change},transferId:'identity'},NOW).ok,false,JSON.stringify(change));
 }
});
test('receipt identifiers must be bounded strings so successful creation and transfer always remain save-valid',()=>{
 for(const id of [1,true,{},'x'.repeat(181),'']){
  const s=createState(NOW,'receipt');
  for(const action of [{type:'CREATE_VARIETY',sampleId:'cloud_lantern',requestId:id},{type:'RECEIVE_SEED',variety:{...BASIC_VARIETIES[0]},transferId:id}]){
   const r=reduce(s,action,NOW);assert.equal(r.ok,false,`${action.type} id ${JSON.stringify(id)}`);assert.deepEqual(r.state,s);assert.equal(validateState(r.state),true);
  }
 }
});

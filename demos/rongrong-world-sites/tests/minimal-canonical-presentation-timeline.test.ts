import test from 'node:test';
import assert from 'node:assert/strict';
import * as presentation from '../src/minimal/canonical-presentation.ts';
import {advanceCanonicalFarm} from '../src/minimal/authority.ts';
import {createMinimalState,minimalCommand} from '../src/minimal/model.ts';
import {createCreativeAnimal} from '../src/minimal/creative-lifecycle.ts';
import type {CanonicalFarm} from '../src/minimal/cloud-contract.ts';
const T=1_800_000_000_000;
function fixture(){const state=createMinimalState(T);state.player={x:1,z:1};state.animals.push(createCreativeAnimal({id:'poop',kind:'custom-creature',templateId:'poop-pal',name:'布丁',prompt:'',createdAt:T-120000,hatchedAt:T-120000,jobId:'job',origin:'mock',location:'ground',position:{x:1,z:2}})!);return {farmId:'farm-a',state:minimalCommand(state,{type:'move',to:{x:3,z:1}},T).state} as CanonicalFarm;}
test('online presentation projects persisted pose, not GET response time, on the exact bounded canonical timeline',()=>{
 assert.equal(typeof presentation.projectCanonicalState,'function','presentation needs a canonical timeline instead of resetting to raw persisted state');
 const farm=fixture(),unchanged=structuredClone(farm);
 for(const elapsed of [0,250,500,1500,2000,2250,5000,30000,60000,120000,300000]){
  const at=T+elapsed,actual=presentation.projectCanonicalState(farm.state,at,null);
  assert.deepEqual(actual,advanceCanonicalFarm(farm,at,null),`projection must match server at ${elapsed}ms including autonomous targets`);
 }
 assert.deepEqual(farm,unchanged,'projection cannot mutate authority');
});
test('250ms presentation samples never become the next timeline base or alter a later authoritative result',()=>{
 assert.equal(typeof presentation.projectCanonicalState,'function');const farm=fixture();
 let displayed=farm.state;for(let elapsed=250;elapsed<=60000;elapsed+=250)displayed=presentation.projectCanonicalState(farm.state,T+elapsed,null);
 assert.deepEqual(displayed,advanceCanonicalFarm(farm,T+60000,null));
 assert.deepEqual(presentation.projectCanonicalState(farm.state,T-1000,null),farm.state,'clock rollback cannot rewind persisted authority');
});

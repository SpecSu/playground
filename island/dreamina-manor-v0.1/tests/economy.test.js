import test from 'node:test';import assert from 'node:assert/strict';
import {ECONOMY,priceItem} from '../lib/game/economy.js';import {CATALOGUE,SPECIES_BY_ID} from '../lib/game/catalogue.js';import {rollProduct} from '../lib/game/random.js';
test('twenty distinct plants and twenty original fish, four species each tier',()=>{
 assert.equal(CATALOGUE.length,40);assert.equal(new Set(CATALOGUE.map(s=>s.id)).size,40);
 for(const kind of ['plant','fish'])for(let tier=1;tier<=5;tier++)assert.equal(CATALOGUE.filter(s=>s.kind===kind&&s.tier===tier).length,4);
});
test('every legal draw is one product, deterministic across refresh, no downgrade',()=>{
 for(let tier=1;tier<=5;tier++)for(let seed=0;seed<600;seed++){
  const item=rollProduct('fish',tier,seed,'same-id',123);
  assert.deepEqual(item,rollProduct('fish',tier,seed,'same-id',123));assert.equal(item.id,'same-id');assert.ok(item.tier>=tier&&item.tier<=Math.min(5,tier+1));assert.ok(!Array.isArray(item));
 }
});
test('giant price uses final physical size exactly once, gold is mutually exclusive',()=>{
 const s=SPECIES_BY_ID.radish;
 assert.equal(priceItem(s,s.standardSize*1.5,'giant'),Math.floor(s.baseValue*1.5));
 assert.equal(priceItem(s,s.standardSize,'gold'),Math.floor(s.baseValue*2.5));
 for(let seed=0;seed<2000;seed++)assert.ok(['normal','giant','gold'].includes(rollProduct('plant',1,seed,'x',0).mutation));
});
test('minimum ordinary size covers that tier input without special hidden refunds',()=>{
 for(const s of CATALOGUE)assert.ok(priceItem(s,s.standardSize*ECONOMY.ordinarySize[0],'normal')>ECONOMY.inputCosts[s.tier-1],s.id);
});
test('normal and gold have ordinary size; giant has one bounded size multiplier',()=>{
 const seen=new Set();for(let seed=0;seed<3000;seed++){
  const p=rollProduct('fish',3,seed,'x',0),ratio=p.finalSize/p.standardSize;seen.add(p.mutation);
  assert.ok(ratio>=(p.mutation==='giant'?.8*1.3:.8)-.0001);assert.ok(ratio<=(p.mutation==='giant'?1.2*1.3:1.2)+.0001);
 }assert.equal(seen.size,3);
});
